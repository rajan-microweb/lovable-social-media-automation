import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setActiveTenantHeaders } from "@/integrations/supabase/tenantInvoke";
import { useNavigate } from "react-router-dom";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  orgId: string | null;
  workspaceId: string | null;
  needsOnboarding: boolean;
  refreshTenant: () => Promise<void>;
  setActiveTenant: (orgId: string, workspaceId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const navigate = useNavigate();

  const loadTenant = useCallback(async (userId: string) => {
    setTenantLoading(true);
    try {
      // 1. Read active context from profiles.
      const { data: ctx } = await supabase
        .from("profiles")
        .select("active_organization_id, active_workspace_id")
        .eq("id", userId)
        .maybeSingle();



      let activeOrg = ctx?.active_organization_id ?? null;
      let activeWs = ctx?.active_workspace_id ?? null;

      // 2. Fall back to first membership if no active context or context stale.
      if (!activeOrg) {
        const { data: mem } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        activeOrg = mem?.organization_id ?? null;
      }

      if (activeOrg && !activeWs) {
        const { data: ws } = await supabase
          .from("workspaces")
          .select("id")
          .eq("organization_id", activeOrg)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        activeWs = ws?.id ?? null;
      }

      setOrgId(activeOrg);
      setWorkspaceId(activeWs);
      setNeedsOnboarding(!activeOrg);
      setActiveTenantHeaders(activeOrg, activeWs);


      // 3. Admin flag = ADMIN or OWNER in the active org.
      if (activeOrg) {
        const { data: role } = await supabase
          .from("organization_members")
          .select("role")
          .eq("organization_id", activeOrg)
          .eq("user_id", userId)
          .maybeSingle();
        setIsAdmin(role?.role === "ADMIN" || role?.role === "OWNER");

        // Persist context if it wasn't set yet.
        if (!ctx?.active_organization_id || ctx?.active_workspace_id !== activeWs) {
          await supabase.from("profiles").update({
            active_organization_id: activeOrg,
            active_workspace_id: activeWs,
          }).eq("id", userId);
        }

      } else {
        setIsAdmin(false);
      }
    } catch (e) {
      console.error("loadTenant failed:", e);
      setOrgId(null);
      setWorkspaceId(null);
      setIsAdmin(false);
      setNeedsOnboarding(true);
    } finally {
      setTenantLoading(false);
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      if (s?.user) {
        setTimeout(() => { loadTenant(s.user.id); }, 0);
      } else {
        setOrgId(null);
        setWorkspaceId(null);
        setIsAdmin(false);
        setNeedsOnboarding(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      if (s?.user) loadTenant(s.user.id);
    });

    return () => subscription.unsubscribe();
  }, [loadTenant]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setOrgId(null);
    setWorkspaceId(null);
    setIsAdmin(false);
    setNeedsOnboarding(false);
    setActiveTenantHeaders(null, null);
    navigate("/auth");
  };

  const refreshTenant = useCallback(async () => {
    if (user) await loadTenant(user.id);
  }, [user, loadTenant]);

  const setActiveTenant = useCallback(async (nextOrg: string, nextWs: string) => {
    if (!user) return;
    await supabase.from("user_context").upsert({
      user_id: user.id,
      active_organization_id: nextOrg,
      active_workspace_id: nextWs,
    });
    await loadTenant(user.id);
  }, [user, loadTenant]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading: loading || tenantLoading,
        signOut,
        isAdmin,
        orgId,
        workspaceId,
        needsOnboarding,
        refreshTenant,
        setActiveTenant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
