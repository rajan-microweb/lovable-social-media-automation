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

    const { user_id, jobId } = await req.json();

    if (!user_id || !jobId) {
      return jsonResponse(errorResponse("Missing required fields: user_id and jobId"), 400);
    }

    const supabase = createSupabaseClient();
    const { credentials, integration, error: credError } = await getDecryptedPlatformCredentials(
      supabase, user_id, "openai"
    );

    if (credError || !credentials || !integration) {
      return jsonResponse(errorResponse(credError || "OpenAI integration not found"), 404);
    }

    const openaiKey = (credentials.api_key || credentials.apiKey) as string;
    if (!openaiKey) {
      return jsonResponse(errorResponse("No OpenAI API key found in credentials"), 404);
    }

    // Read job metadata stored by proxy-openai-start-video
    const metadata = (integration.metadata as Record<string, unknown>) ?? {};
    const videoJobs = (metadata.video_jobs as Record<string, Record<string, unknown>>) ?? {};
    const jobMeta = videoJobs[jobId] ?? {};

    const storedModel = (jobMeta.model as string) ?? "sora-2";
    const storedCostUsd = (jobMeta.cost_usd as number) ?? null;
    const storedTokens = (jobMeta.tokens_used as { prompt: number; completion: number; total: number }) ?? { prompt: 0, completion: 0, total: 0 };

    const headers = {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    };

    console.log(`[proxy-openai-check-video] Checking job: ${jobId}`);

    const pollResponse = await fetch(
      `https://api.openai.com/v1/videos/${jobId}`,
      { headers }
    );

    if (!pollResponse.ok) {
      const errorText = await pollResponse.text();
      console.error("[proxy-openai-check-video] Poll error:", pollResponse.status, errorText);
      return jsonResponse(errorResponse(`OpenAI API error: ${pollResponse.status}`), 502);
    }

    const pollData = await pollResponse.json();
    console.log(`[proxy-openai-check-video] Status: ${pollData.status}`);

    if (pollData.status === "completed") {
      console.log("[proxy-openai-check-video] Completed, fetching content...");

      const contentResponse = await fetch(
        `https://api.openai.com/v1/videos/${jobId}/content`,
        {
          headers: { "Authorization": `Bearer ${openaiKey}` },
          redirect: "manual",
        }
      );

      // Redirect → use Location header as video URL
      if (contentResponse.status >= 300 && contentResponse.status < 400) {
        const videoUrl = contentResponse.headers.get("Location");
        if (videoUrl) {
          console.log("[proxy-openai-check-video] Got redirect URL");
          return jsonResponse(successResponse({
            status: "completed",
            videoUrl,
            model: storedModel,
            tokens_used: storedTokens,
            cost_usd: storedCostUsd,
          }));
        }
      }

      if (contentResponse.ok) {
        const contentType = contentResponse.headers.get("content-type") || "";

        // JSON response with URL
        if (contentType.includes("application/json")) {
          const contentData = await contentResponse.json();
          const videoUrl = contentData.url || contentData.result?.url;
          if (videoUrl) {
            console.log("[proxy-openai-check-video] Got URL from JSON");
            return jsonResponse(successResponse({
              status: "completed",
              videoUrl,
              model: storedModel,
              tokens_used: storedTokens,
              cost_usd: storedCostUsd,
            }));
          }
        }

        // Raw binary → upload to storage
        console.log("[proxy-openai-check-video] Got raw binary, uploading to storage...");
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
          console.error("[proxy-openai-check-video] Upload error:", uploadError.message);
          return jsonResponse(errorResponse(`Failed to upload video: ${uploadError.message}`), 502);
        }

        const { data: publicUrlData } = supabase.storage
          .from("post-media")
          .getPublicUrl(filePath);

        console.log("[proxy-openai-check-video] Uploaded to storage");
        return jsonResponse(successResponse({
          status: "completed",
          videoUrl: publicUrlData.publicUrl,
          model: storedModel,
          tokens_used: storedTokens,
          cost_usd: storedCostUsd,
        }));
      }

      const errorText = await contentResponse.text();
      console.error("[proxy-openai-check-video] Content fetch error:", contentResponse.status, errorText.substring(0, 200));
      return jsonResponse(errorResponse(`Failed to fetch video content: ${contentResponse.status}`), 502);
    }

    if (pollData.status === "failed") {
      return jsonResponse(successResponse({ status: "failed", error: "Video generation failed" }));
    }

    // Still processing
    return jsonResponse(successResponse({ status: "processing" }));
  } catch (error) {
    console.error("[proxy-openai-check-video] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
