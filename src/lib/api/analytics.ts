import { supabase } from "@/integrations/supabase/client";
import type { SocialPlatform, SocialStatus } from "@/types/social";
import type { ContentKind } from "@/types/calendar";

export type PublishingVolumeRow = {
  kind: ContentKind;
  status: SocialStatus;
  platforms: SocialPlatform[] | null;
  scheduled_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

// Minimal, typed read model for Analytics "publishing volume" charts.
// UI is responsible for grouping (daily/weekly/monthly) and metric calculations.
export async function fetchPublishingVolumeRowsForWorkspace(
  workspaceId: string
): Promise<PublishingVolumeRow[]> {
  const [{ data: posts, error: postsError }, { data: stories, error: storiesError }] = await Promise.all([
    supabase
      .from("posts")
      .select("id,status,platforms,scheduled_at,created_at,updated_at")
      .eq("workspace_id", workspaceId),
    supabase
      .from("stories")
      .select("id,status,platforms,scheduled_at,created_at,updated_at")
      .eq("workspace_id", workspaceId),
  ]);

  if (postsError) throw postsError;
  if (storiesError) throw storiesError;

  const postRows = (posts ?? []) as Array<{
    status: SocialStatus;
    platforms: SocialPlatform[] | null;
    scheduled_at: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>;

  const storyRows = (stories ?? []) as Array<{
    status: SocialStatus;
    platforms: SocialPlatform[] | null;
    scheduled_at: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>;

  return [
    ...postRows.map((r) => ({
      kind: "post" as const,
      ...r,
    })),
    ...storyRows.map((r) => ({
      kind: "story" as const,
      ...r,
    })),
  ];
}

