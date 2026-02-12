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

    // Poll for completion (matches n8n workflow: GET /v1/videos/{id})
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const pollResponse = await fetch(
        `https://api.openai.com/v1/videos/${jobId}`,
        { headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" } }
      );

      if (!pollResponse.ok) {
        const errorText = await pollResponse.text();
        console.error("[proxy-openai-generate-video] Poll error:", pollResponse.status, errorText);
        continue;
      }

      const pollData = await pollResponse.json();
      console.log(`[proxy-openai-generate-video] Poll ${attempt + 1}: status=${pollData.status}`);

      if (pollData.status === "completed") {
        // Fetch the video content URL
        // The /content endpoint returns raw binary (MP4), so we use redirect: "manual"
        // to capture the redirect URL, or download and upload to storage
        console.log("[proxy-openai-generate-video] Completed, fetching content...");

        const contentResponse = await fetch(
          `https://api.openai.com/v1/videos/${jobId}/content`,
          {
            headers: { "Authorization": `Bearer ${openaiKey}` },
            redirect: "manual",
          }
        );

        // If we get a redirect, use the Location header as the video URL
        if (contentResponse.status >= 300 && contentResponse.status < 400) {
          const videoUrl = contentResponse.headers.get("Location");
          if (videoUrl) {
            console.log("[proxy-openai-generate-video] Got redirect URL");
            return jsonResponse(successResponse({ videoUrl }));
          }
        }

        // If direct binary response, upload to Supabase storage
        if (contentResponse.ok) {
          const contentType = contentResponse.headers.get("content-type") || "";

          // If it's JSON, try to extract a URL
          if (contentType.includes("application/json")) {
            const contentData = await contentResponse.json();
            const videoUrl = contentData.url || contentData.result?.url;
            if (videoUrl) {
              console.log("[proxy-openai-generate-video] Got URL from JSON response");
              return jsonResponse(successResponse({ videoUrl }));
            }
          }

          // It's raw video binary — upload to Supabase storage
          console.log("[proxy-openai-generate-video] Got raw binary, uploading to storage...");
          const videoBlob = await contentResponse.arrayBuffer();
          const fileName = `ai-video-${jobId}-${Date.now()}.mp4`;
          const filePath = `${user_id}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("post-media")
            .upload(filePath, videoBlob, {
              contentType: "video/mp4",
              upsert: false,
            });

          if (uploadError) {
            console.error("[proxy-openai-generate-video] Upload error:", uploadError.message);
            return jsonResponse(errorResponse(`Failed to upload video: ${uploadError.message}`), 502);
          }

          const { data: publicUrlData } = supabase.storage
            .from("post-media")
            .getPublicUrl(filePath);

          console.log("[proxy-openai-generate-video] Success, uploaded to storage");
          return jsonResponse(successResponse({ videoUrl: publicUrlData.publicUrl }));
        }

        // Content fetch failed
        const errorText = await contentResponse.text();
        console.error("[proxy-openai-generate-video] Content fetch error:", contentResponse.status, errorText.substring(0, 200));
        return jsonResponse(errorResponse(`Failed to fetch video content: ${contentResponse.status}`), 502);
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
