import { supabase } from "@/integrations/supabase/client";
import type { Post } from "@/types/post";
import type { SocialStatus } from "@/types/social";

export async function fetchPostsForUser(orgId: string): Promise<Post[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as Post[];
}

export async function deletePostForUser(orgId: string, postId: string): Promise<void> {
  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("organization_id", orgId);

  if (error) throw error;
}

export async function bulkDeletePosts(orgId: string, postIds: string[]): Promise<void> {
  const { error } = await supabase.functions.invoke("bulk-delete-posts", {
    body: { post_ids: postIds },
  });

  if (error) throw error;
}

export async function bulkUpdatePosts(
  orgId: string,
  postIds: string[],
  updates: { status?: SocialStatus; scheduled_at?: string }
): Promise<void> {
  const { error } = await supabase.functions.invoke("bulk-update-posts", {
    body: { post_ids: postIds, updates },
  });

  if (error) throw error;
}
