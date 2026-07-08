// Shared tenant-context helper for edge functions.
//
// Usage:
//   const ctx = await resolveTenantContext(req);
//   if (!ctx.ok) return ctx.response;
//   const { user, orgId, workspaceId, supabase, requirePermission } = ctx;
//
// - `user` is verified against the caller's JWT.
// - `orgId` / `workspaceId` come from X-Org-Id / X-Workspace-Id headers and
//   are validated against membership. Never trust client-supplied values
//   without this validation.
// - `supabase` is a service-role client bound to the request (use sparingly;
//   RLS is bypassed).
// - `requirePermission(key)` throws a 403 Response if the caller lacks the
//   permission in the resolved org.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-workspace-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export interface TenantContextOk {
  ok: true;
  user: { id: string; email: string | null };
  orgId: string;
  workspaceId: string | null;
  supabase: SupabaseClient;
  requirePermission: (key: string) => Promise<void>;
  writeAudit: (action: string, resourceType?: string, resourceId?: string, meta?: unknown) => Promise<void>;
  logUsage: (metric: string, quantity?: number, meta?: unknown) => Promise<void>;
}

export interface TenantContextErr {
  ok: false;
  response: Response;
}

export type TenantContext = TenantContextOk | TenantContextErr;

class HttpError extends Error {
  constructor(public status: number, public body: unknown) {
    super(typeof body === "string" ? body : JSON.stringify(body));
  }
}

export async function resolveTenantContext(
  req: Request,
  opts: { requireWorkspace?: boolean } = {},
): Promise<TenantContext> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) {
      throw new HttpError(500, { error: "Server not configured" });
    }

    // Validate JWT via the anon client bound to the caller's token.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) throw new HttpError(401, { error: "Missing bearer token" });

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      throw new HttpError(401, { error: "Invalid session" });
    }
    const user = { id: userRes.user.id, email: userRes.user.email ?? null };

    // Service-role client for privileged reads/writes.
    const svc = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Read tenant headers.
    const orgIdHeader = req.headers.get("x-org-id");
    const workspaceIdHeader = req.headers.get("x-workspace-id");

    // Resolve org: prefer header, else fall back to user_context.
    let orgId = orgIdHeader;
    let workspaceId = workspaceIdHeader;

    if (!orgId || !workspaceId) {
      const { data: ctx } = await svc
        .from("user_context")
        .select("active_organization_id, active_workspace_id")
        .eq("user_id", user.id)
        .maybeSingle();
      orgId = orgId ?? ctx?.active_organization_id ?? null;
      workspaceId = workspaceId ?? ctx?.active_workspace_id ?? null;
    }

    if (!orgId) throw new HttpError(400, { error: "No active organization" });

    // Validate membership.
    const { data: member } = await svc
      .from("organization_members")
      .select("role, status")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!member) throw new HttpError(403, { error: "Not a member of this organization" });

    // Validate workspace belongs to org.
    if (workspaceId) {
      const { data: ws } = await svc
        .from("workspaces")
        .select("id, organization_id")
        .eq("id", workspaceId)
        .maybeSingle();
      if (!ws || ws.organization_id !== orgId) {
        workspaceId = null;
      }
    }
    if (opts.requireWorkspace && !workspaceId) {
      throw new HttpError(400, { error: "No active workspace" });
    }

    const requirePermission = async (key: string) => {
      const { data, error } = await svc.rpc("has_org_permission", {
        _user: user.id,
        _org: orgId!,
        _perm: key,
      });
      if (error) throw new HttpError(500, { error: `permission check failed: ${error.message}` });
      if (!data) throw new HttpError(403, { error: `Missing permission: ${key}` });
    };

    const writeAudit = async (
      action: string,
      resource_type?: string,
      resource_id?: string,
      meta?: unknown,
    ) => {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      const ua = req.headers.get("user-agent") ?? null;
      await svc.from("audit_logs").insert({
        organization_id: orgId,
        workspace_id: workspaceId,
        user_id: user.id,
        action,
        resource_type: resource_type ?? null,
        resource_id: resource_id ?? null,
        ip,
        user_agent: ua,
        meta: (meta as any) ?? {},
      });
    };

    const logUsage = async (metric: string, quantity = 1, meta?: unknown) => {
      await svc.from("usage_logs").insert({
        organization_id: orgId,
        workspace_id: workspaceId,
        user_id: user.id,
        metric,
        quantity,
        meta: (meta as any) ?? {},
      });
    };

    return {
      ok: true,
      user,
      orgId,
      workspaceId,
      supabase: svc,
      requirePermission,
      writeAudit,
      logUsage,
    };
  } catch (e) {
    if (e instanceof HttpError) {
      return { ok: false, response: jsonResponse(e.body, e.status) };
    }
    console.error("resolveTenantContext error:", e);
    return { ok: false, response: jsonResponse({ error: "Internal error" }, 500) };
  }
}
