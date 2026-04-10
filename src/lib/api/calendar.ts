import { supabase } from "@/integrations/supabase/client";
import type { ContentItem } from "@/types/calendar";
import type { Database } from "@/integrations/supabase/types";
import { normalizeSocialPlatform, normalizeSocialStatus, SOCIAL_STATUS_DRAFT } from "@/types/social";

type PostRow = Database["public"]["Tables"]["posts"]["Row"];
type StoryRow = Database["public"]["Tables"]["stories"]["Row"];

export async function fetchScheduledCalendarEventsForUserInRange(
  workspaceId: string,
  startIso: string,
  endIso: string
): Promise<ContentItem[]> {
  const postsSelectWithRecurrence =
    "id, title, description, text, scheduled_at, status, platforms, type_of_post, image, video, pdf, account_type, tags, recurrence_frequency, recurrence_until";
  const postsSelectNoRecurrence =
    "id, title, description, text, scheduled_at, status, platforms, type_of_post, image, video, pdf, account_type, tags";

  const storiesSelectWithRecurrence =
    "id, title, description, text, scheduled_at, status, platforms, type_of_story, image, video, account_type, recurrence_frequency, recurrence_until";
  const storiesSelectNoRecurrence =
    "id, title, description, text, scheduled_at, status, platforms, type_of_story, image, video, account_type";

  const isMissingRecurrenceColumns = (err: unknown): boolean => {
    if (!err) return false;
    const e: any = err;
    const text = [
      e?.message,
      e?.details,
      e?.hint,
      e?.code,
      typeof err === "string" ? err : undefined,
      JSON.stringify(e),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      text.includes("recurrence_frequency") ||
      text.includes("recurrence_until") ||
      text.includes("does not exist") ||
      // PostgREST error code for unknown column
      text.includes("pgrst204")
    );
  };

  const fetchPosts = async (select: string) => {
    const { data, error } = await supabase
      .from("posts")
      .select(select)
      .eq("workspace_id", workspaceId)
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", startIso)
      .lte("scheduled_at", endIso);
    if (error) throw error;
    return data as unknown as PostRow[];
  };

  const fetchStories = async (select: string) => {
    const { data, error } = await supabase
      .from("stories")
      .select(select)
      .eq("workspace_id", workspaceId)
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", startIso)
      .lte("scheduled_at", endIso);
    if (error) throw error;
    return data as unknown as StoryRow[];
  };

  let posts: PostRow[] = [];
  let stories: StoryRow[] = [];

  // Retry per-table so one failure doesn't hide the other.
  try {
    posts = await fetchPosts(postsSelectWithRecurrence);
  } catch (err) {
    if (!isMissingRecurrenceColumns(err)) throw err;
    posts = await fetchPosts(postsSelectNoRecurrence);
  }

  try {
    stories = await fetchStories(storiesSelectWithRecurrence);
  } catch (err) {
    if (!isMissingRecurrenceColumns(err)) throw err;
    stories = await fetchStories(storiesSelectNoRecurrence);
  }

  const postIds = (posts || []).map((p) => p.id);
  const storyIds = (stories || []).map((s) => s.id);

  // Fetch publish job metadata for the selected scheduled content.
  // This lets the calendar show queued/publishing/retrying in addition to the content's base status.
  const [postJobsRes, storyJobsRes] = await Promise.all([
    postIds.length
      ? supabase
          .from("publish_jobs")
          .select("content_id, state, retry_count, last_error, run_at")
          .eq("workspace_id", workspaceId)
          .eq("content_type", "post")
          .in("content_id", postIds)
      : Promise.resolve({ data: [], error: null }),
    storyIds.length
      ? supabase
          .from("publish_jobs")
          .select("content_id, state, retry_count, last_error, run_at")
          .eq("workspace_id", workspaceId)
          .eq("content_type", "story")
          .in("content_id", storyIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (postJobsRes.error) throw postJobsRes.error;
  if (storyJobsRes.error) throw storyJobsRes.error;

  type PublishJobMeta = {
    content_id: string;
    state: string;
    retry_count: number | null;
    last_error: string | null;
    run_at: string;
  };

  const postJobById = new Map<string, PublishJobMeta>(
    ((postJobsRes.data || []) as PublishJobMeta[]).map((j) => [j.content_id, j])
  );
  const storyJobById = new Map<string, PublishJobMeta>(
    ((storyJobsRes.data || []) as PublishJobMeta[]).map((j) => [j.content_id, j])
  );

  const postEvents: ContentItem[] = (posts || []).map((p: PostRow) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    text: p.text,
    scheduled_at: p.scheduled_at!,
    kind: "post",
    status: normalizeSocialStatus(p.status) ?? SOCIAL_STATUS_DRAFT,
    platforms: (p.platforms || [])
      .map((pl) => normalizeSocialPlatform(pl))
      .filter((pl): pl is NonNullable<typeof pl> => Boolean(pl)),
    type_of_post: p.type_of_post || undefined,
    image: p.image,
    video: p.video,
    pdf: p.pdf,
    account_type: p.account_type,
    tags: p.tags,
    recurrence_frequency: (p as any).recurrence_frequency ?? "none",
    recurrence_until: (p as any).recurrence_until ?? null,
    ...(postJobById.get(p.id)
      ? {
          publish_job_state: postJobById.get(p.id)?.state as ContentItem["publish_job_state"],
          publish_retry_count: postJobById.get(p.id)?.retry_count ?? null,
          publish_last_error: postJobById.get(p.id)?.last_error ?? null,
          publish_run_at: postJobById.get(p.id)?.run_at ?? null,
        }
      : {}),
  }));

  const storyEvents: ContentItem[] = (stories || []).map((s: StoryRow) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    text: s.text,
    scheduled_at: s.scheduled_at!,
    kind: "story",
    status: normalizeSocialStatus(s.status) ?? SOCIAL_STATUS_DRAFT,
    platforms: (s.platforms || [])
      .map((pl) => normalizeSocialPlatform(pl))
      .filter((pl): pl is NonNullable<typeof pl> => Boolean(pl)),
    type_of_story: s.type_of_story || undefined,
    image: s.image,
    video: s.video,
    account_type: s.account_type,
    recurrence_frequency: (s as any).recurrence_frequency ?? "none",
    recurrence_until: (s as any).recurrence_until ?? null,
    ...(storyJobById.get(s.id)
      ? {
          publish_job_state: storyJobById.get(s.id)?.state as ContentItem["publish_job_state"],
          publish_retry_count: storyJobById.get(s.id)?.retry_count ?? null,
          publish_last_error: storyJobById.get(s.id)?.last_error ?? null,
          publish_run_at: storyJobById.get(s.id)?.run_at ?? null,
        }
      : {}),
  }));

  return [...postEvents, ...storyEvents];
}

export async function deleteCalendarEventForUser(
  workspaceId: string,
  id: string,
  kind: "post" | "story"
): Promise<void> {
  const { error } = await supabase
    .from(kind === "post" ? "posts" : "stories")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) throw error;
}

export async function rescheduleCalendarEventForUser(
  workspaceId: string,
  id: string,
  kind: "post" | "story",
  scheduledAtIso: string
): Promise<void> {
  const { error } = await supabase
    .from(kind === "post" ? "posts" : "stories")
    .update({ scheduled_at: scheduledAtIso })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) throw error;
}

