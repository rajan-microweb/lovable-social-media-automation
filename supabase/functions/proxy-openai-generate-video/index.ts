import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  createSupabaseClient,
  getDecryptedPlatformCredentials,
} from "../_shared/encryption.ts";

const MAX_POLL_ATTEMPTS = 20; // ~5 minutes at 15s intervals
const POLL_INTERVAL_MS = 15_000;

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

    const headers = {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    };

    // Start video generation job
    console.log("[proxy-openai-generate-video] Starting Sora video generation...");

    const createResponse = await fetch("https://api.openai.com/v1/videos", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "sora-2",
        prompt: videoPrompt,
        size: "720x1280",
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error("[proxy-openai-generate-video] Job creation error:", createResponse.status, errorText);
      return jsonResponse(errorResponse(`OpenAI API error: ${createResponse.status}`), 502);
    }

    const jobData = await createResponse.json();
    const jobId = jobData.id;

    if (!jobId) {
      return jsonResponse(errorResponse("No job ID returned from OpenAI"), 502);
    }

    console.log(`[proxy-openai-generate-video] Job created: ${jobId}, polling...`);

    // Poll for completion
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const pollResponse = await fetch(
        `https://api.openai.com/v1/video/generations/jobs/${jobId}`,
        { headers: { "Authorization": `Bearer ${openaiKey}` } }
      );

      if (!pollResponse.ok) {
        const errorText = await pollResponse.text();
        console.error("[proxy-openai-generate-video] Poll error:", pollResponse.status, errorText);
        continue;
      }

      const pollData = await pollResponse.json();
      console.log(`[proxy-openai-generate-video] Poll ${attempt + 1}: status=${pollData.status}`);

      if (pollData.status === "completed") {
        const videoUrl = pollData.url || pollData.result?.url;
        if (!videoUrl) {
          return jsonResponse(errorResponse("Video completed but no URL found"), 502);
        }
        console.log("[proxy-openai-generate-video] Success");
        return jsonResponse(successResponse({ videoUrl }));
      }

      if (pollData.status === "failed") {
        return jsonResponse(errorResponse("Video generation failed"), 502);
      }
    }

    return jsonResponse(errorResponse("Video generation timed out after 5 minutes"), 504);
  } catch (error) {
    console.error("[proxy-openai-generate-video] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
