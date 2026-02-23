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

    const { user_id, videoPrompt } = await req.json();

    if (!user_id || !videoPrompt) {
      return jsonResponse(errorResponse("Missing required fields: user_id and videoPrompt"), 400);
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

    console.log("[proxy-openai-start-video] Starting Sora video generation...");

    const createResponse = await fetch("https://api.openai.com/v1/videos", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sora-2",
        prompt: videoPrompt,
        size: "720x1280",
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error("[proxy-openai-start-video] Job creation error:", createResponse.status, errorText);
      return jsonResponse(errorResponse(`OpenAI API error: ${createResponse.status}`), 502);
    }

    const jobData = await createResponse.json();
    const jobId = jobData.id;

    if (!jobId) {
      return jsonResponse(errorResponse("No job ID returned from OpenAI"), 502);
    }

    console.log(`[proxy-openai-start-video] Job created: ${jobId}`);

    return jsonResponse(successResponse({ jobId, status: "processing" }));
  } catch (error) {
    console.error("[proxy-openai-start-video] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
