import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  createSupabaseClient,
  getDecryptedPlatformCredentials,
} from "../_shared/encryption.ts";

// Sora pricing per second of video (720p)
const SORA_PRICING: Record<string, number> = {
  "sora-2": 0.030,  // ~$0.03/second at 720p (estimated)
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

    const MODEL = "sora-2";
    console.log("[proxy-openai-start-video] Starting Sora video generation...");

    const createResponse = await fetch("https://api.openai.com/v1/videos", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
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

    const usedModel = jobData.model ?? MODEL;
    // Duration (seconds) may be returned; cost is estimated on completion
    const durationSeconds = jobData.duration ?? null;
    const estimatedCostUsd = durationSeconds
      ? Math.round((SORA_PRICING[usedModel] ?? 0.030) * durationSeconds * 1_000_000) / 1_000_000
      : null;

    return jsonResponse(successResponse({
      jobId,
      status: "processing",
      model: usedModel,
      tokens_used: { prompt: 0, completion: 0, total: 0 },
      cost_usd: estimatedCostUsd,
    }));
  } catch (error) {
    console.error("[proxy-openai-start-video] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
