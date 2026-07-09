import { resolveTenantContext, corsHeaders, jsonResponse } from "../_shared/tenantContext.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ctx = await resolveTenantContext(req, { requireWorkspace: true });
  if (!ctx.ok) return ctx.response;
  const { orgId, supabase } = ctx;

  try {
    const { story_ids, updates } = await req.json();
    if (!Array.isArray(story_ids) || story_ids.length === 0) {
      return jsonResponse({ error: "story_ids must be a non-empty array" }, 400);
    }
    if (story_ids.length > 50) {
      return jsonResponse({ error: "Maximum 50 stories can be updated at once" }, 400);
    }

    const { data: stories } = await supabase
      .from("stories")
      .select("id, organization_id")
      .in("id", story_ids);
    const rows = stories ?? [];
    if (rows.length !== story_ids.length || rows.some((s) => s.organization_id !== orgId)) {
      return jsonResponse({ error: "You can only update stories in the active workspace" }, 403);
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates?.status) updateData.status = updates.status;
    if (updates?.scheduled_at) updateData.scheduled_at = updates.scheduled_at;

    const { error } = await supabase
      .from("stories")
      .update(updateData)
      .in("id", story_ids)
      .eq("organization_id", orgId);
    if (error) return jsonResponse({ error: "Failed to update stories" }, 500);

    await ctx.writeAudit("stories.bulk_update", "stories", undefined, { count: story_ids.length, updates });
    return jsonResponse({ success: true, updated: story_ids.length });
  } catch (e) {
    console.error("bulk-update-stories error:", e);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
