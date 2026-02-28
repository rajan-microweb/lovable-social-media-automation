import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  createSupabaseClient,
  getDecryptedPlatformCredentials,
} from "../_shared/encryption.ts";

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

    console.log("[proxy-openai-text-from-video] Calling OpenAI Responses API with video...");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: userPrompt },
              { type: "input_video", video_url: videoUrl },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[proxy-openai-text-from-video] OpenAI error:", response.status, errorText);
      return jsonResponse(errorResponse(`OpenAI API error: ${response.status}`), 502);
    }

    const data = await response.json();
    const text = data.output_text || data.output?.[0]?.content?.[0]?.text;

    if (!text) {
      return jsonResponse(errorResponse("No content returned from OpenAI"), 502);
    }

    console.log("[proxy-openai-text-from-video] Success");
    return jsonResponse(successResponse({ text }));
  } catch (error) {
    console.error("[proxy-openai-text-from-video] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
