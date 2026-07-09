// Update or remove a member in the caller's active organization.
// Actions: "set_role" | "remove"
// - Only OWNER can promote/demote OWNER or remove an OWNER.
// - Cannot remove the last OWNER.

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { resolveTenantContext, corsHeaders, jsonResponse } from "../_shared/tenantContext.ts";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_role"),
    user_id: z.string().uuid(),
    role: z.enum(["OWNER", "ADMIN", "MANAGER", "EDITOR", "VIEWER"]),
  }),
  z.object({ action: z.literal("remove"), user_id: z.string().uuid() }),
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ctx = await resolveTenantContext(req);
  if (!ctx.ok) return ctx.response;
  const { user, orgId, supabase } = ctx;

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e) {
    return jsonResponse({ error: "Invalid payload", details: String(e) }, 400);
  }

  const { data: callerIsAdmin } = await supabase.rpc("has_org_role", {
    _user: user.id, _org: orgId, _min: "ADMIN",
  });
  if (!callerIsAdmin) return jsonResponse({ error: "Only admins/owners can manage members" }, 403);

  const { data: callerIsOwner } = await supabase.rpc("has_org_role", {
    _user: user.id, _org: orgId, _min: "OWNER",
  });

  // Target current row.
  const { data: target } = await supabase
    .from("organization_members")
    .select("id, role, status")
    .eq("organization_id", orgId)
    .eq("user_id", parsed.user_id)
    .maybeSingle();
  if (!target) return jsonResponse({ error: "Member not found" }, 404);

  const ownerGuard = async () => {
    if (target.role === "OWNER") {
      // count remaining owners
      const { count } = await supabase
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("role", "OWNER")
        .eq("status", "active");
      if ((count ?? 0) <= 1) throw new Error("last-owner");
    }
  };

  if (parsed.action === "remove") {
    if (target.role === "OWNER" && !callerIsOwner) {
      return jsonResponse({ error: "Only owners can remove owners" }, 403);
    }
    try { await ownerGuard(); } catch { return jsonResponse({ error: "Cannot remove the last owner" }, 400); }
    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", target.id);
    if (error) return jsonResponse({ error: error.message }, 500);
    await ctx.writeAudit("org.member.remove", "organization_member", parsed.user_id);
    return jsonResponse({ success: true });
  }

  // set_role
  if ((parsed.role === "OWNER" || target.role === "OWNER") && !callerIsOwner) {
    return jsonResponse({ error: "Only owners can change owner roles" }, 403);
  }
  if (target.role === "OWNER" && parsed.role !== "OWNER") {
    try { await ownerGuard(); } catch { return jsonResponse({ error: "Cannot demote the last owner" }, 400); }
  }

  const { error } = await supabase
    .from("organization_members")
    .update({ role: parsed.role })
    .eq("id", target.id);
  if (error) return jsonResponse({ error: error.message }, 500);
  await ctx.writeAudit("org.member.set_role", "organization_member", parsed.user_id, { role: parsed.role });
  return jsonResponse({ success: true });
});
