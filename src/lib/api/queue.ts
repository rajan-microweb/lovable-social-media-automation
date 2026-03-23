import { supabase } from "@/integrations/supabase/client";

export type PublishJobState = "queued" | "publishing" | "published" | "failed" | "retrying";

export type PublishJobRow = {
  id: string;
  workspace_id: string;
  content_type: "post" | "story";
  content_id: string;
  state: PublishJobState | string;
  run_at: string;
  retry_count: number;
  last_error: string | null;
};

export type PublishJobView = PublishJobRow & {
  title?: string | null;
  content_missing?: boolean;
};

export async function fetchPublishJobsForWorkspace(workspaceId: string): Promise<PublishJobView[]> {
  const { data: jobs, error: jobsError } = await supabase
    .from("publish_jobs")
    .select("id, workspace_id, content_type, content_id, state, run_at, retry_count, last_error")
    .eq("workspace_id", workspaceId)
    .order("run_at", { ascending: true });

  if (jobsError) throw jobsError;

  const safeJobs = (jobs || []) as PublishJobRow[];

  const postIds = safeJobs.filter((j) => j.content_type === "post").map((j) => j.content_id);
  const storyIds = safeJobs.filter((j) => j.content_type === "story").map((j) => j.content_id);

  const [{ data: posts }, { data: stories }] = await Promise.all([
    postIds.length
      ? supabase.from("posts").select("id, title").in("id", postIds)
      : Promise.resolve({ data: [] }),
    storyIds.length
      ? supabase.from("stories").select("id, title").in("id", storyIds)
      : Promise.resolve({ data: [] }),
  ]);

  const postTitleById = new Map((posts || []).map((p) => [p.id, p.title]));
  const storyTitleById = new Map((stories || []).map((s) => [s.id, s.title]));

  return safeJobs.map((job) => {
    if (job.content_type === "post") {
      const has = postTitleById.has(job.content_id);
      const title = postTitleById.get(job.content_id) ?? null;
      return { ...job, title, content_missing: !has };
    }

    const has = storyTitleById.has(job.content_id);
    const title = storyTitleById.get(job.content_id) ?? null;
    return { ...job, title, content_missing: !has };
  });
}

export async function requeuePublishJob(
  jobId: string,
  params: { runAtIso?: string; clearLastError?: boolean } = {}
): Promise<void> {
  const runAtIso = params.runAtIso ?? new Date().toISOString();
  const clearLastError = params.clearLastError ?? false;

  const payload: Partial<Pick<PublishJobRow, "state" | "run_at" | "last_error">> = {
    state: "queued",
    run_at: runAtIso,
    ...(clearLastError ? { last_error: null } : {}),
  };

  const { error } = await supabase.from("publish_jobs").update(payload).eq("id", jobId);
  if (error) throw error;
}

