import { resolveTenantContext, corsHeaders, jsonResponse } from "../_shared/tenantContext.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ctx = await resolveTenantContext(req, { requireWorkspace: true });
  if (!ctx.ok) return ctx.response;
  const { orgId, supabase } = ctx;

  try {
    const { post_ids } = await req.json();
    if (!Array.isArray(post_ids) || post_ids.length === 0) {
      return jsonResponse({ error: "post_ids must be a non-empty array" }, 400);
    }
    if (post_ids.length > 50) {
      return jsonResponse({ error: "Maximum 50 posts can be deleted at once" }, 400);
    }

    // Verify all posts belong to the active workspace.
    const { data: posts, error: fetchError } = await supabase
      .from("posts")
      .select("id, organization_id, image, video, pdf")
      .in("id", post_ids);
    if (fetchError) return jsonResponse({ error: "Failed to verify post ownership" }, 500);

    if (!posts || posts.length === 0) {
      return jsonResponse({ success: true, deleted: 0, message: "Posts already deleted or not found" });
    }

    const unauthorized = posts.filter((p) => p.organization_id !== orgId);
    if (unauthorized.length > 0 || posts.length !== post_ids.length) {
      return jsonResponse({ error: "You can only delete posts from the active workspace" }, 403);
    }

    // Cleanup media files.
    const mediaFiles: string[] = [];
    posts.forEach((p) => {
      [p.image, p.video, p.pdf].forEach((url) => {
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
      .from("posts")
      .delete()
      .in("id", post_ids)
      .eq("organization_id", orgId);
    if (delErr) return jsonResponse({ error: "Failed to delete posts" }, 500);

    await ctx.writeAudit("posts.bulk_delete", "posts", undefined, { count: post_ids.length });
    return jsonResponse({ success: true, deleted: post_ids.length });
  } catch (e) {
    console.error("bulk-delete-posts error:", e);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
