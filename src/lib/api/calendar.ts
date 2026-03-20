import { supabase } from "@/integrations/supabase/client";
import type { CalendarEventDetail } from "@/types/calendar";
import type { Database } from "@/integrations/supabase/types";
import { normalizeSocialPlatform, normalizeSocialStatus, SOCIAL_STATUS_DRAFT } from "@/types/social";

type PostRow = Database["public"]["Tables"]["posts"]["Row"];
type StoryRow = Database["public"]["Tables"]["stories"]["Row"];

export async function fetchScheduledCalendarEventsForUserInRange(
  userId: string,
  startIso: string,
  endIso: string
): Promise<CalendarEventDetail[]> {
  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select(
      "id, title, description, text, scheduled_at, status, platforms, type_of_post, image, video, pdf, account_type, tags"
    )
    .eq("user_id", userId)
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", startIso)
    .lte("scheduled_at", endIso);

  if (postsError) throw postsError;

  const { data: stories, error: storiesError } = await supabase
    .from("stories")
    .select(
      "id, title, description, text, scheduled_at, status, platforms, type_of_story, image, video, account_type"
    )
    .eq("user_id", userId)
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", startIso)
    .lte("scheduled_at", endIso);

  if (storiesError) throw storiesError;

  const postEvents: CalendarEventDetail[] = (posts || []).map((p: PostRow) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    text: p.text,
    scheduled_at: p.scheduled_at!,
    type: "post",
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
  }));

  const storyEvents: CalendarEventDetail[] = (stories || []).map((s: StoryRow) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    text: s.text,
    scheduled_at: s.scheduled_at!,
    type: "story",
    status: normalizeSocialStatus(s.status) ?? SOCIAL_STATUS_DRAFT,
    platforms: (s.platforms || [])
      .map((pl) => normalizeSocialPlatform(pl))
      .filter((pl): pl is NonNullable<typeof pl> => Boolean(pl)),
    type_of_story: s.type_of_story || undefined,
    image: s.image,
    video: s.video,
    account_type: s.account_type,
  }));

  return [...postEvents, ...storyEvents];
}

export async function deleteCalendarEventForUser(
  userId: string,
  id: string,
  type: "post" | "story"
): Promise<void> {
  const { error } = await supabase
    .from(type === "post" ? "posts" : "stories")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

