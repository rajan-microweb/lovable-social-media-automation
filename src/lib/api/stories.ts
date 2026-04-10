import { supabase } from "@/integrations/supabase/client";
import type { Story } from "@/types/story";
import type { SocialStatus } from "@/types/social";

export async function fetchStoriesForUser(workspaceId: string): Promise<Story[]> {
  const { data, error } = await supabase
    .from("stories")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as Story[];
}

export async function deleteStoryForUser(workspaceId: string, storyId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("delete-story", {
    body: { story_id: storyId, workspace_id: workspaceId },
  });

  if (error) throw error;
}

export async function bulkDeleteStories(workspaceId: string, storyIds: string[]): Promise<void> {
  const { error } = await supabase.functions.invoke("bulk-delete-stories", {
    body: { workspace_id: workspaceId, story_ids: storyIds },
  });

  if (error) throw error;
}

export async function bulkUpdateStories(
  workspaceId: string,
  storyIds: string[],
  updates: { status?: SocialStatus; scheduled_at?: string }
): Promise<void> {
  const { error } = await supabase.functions.invoke("bulk-update-stories", {
    body: { workspace_id: workspaceId, story_ids: storyIds, updates },
  });

  if (error) throw error;
}

import type { CalendarEventDetail } from "@/types/calendar";

export async function fetchScheduledStoriesForUserInRange(
  workspaceId: string,
  startIso: string,
  endIso: string
): Promise<CalendarEventDetail[]> {
  const { data, error } = await supabase
    .from("stories")
    .select(
      "id, title, description, text, scheduled_at, status, platforms, type_of_story, image, video, account_type"
    )
    .eq("workspace_id", workspaceId)
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
    kind: "story",
    status: s.status,
    platforms: s.platforms || [],
    type_of_story: s.type_of_story || undefined,
    image: s.image,
    video: s.video,
    account_type: s.account_type,
  })) as CalendarEventDetail[];
}
