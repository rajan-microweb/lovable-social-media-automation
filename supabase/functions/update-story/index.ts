import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { resolveTenantContext, corsHeaders, jsonResponse } from "../_shared/tenantContext.ts";

const updateStorySchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  text: z.string().max(10000).optional(),
  status: z.enum(["draft", "scheduled", "pending_approval", "published", "failed"]).optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
  type_of_story: z.string().max(100).nullable().optional(),
  platforms: z.array(z.string().max(50)).nullable().optional(),
  account_type: z.string().max(2000).nullable().optional(),
  image: z.string().max(2000).nullable().optional(),
  video: z.string().max(2000).nullable().optional(),
  recurrence_frequency: z.enum(["none", "weekly", "monthly"]).optional(),
  recurrence_until: z.string().datetime().nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
  published_at: z.string().nullable().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = req.headers.get("x-api-key");
  const expectedApiKey = Deno.env.get("N8N_API_KEY");
  const isApiKey = !!apiKey && apiKey === expectedApiKey;

  try {
    const body = await req.json();
    const { story_id, workspace_id: bodyWs, user_id: _u, ...rawUpdate } = body ?? {};

    if (!story_id || !z.string().uuid().safeParse(story_id).success) {
      return jsonResponse({ error: "story_id is required" }, 400);
    }

    const parsed = updateStorySchema.safeParse(rawUpdate);
    if (!parsed.success) {
      return jsonResponse({ error: "Invalid update data", details: parsed.error.errors }, 400);
    }

    let workspaceId: string | null = null;
    let supabase;
    let writeAudit: undefined | ((a: string, r?: string, id?: string, m?: unknown) => Promise<void>);

    if (isApiKey) {
      if (!bodyWs || !z.string().uuid().safeParse(bodyWs).success) {
        return jsonResponse({ error: "workspace_id is required for API key auth" }, 400);
      }
      workspaceId = bodyWs;
      supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    } else {
      const ctx = await resolveTenantContext(req, { requireWorkspace: true });
      if (!ctx.ok) return ctx.response;
      workspaceId = ctx.workspaceId!;
      supabase = ctx.supabase;
      writeAudit = ctx.writeAudit;
    }

    const { data: story, error: fetchErr } = await supabase
      .from("stories")
      .select("workspace_id")
      .eq("id", story_id)
      .single();
    if (fetchErr || !story) return jsonResponse({ error: "Story not found" }, 404);
    if (story.workspace_id !== workspaceId) {
      return jsonResponse({ error: "Unauthorized - wrong workspace" }, 403);
    }

    const { data, error } = await supabase
      .from("stories")
      .update(parsed.data)
      .eq("id", story_id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();
    if (error) return jsonResponse({ error: error.message }, 500);

    if (writeAudit) await writeAudit("story.update", "story", story_id, parsed.data);
    return jsonResponse({ success: true, data });
  } catch (e) {
    console.error("update-story error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
