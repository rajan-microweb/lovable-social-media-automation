import { resolveTenantContext, corsHeaders, jsonResponse } from "../_shared/tenantContext.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ctx = await resolveTenantContext(req, { requireWorkspace: true });
  if (!ctx.ok) return ctx.response;
  const { workspaceId, supabase } = ctx;

  try {
    const { story_ids } = await req.json();
    if (!Array.isArray(story_ids) || story_ids.length === 0) {
      return jsonResponse({ error: "story_ids must be a non-empty array" }, 400);
    }
    if (story_ids.length > 50) {
      return jsonResponse({ error: "Maximum 50 stories can be deleted at once" }, 400);
    }

    const { data: stories, error: fetchError } = await supabase
      .from("stories")
      .select("id, workspace_id, image, video")
      .in("id", story_ids);
    if (fetchError) return jsonResponse({ error: "Failed to verify story ownership" }, 500);

    const rows = stories ?? [];
    const unauthorized = rows.filter((s) => s.workspace_id !== workspaceId);
    if (unauthorized.length > 0 || rows.length !== story_ids.length) {
      return jsonResponse({ error: "You can only delete stories from the active workspace" }, 403);
    }

    const mediaFiles: string[] = [];
    rows.forEach((s) => {
      [s.image, s.video].forEach((url) => {
        if (url && url.includes("post-media")) {
          const m = url.match(/post-media\/(.+)/);
          if (m) mediaFiles.push(m[1]);
        }
      });
    });
    if (mediaFiles.length > 0) {
      await supabase.storage.from("post-media").remove(mediaFiles);
    }

    const { error: delErr } = await supabase
      .from("stories")
      .delete()
      .in("id", story_ids)
      .eq("workspace_id", workspaceId);
    if (delErr) return jsonResponse({ error: "Failed to delete stories" }, 500);

    await ctx.writeAudit("stories.bulk_delete", "stories", undefined, { count: story_ids.length });
    return jsonResponse({ success: true, deleted: story_ids.length });
  } catch (e) {
    console.error("bulk-delete-stories error:", e);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
