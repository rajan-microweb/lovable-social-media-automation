// Invite a user (by email) into the caller's active organization.
// - If the invitee already has a profile: upsert organization_members (active).
// - Else: create an organization_invitations row with a random token.

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { resolveTenantContext, corsHeaders, jsonResponse } from "../_shared/tenantContext.ts";

const bodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "EDITOR", "VIEWER"]).default("EDITOR"),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ctx = await resolveTenantContext(req);
  if (!ctx.ok) return ctx.response;
  const { user, orgId, supabase } = ctx;

  try {
    await ctx.requirePermission("members.invite").catch(async () => {
      // Fallback: OWNER/ADMIN can always invite even if permission catalog isn't seeded.
      const { data } = await supabase.rpc("has_org_role", {
        _user: user.id, _org: orgId, _min: "ADMIN",
      });
      if (!data) throw new Error("forbidden");
    });
  } catch {
    return jsonResponse({ error: "Only org admins/owners can invite members" }, 403);
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e) {
    return jsonResponse({ error: "Invalid payload", details: String(e) }, 400);
  }
  const email = parsed.email.toLowerCase();
  const role = parsed.role;

  // Only OWNER can grant OWNER.
  if (role === "OWNER") {
    const { data: isOwner } = await supabase.rpc("has_org_role", {
      _user: user.id, _org: orgId, _min: "OWNER",
    });
    if (!isOwner) return jsonResponse({ error: "Only owners can grant OWNER role" }, 403);
  }

  // Try to resolve an existing profile.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (profile) {
    const { error } = await supabase
      .from("organization_members")
      .upsert(
        {
          organization_id: orgId,
          user_id: profile.id,
          role,
          status: "active",
          invited_by: user.id,
        },
        { onConflict: "organization_id,user_id" },
      );
    if (error) return jsonResponse({ error: error.message }, 500);
    await ctx.writeAudit("org.member.upsert", "organization_member", profile.id, { role });
    return jsonResponse({ success: true, mode: "added", user_id: profile.id, role });
  }

  // Create pending invitation.
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { data: invite, error } = await supabase
    .from("organization_invitations")
    .insert({
      organization_id: orgId,
      email,
      role,
      token,
      invited_by: user.id,
    })
    .select("id, token, email, role, expires_at")
    .single();
  if (error) return jsonResponse({ error: error.message }, 500);

  await ctx.writeAudit("org.invitation.create", "organization_invitation", invite.id, { email, role });
  return jsonResponse({ success: true, mode: "invited", invitation: invite });
});
