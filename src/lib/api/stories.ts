import { supabase } from "@/integrations/supabase/client";
import type { CalendarEventDetail } from "@/types/calendar";

export async function fetchScheduledStoriesForUserInRange(
  userId: string,
  startIso: string,
  endIso: string
): Promise<CalendarEventDetail[]> {
  const { data, error } = await supabase
    .from("stories")
    .select(
      "id, title, description, text, scheduled_at, status, platforms, type_of_story, image, video, account_type"
    )
    .eq("user_id", userId)
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", startIso)
    .lte("scheduled_at", endIso);

  if (error) throw error;

  return (data || []).map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    text: s.text,
    scheduled_at: s.scheduled_at!,
    type: "story",
    status: s.status,
    platforms: s.platforms || [],
    type_of_story: s.type_of_story || undefined,
    image: s.image,
    video: s.video,
    account_type: s.account_type,
  })) as CalendarEventDetail[];
}

export async function deleteStoryForUser(userId: string, storyId: string): Promise<void> {
  const { error } = await supabase
    .from("stories")
    .delete()
    .eq("id", storyId)
    .eq("user_id", userId);

  if (error) throw error;
}

