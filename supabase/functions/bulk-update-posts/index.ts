import { resolveTenantContext, corsHeaders, jsonResponse } from "../_shared/tenantContext.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ctx = await resolveTenantContext(req, { requireWorkspace: true });
  if (!ctx.ok) return ctx.response;
  const { workspaceId, supabase } = ctx;

  try {
    const { post_ids, updates } = await req.json();
    if (!Array.isArray(post_ids) || post_ids.length === 0) {
      return jsonResponse({ error: "post_ids must be a non-empty array" }, 400);
    }
    if (post_ids.length > 50) {
      return jsonResponse({ error: "Maximum 50 posts can be updated at once" }, 400);
    }

    const { data: posts } = await supabase
      .from("posts")
      .select("id, workspace_id")
      .in("id", post_ids);
    const rows = posts ?? [];
    if (rows.length !== post_ids.length || rows.some((p) => p.workspace_id !== workspaceId)) {
      return jsonResponse({ error: "You can only update posts in the active workspace" }, 403);
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates?.status) updateData.status = updates.status;
    if (updates?.scheduled_at) updateData.scheduled_at = updates.scheduled_at;

    const { error } = await supabase
      .from("posts")
      .update(updateData)
      .in("id", post_ids)
      .eq("workspace_id", workspaceId);
    if (error) return jsonResponse({ error: "Failed to update posts" }, 500);

    await ctx.writeAudit("posts.bulk_update", "posts", undefined, { count: post_ids.length, updates });
    return jsonResponse({ success: true, updated: post_ids.length });
  } catch (e) {
    console.error("bulk-update-posts error:", e);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
