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

    const { user_id, imageUrl, prompt } = await req.json();

    if (!user_id || !imageUrl) {
      return jsonResponse(errorResponse("Missing required fields: user_id and imageUrl"), 400);
    }

    const supabase = createSupabaseClient();
    const { credentials, error: credError } = await getDecryptedPlatformCredentials(
      supabase, user_id, "openai"
    );

    if (credError || !credentials) {
      return jsonResponse(errorResponse(credError || "OpenAI integration not found"), 404);
    }

    const openaiKey = (credentials.api_key || credentials.apiKey || credentials.key || credentials.openai_api_key) as string;
    if (!openaiKey) {
      console.error("[proxy-openai-text-from-image] Credential keys available:", Object.keys(credentials));
      return jsonResponse(errorResponse("No OpenAI API key found in credentials. Keys found: " + Object.keys(credentials).join(", ")), 404);
    }

    const userPrompt = prompt || "Analyze this image and generate engaging social media content. Include a caption, description, and relevant hashtags.";

    console.log("[proxy-openai-text-from-image] Calling OpenAI vision...");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[proxy-openai-text-from-image] OpenAI error:", response.status, errorText);
      return jsonResponse(errorResponse(`OpenAI API error: ${response.status}`), 502);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      return jsonResponse(errorResponse("No content returned from OpenAI"), 502);
    }

    console.log("[proxy-openai-text-from-image] Success");
    return jsonResponse(successResponse({ text }));
  } catch (error) {
    console.error("[proxy-openai-text-from-image] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
