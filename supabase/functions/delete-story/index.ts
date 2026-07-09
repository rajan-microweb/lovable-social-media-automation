import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { resolveTenantContext, corsHeaders, jsonResponse } from "../_shared/tenantContext.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = req.headers.get("x-api-key");
  const expectedApiKey = Deno.env.get("N8N_API_KEY");
  const isApiKey = !!apiKey && apiKey === expectedApiKey;

  try {
    const body = await req.json();
    const story_id = body?.story_id;
    if (!story_id || !z.string().uuid().safeParse(story_id).success) {
      return jsonResponse({ error: "story_id is required" }, 400);
    }

    let orgId: string | null = null;
    let supabase;
    let writeAudit: undefined | ((a: string, r?: string, id?: string, m?: unknown) => Promise<void>);

    if (isApiKey) {
      // n8n path — require organization_id in body.
      const wid = body?.organization_id;
      if (!wid || !z.string().uuid().safeParse(wid).success) {
        return jsonResponse({ error: "organization_id is required for API key auth" }, 400);
      }
      orgId = wid;
      supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    } else {
      const ctx = await resolveTenantContext(req, { requireWorkspace: true });
      if (!ctx.ok) return ctx.response;
      orgId = ctx.orgId!;
      supabase = ctx.supabase;
      writeAudit = ctx.writeAudit;
    }

    const { data: story, error: fetchErr } = await supabase
      .from("stories")
      .select("organization_id")
      .eq("id", story_id)
      .maybeSingle();
    if (fetchErr) return jsonResponse({ error: "Error fetching story" }, 500);
    if (!story) return jsonResponse({ success: true, message: "Story already deleted" });
    if (story.organization_id !== orgId) {
      return jsonResponse({ error: "Unauthorized - wrong workspace" }, 403);
    }

    const { error } = await supabase
      .from("stories")
      .delete()
      .eq("id", story_id)
      .eq("organization_id", orgId);
    if (error) return jsonResponse({ error: error.message }, 500);

    if (writeAudit) await writeAudit("story.delete", "story", story_id);
    return jsonResponse({ success: true, message: "Story deleted successfully" });
  } catch (e) {
    console.error("delete-story error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
