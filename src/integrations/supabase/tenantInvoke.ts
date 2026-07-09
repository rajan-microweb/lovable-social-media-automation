// Global tenant-header injector for supabase.functions.invoke.
// Wraps the original invoke method once, and dispatches the current
// active tenant IDs on every call.
import { supabase } from "@/integrations/supabase/client";

type Headers = Record<string, string>;

const state: { orgId: string | null; workspaceId: string | null; installed: boolean } = {
  orgId: null,
  workspaceId: null,
  installed: false,
};

export function setActiveTenantHeaders(orgId: string | null, workspaceId: string | null) {
  state.orgId = orgId;
  state.workspaceId = workspaceId;
  if (state.installed) return;
  state.installed = true;

  const functions = supabase.functions as unknown as {
    invoke: (name: string, options?: { body?: unknown; headers?: Headers; method?: string }) => Promise<any>;
  };
  const original = functions.invoke.bind(supabase.functions);

  functions.invoke = async (name: string, options: { body?: unknown; headers?: Headers; method?: string } = {}) => {
    const injected: Headers = { ...(options.headers ?? {}) };
    if (state.orgId && !injected["x-org-id"] && !injected["X-Org-Id"]) {
      injected["x-org-id"] = state.orgId;
    }
    if (state.workspaceId && !injected["x-workspace-id"] && !injected["X-Workspace-Id"]) {
      injected["x-workspace-id"] = state.workspaceId;
    }
    return original(name, { ...options, headers: injected });
  };
}
