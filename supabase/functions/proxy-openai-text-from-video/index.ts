import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  createSupabaseClient,
  getDecryptedPlatformCredentials,
} from "../_shared/encryption.ts";

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4.1":     { input: 2.00, output: 8.00 },
  "gpt-4o":      { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
};

function calcCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? { input: 0, output: 0 };
  return (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = validateApiKey(req);
    if (!authResult.valid) {
      return jsonResponse(errorResponse(authResult.error!), 401);
    }

    const { user_id, videoUrl, prompt } = await req.json();

    if (!user_id || !videoUrl) {
      return jsonResponse(errorResponse("Missing required fields: user_id and videoUrl"), 400);
    }

    const supabase = createSupabaseClient();
    const { credentials, error: credError } = await getDecryptedPlatformCredentials(
      supabase, user_id, "openai"
    );

    if (credError || !credentials) {
      return jsonResponse(errorResponse(credError || "OpenAI integration not found"), 404);
    }

    const openaiKey = (credentials.api_key || credentials.apiKey) as string;
    if (!openaiKey) {
      return jsonResponse(errorResponse("No OpenAI API key found in credentials"), 404);
    }

    const userPrompt = prompt || "Analyze this video and generate engaging social media content. Include a caption, description, hooks, and relevant hashtags.";

    const MODEL = "gpt-4o";
    console.log("[proxy-openai-text-from-video] Calling OpenAI Chat Completions API with video URL...");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: videoUrl } },
            ],
          },
        ],
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[proxy-openai-text-from-video] OpenAI error:", response.status, errorText);
      return jsonResponse(errorResponse(`OpenAI API error: ${response.status}`), 502);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || data.output_text || data.output?.[0]?.content?.[0]?.text;

    if (!text) {
      return jsonResponse(errorResponse("No content returned from OpenAI"), 502);
    }

    const usedModel = data.model ?? MODEL;
    const promptTokens = data.usage?.prompt_tokens ?? data.usage?.input_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? data.usage?.output_tokens ?? 0;
    const totalTokens = data.usage?.total_tokens ?? (promptTokens + completionTokens);
    const costUsd = calcCost(usedModel, promptTokens, completionTokens);

    console.log("[proxy-openai-text-from-video] Success");
    return jsonResponse(successResponse({
      text,
      model: usedModel,
      tokens_used: { prompt: promptTokens, completion: completionTokens, total: totalTokens },
      cost_usd: Math.round(costUsd * 1_000_000) / 1_000_000,
    }));
  } catch (error) {
    console.error("[proxy-openai-text-from-video] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
