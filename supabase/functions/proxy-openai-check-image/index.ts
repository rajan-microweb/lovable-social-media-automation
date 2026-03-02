import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  createSupabaseClient,
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

    // Read job status from platform_integrations.metadata
    const { data: integration, error: fetchError } = await supabase
      .from("platform_integrations")
      .select("metadata")
      .eq("user_id", user_id)
      .eq("platform_name", "openai")
      .single();

    if (fetchError || !integration) {
      return jsonResponse(errorResponse("OpenAI integration not found"), 404);
    }

    const metadata = (integration.metadata as Record<string, unknown>) ?? {};
    const imageJobs = (metadata.image_jobs as Record<string, Record<string, unknown>>) ?? {};
    const job = imageJobs[jobId];

    if (!job) {
      return jsonResponse(errorResponse(`Job ${jobId} not found`), 404);
    }

    const status = job.status as string;

    if (status === "completed") {
      return jsonResponse(successResponse({
        status: "completed",
        imageUrl: job.image_url as string,
        model: job.model ?? "dall-e-3",
        tokens_used: { prompt: 0, completion: 0, total: 0 },
        cost_usd: job.cost_usd ?? 0.04,
      }));
    }

    if (status === "failed") {
      return jsonResponse(successResponse({
        status: "failed",
        error: job.error ?? "Image generation failed",
      }));
    }

    // Still processing
    return jsonResponse(successResponse({ status: "processing" }));
  } catch (error) {
    console.error("[proxy-openai-check-image] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
