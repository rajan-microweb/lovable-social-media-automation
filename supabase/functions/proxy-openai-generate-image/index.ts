import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  createSupabaseClient,
  getDecryptedPlatformCredentials,
} from "../_shared/encryption.ts";

// DALL-E 3 pricing: per image (1024x1024 standard = $0.040)
const DALLE_PRICING: Record<string, number> = {
  "dall-e-3": 0.040,
  "dall-e-2": 0.020,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = validateApiKey(req);
    if (!authResult.valid) {
      return jsonResponse(errorResponse(authResult.error!), 401);
    }

    const { user_id, imagePrompt } = await req.json();

    if (!user_id || !imagePrompt) {
      return jsonResponse(errorResponse("Missing required fields: user_id and imagePrompt"), 400);
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

    const MODEL = "dall-e-3";
    console.log("[proxy-openai-generate-image] Calling OpenAI image generation...");

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        prompt: imagePrompt,
        n: 1,
        size: "1024x1024",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[proxy-openai-generate-image] OpenAI error:", response.status, errorText);
      return jsonResponse(errorResponse(`OpenAI API error: ${response.status}`), 502);
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;

    if (!imageUrl) {
      return jsonResponse(errorResponse("No image URL returned from OpenAI"), 502);
    }

    const usedModel = data.model ?? MODEL;
    const imagesGenerated = data.data?.length ?? 1;
    const costUsd = (DALLE_PRICING[usedModel] ?? 0.040) * imagesGenerated;

    console.log("[proxy-openai-generate-image] Success");
    return jsonResponse(successResponse({
      imageUrl,
      model: usedModel,
      tokens_used: { prompt: 0, completion: 0, total: 0 }, // image models don't use tokens
      cost_usd: Math.round(costUsd * 1_000_000) / 1_000_000,
    }));
  } catch (error) {
    console.error("[proxy-openai-generate-image] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
