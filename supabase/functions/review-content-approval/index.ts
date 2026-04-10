import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const reviewApprovalSchema = z.object({
  workspace_id: z.string().uuid().optional(), // ignored, derived from reviewer
  content_type: z.enum(["post", "story"]),
  content_id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(2000).optional().nullable(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Approval actions are driven from the authenticated frontend.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Missing bearer token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reviewerId = authUser.user.id;
    const body = await req.json().catch(() => ({}));
    const parsed = reviewApprovalSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request body", details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { content_type, content_id, decision, note } = parsed.data;

    // workspace_id = reviewer's user_id for personal workspaces
    const workspace_id = reviewerId;

    // Enforce workspace admin-only reviews.
    const { data: adminMembership, error: membershipError } = await supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", reviewerId)
      .eq("role", "ADMIN")
      .maybeSingle();

    if (membershipError) {
      return new Response(
        JSON.stringify({ error: "Failed to verify workspace membership" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!adminMembership) {
      return new Response(
        JSON.stringify({ error: "Forbidden - Only workspace admins can review approvals" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const table = content_type === "post" ? "posts" : "stories";

    // Load the content and validate it's pending approval.
    const { data: contentRow, error: contentError } = await supabaseAdmin
      .from(table)
      .select("id,status,workspace_id,scheduled_at,user_id,recurrence_frequency,recurrence_until")
      .eq("id", content_id)
      .maybeSingle();

    if (contentError || !contentRow) {
      return new Response(
        JSON.stringify({ error: "Content not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (contentRow.workspace_id !== workspace_id) {
      return new Response(
        JSON.stringify({ error: "Content does not belong to the provided workspace" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (contentRow.status !== "pending_approval") {
      return new Response(
        JSON.stringify({ error: `Content is not pending approval (status=${contentRow.status})` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const nowIso = new Date().toISOString();
    const newContentStatus = decision === "approved" ? "scheduled" : "draft";

    // For rejected content we clear schedule fields so it won't show up on the calendar.
    const updatePayload =
      decision === "approved"
        ? { status: newContentStatus }
        : {
            status: newContentStatus,
            scheduled_at: null,
            recurrence_frequency: "none",
            recurrence_until: null,
          };

    if (decision === "approved" && !contentRow.scheduled_at) {
      return new Response(
        JSON.stringify({ error: "Cannot approve content without scheduled_at" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update content status (this also triggers publish_jobs + approvals sync).
    const { error: updateContentError } = await supabaseAdmin
      .from(table)
      .update(updatePayload)
      .eq("id", content_id)
      .eq("workspace_id", workspace_id);

    if (updateContentError) {
      return new Response(
        JSON.stringify({ error: updateContentError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the approvals row with the reviewed outcome.
    const approvalStatus = decision === "approved" ? "approved" : "rejected";
    const requestedBy = contentRow.user_id;

    await supabaseAdmin
      .from("content_approvals")
      .upsert(
        {
          workspace_id,
          content_type,
          content_id,
          approval_status: approvalStatus,
          requested_by: requestedBy,
          reviewed_by: reviewerId,
          reviewed_at: nowIso,
          note: note ?? null,
        },
        { onConflict: "content_type,content_id" }
      );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[review-content-approval]", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

