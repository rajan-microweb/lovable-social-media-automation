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
  content_status?: string | null;
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
      ? supabase.from("posts").select("id, title, status").in("id", postIds)
      : Promise.resolve({ data: [] }),
    storyIds.length
      ? supabase.from("stories").select("id, title, status").in("id", storyIds)
      : Promise.resolve({ data: [] }),
  ]);

  const postDataById = new Map((posts || []).map((p) => [p.id, p]));
  const storyDataById = new Map((stories || []).map((s) => [s.id, s]));

  return safeJobs.map((job) => {
    if (job.content_type === "post") {
      const post = postDataById.get(job.content_id);
      return { 
        ...job, 
        title: post?.title ?? null, 
        content_missing: !post,
        content_status: post?.status ?? null
      };
    }

    const story = storyDataById.get(job.content_id);
    return { 
      ...job, 
      title: story?.title ?? null, 
      content_missing: !story,
      content_status: story?.status ?? null
    };
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

