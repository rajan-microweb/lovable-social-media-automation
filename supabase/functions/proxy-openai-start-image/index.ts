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

    const { user_id, imagePrompt } = await req.json();

    if (!user_id || !imagePrompt) {
      return jsonResponse(errorResponse("Missing required fields: user_id and imagePrompt"), 400);
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

    // Generate a unique job ID
    const jobId = crypto.randomUUID();

    // Store the pending job in platform_integrations.metadata
    const existingMetadata = (integration.metadata as Record<string, unknown>) ?? {};
    const imageJobs = (existingMetadata.image_jobs as Record<string, unknown>) ?? {};
    const updatedMetadata = {
      ...existingMetadata,
      image_jobs: {
        ...imageJobs,
        [jobId]: { status: "processing", created_at: new Date().toISOString() },
      },
    };

    await supabase
      .from("platform_integrations")
      .update({ metadata: updatedMetadata })
      .eq("id", integration.id);

    // Respond immediately with the jobId
    const immediateResponse = jsonResponse(successResponse({
      jobId,
      status: "processing",
      tokens_used: { prompt: 0, completion: 0, total: 0 },
      cost_usd: null,
    }));

    // Fire DALL-E call in the background
    const MODEL = "dall-e-3";
    const DALLE_COST = 0.040;

    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil(
      (async () => {
        try {
          console.log(`[proxy-openai-start-image] Background: generating image for job ${jobId}`);
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
              response_format: "url",
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[proxy-openai-start-image] OpenAI error: ${response.status}`, errorText);
            // Fetch fresh metadata before updating
            const { data: fresh } = await supabase
              .from("platform_integrations")
              .select("metadata")
              .eq("id", integration.id)
              .single();
            const freshMeta = (fresh?.metadata as Record<string, unknown>) ?? {};
            const freshJobs = (freshMeta.image_jobs as Record<string, unknown>) ?? {};
            await supabase
              .from("platform_integrations")
              .update({
                metadata: {
                  ...freshMeta,
                  image_jobs: {
                    ...freshJobs,
                    [jobId]: { status: "failed", error: `OpenAI error: ${response.status}`, updated_at: new Date().toISOString() },
                  },
                },
              })
              .eq("id", integration.id);
            return;
          }

          const data = await response.json();
          const imageUrl = data.data?.[0]?.url;

          if (!imageUrl) {
            throw new Error("No image URL returned from OpenAI");
          }

          const usedModel = data.model ?? MODEL;
          const costUsd = Math.round(DALLE_COST * 1_000_000) / 1_000_000;

          // Fetch fresh metadata before updating
          const { data: fresh2 } = await supabase
            .from("platform_integrations")
            .select("metadata")
            .eq("id", integration.id)
            .single();
          const freshMeta2 = (fresh2?.metadata as Record<string, unknown>) ?? {};
          const freshJobs2 = (freshMeta2.image_jobs as Record<string, unknown>) ?? {};

          await supabase
            .from("platform_integrations")
            .update({
              metadata: {
                ...freshMeta2,
                image_jobs: {
                  ...freshJobs2,
                  [jobId]: {
                    status: "completed",
                    image_url: imageUrl,
                    model: usedModel,
                    cost_usd: costUsd,
                    updated_at: new Date().toISOString(),
                  },
                },
              },
            })
            .eq("id", integration.id);

          console.log(`[proxy-openai-start-image] Job ${jobId} completed`);
        } catch (err) {
          console.error(`[proxy-openai-start-image] Background error for job ${jobId}:`, err);
          const { data: fresh3 } = await supabase
            .from("platform_integrations")
            .select("metadata")
            .eq("id", integration.id)
            .single();
          const freshMeta3 = (fresh3?.metadata as Record<string, unknown>) ?? {};
          const freshJobs3 = (freshMeta3.image_jobs as Record<string, unknown>) ?? {};
          await supabase
            .from("platform_integrations")
            .update({
              metadata: {
                ...freshMeta3,
                image_jobs: {
                  ...freshJobs3,
                  [jobId]: {
                    status: "failed",
                    error: err instanceof Error ? err.message : "Unknown error",
                    updated_at: new Date().toISOString(),
                  },
                },
              },
            })
            .eq("id", integration.id);
        }
      })()
    );

    return immediateResponse;
  } catch (error) {
    console.error("[proxy-openai-start-image] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
