// Accept an organization invitation by token. Caller must be authenticated;
// the invite's email must match the caller's email (case-insensitive).

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/tenantContext.ts";

const bodySchema = z.object({ token: z.string().min(16) });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return jsonResponse({ error: "Missing bearer token" }, 401);

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes.user) return jsonResponse({ error: "Invalid session" }, 401);
  const user = userRes.user;

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e) {
    return jsonResponse({ error: "Invalid payload", details: String(e) }, 400);
  }

  const svc = createClient(url, service, { auth: { persistSession: false } });
  const { data: invite } = await svc
    .from("organization_invitations")
    .select("id, organization_id, email, role, expires_at, accepted_at")
    .eq("token", parsed.token)
    .maybeSingle();

  if (!invite) return jsonResponse({ error: "Invitation not found" }, 404);
  if (invite.accepted_at) return jsonResponse({ error: "Invitation already used" }, 409);
  if (new Date(invite.expires_at) < new Date()) return jsonResponse({ error: "Invitation expired" }, 410);
  if ((user.email ?? "").toLowerCase() !== invite.email.toLowerCase()) {
    return jsonResponse({ error: "Invitation is for a different email" }, 403);
  }

  const { error: memberErr } = await svc
    .from("organization_members")
    .upsert(
      {
        organization_id: invite.organization_id,
        user_id: user.id,
        role: invite.role,
        status: "active",
      },
      { onConflict: "organization_id,user_id" },
    );
  if (memberErr) return jsonResponse({ error: memberErr.message }, 500);

  await svc
    .from("organization_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  return jsonResponse({ success: true, organization_id: invite.organization_id, role: invite.role });
});
