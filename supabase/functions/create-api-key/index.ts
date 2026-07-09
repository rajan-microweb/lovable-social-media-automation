import { corsHeaders, jsonResponse, successResponse, errorResponse, createSupabaseClient } from "../_shared/encryption.ts";

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(errorResponse("Unauthorized"), 401);
    }
    const token = authHeader.slice("Bearer ".length);
    const supabase = createSupabaseClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return jsonResponse(errorResponse("Unauthorized"), 401);
    const user = userData.user;

    const orgId = req.headers.get("x-org-id");
    if (!orgId) return jsonResponse(errorResponse("Missing org context"), 400);

    // Permission check: must be admin/owner
    const { data: member } = await supabase
      .from("organization_members")
      .select("role, status")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member || member.status !== "active" || !["OWNER", "ADMIN"].includes(member.role as string)) {
      return jsonResponse(errorResponse("Forbidden"), 403);
    }

    const { name } = await req.json();
    if (!name || typeof name !== "string") return jsonResponse(errorResponse("Name required"), 400);

    const raw = `sk_live_${randomKey()}`;
    const prefix = raw.slice(0, 12);
    const hashed = await sha256(raw);

    const { data: inserted, error: insertErr } = await supabase
      .from("api_keys")
      .insert({
        organization_id: orgId,
        name,
        key_prefix: prefix,
        hashed_key: hashed,
        scopes: ["read", "write"],
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insertErr) return jsonResponse(errorResponse(insertErr.message), 500);

    await supabase.from("audit_logs").insert({
      organization_id: orgId,
      user_id: user.id,
      action: "api_key.created",
      resource_type: "api_key",
      resource_id: inserted.id,
      meta: { name },
    });

    return jsonResponse(successResponse({ api_key: raw, id: inserted.id }));
  } catch (e) {
    return jsonResponse(errorResponse(e instanceof Error ? e.message : "Unknown error"), 500);
  }
});
