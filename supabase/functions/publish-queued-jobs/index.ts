import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  createSupabaseClient,
} from "../_shared/encryption.ts";

const publishWorkerRequestSchema = z.object({
  // Max number of publish jobs to process per run.
  limit: z.number().int().positive().max(50).optional(),
});

function parseEnvInt(name: string, fallback: number): number {
  const v = Deno.env.get(name);
  if (!v) return fallback;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function computeBackoffDelayMs(params: {
  retryCount: number; // 0-based previous retry count
  baseDelayMs: number;
  maxDelayMs: number;
}): number {
  // retryCount=0 -> next retry after baseDelayMs
  const nextAttemptIndex = params.retryCount + 1;
  const delay = params.baseDelayMs * 2 ** (nextAttemptIndex - 1);
  return Math.min(delay, params.maxDelayMs);
}

async function attemptPublishMock(params: {
  contentType: "post" | "story";
  retryCount: number;
}): Promise<void> {
  // Publishing integration is intentionally stubbed for now.
  // Use env var to simulate failures and validate the retry/backoff pipeline.
  const mode = (Deno.env.get("PUBLISH_JOBS_SIMULATE_FAILURE_MODE") ?? "none").toLowerCase();

  if (mode === "always") {
    throw new Error("Simulated publish failure (mode=always)");
  }

  if (mode === "first_attempt" && params.retryCount === 0) {
    throw new Error("Simulated publish failure on first attempt (mode=first_attempt)");
  }

  // Default: succeed.
  void params.contentType;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate requests (cron/n8n should set x-api-key).
    const authResult = validateApiKey(req);
    if (!authResult.valid) {
      return jsonResponse(errorResponse(authResult.error ?? "Unauthorized"), 401);
    }

    const bodyJson = await req.json().catch(() => ({}));
    const body = publishWorkerRequestSchema.parse(bodyJson);

    const supabase = createSupabaseClient();
    const now = new Date();
    const nowIso = now.toISOString();

    const limit = body.limit ?? parseEnvInt("PUBLISH_JOBS_PER_RUN", 10);
    const maxRetries = parseEnvInt("PUBLISH_MAX_RETRIES", 5);
    const baseDelayMs = parseEnvInt("PUBLISH_BACKOFF_BASE_MS", 60_000);
    const maxDelayMs = parseEnvInt("PUBLISH_BACKOFF_MAX_MS", 3_600_000);

    const { data: dueJobs, error: dueJobsError } = await supabase
      .from("publish_jobs")
      .select("id, workspace_id, content_type, content_id, state, run_at, retry_count, last_error")
      .in("state", ["queued", "retrying"])
      .lte("run_at", nowIso)
      .order("run_at", { ascending: true })
      .limit(limit);

    if (dueJobsError) {
      return jsonResponse(errorResponse(`Failed to fetch due publish jobs: ${dueJobsError.message}`), 500);
    }

    const results = {
      processed: dueJobs?.length ?? 0,
      succeeded: 0,
      failed: 0,
      retried: 0,
      skipped: 0,
    };

    for (const job of dueJobs ?? []) {
      const claimedIso = new Date().toISOString();

      // Claim the job: switch it to "publishing" only if it is still due.
      const { data: claimedRows, error: claimError } = await supabase
        .from("publish_jobs")
        .update({
          state: "publishing",
          updated_at: claimedIso,
        })
        .eq("id", job.id)
        .eq("workspace_id", job.workspace_id)
        .in("state", ["queued", "retrying"])
        .lte("run_at", nowIso)
        .select("id")
        .maybeSingle();

      if (claimError) {
        // Keep processing other jobs; this claim is best-effort.
        console.error("[publish-queued-jobs] Claim error:", claimError);
        results.failed += 1;
        continue;
      }

      if (!claimedRows) {
        results.skipped += 1;
        continue;
      }

      try {
        await attemptPublishMock({
          contentType: job.content_type as "post" | "story",
          retryCount: job.retry_count ?? 0,
        });

        // Success: update job + content status.
        await Promise.all([
          supabase.from("publish_jobs").update({
            state: "published",
            last_error: null,
            updated_at: claimedIso,
          }).eq("id", job.id),
          job.content_type === "post"
            ? supabase.from("posts").update({ status: "published", updated_at: claimedIso }).eq("id", job.content_id).eq("workspace_id", job.workspace_id)
            : supabase.from("stories").update({ status: "published", updated_at: claimedIso }).eq("id", job.content_id).eq("workspace_id", job.workspace_id),
        ]);

        results.succeeded += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const prevRetryCount = job.retry_count ?? 0;
        const nextRetryCount = prevRetryCount + 1;

        if (nextRetryCount <= maxRetries) {
          const delayMs = computeBackoffDelayMs({
            retryCount: prevRetryCount,
            baseDelayMs,
            maxDelayMs,
          });
          const nextRunAt = new Date(now.getTime() + delayMs).toISOString();

          await supabase.from("publish_jobs").update({
            state: "retrying",
            retry_count: nextRetryCount,
            run_at: nextRunAt,
            last_error: message.slice(0, 2000),
            updated_at: claimedIso,
          }).eq("id", job.id);

          // Keep content status as "scheduled" during retries so publish_jobs isn't removed by triggers.
          results.retried += 1;
        } else {
          // Final failure: update job + content.
          await Promise.all([
            supabase.from("publish_jobs").update({
              state: "failed",
              retry_count: nextRetryCount,
              last_error: message.slice(0, 2000),
              updated_at: claimedIso,
            }).eq("id", job.id),
            job.content_type === "post"
              ? supabase
                  .from("posts")
                  .update({ status: "failed", updated_at: claimedIso })
                  .eq("id", job.content_id)
                  .eq("workspace_id", job.workspace_id)
              : supabase
                  .from("stories")
                  .update({ status: "failed", updated_at: claimedIso })
                  .eq("id", job.content_id)
                  .eq("workspace_id", job.workspace_id),
          ]);

          results.failed += 1;
        }
      }
    }

    return jsonResponse(successResponse(results));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[publish-queued-jobs] Fatal error:", message);
    return jsonResponse(errorResponse(message), 500);
  }
});

