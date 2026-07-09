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
  needsOnboarding: boolean;
  refreshTenant: () => Promise<void>;
  setActiveTenant: (orgId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const navigate = useNavigate();

  const loadTenant = useCallback(async (userId: string) => {
    setTenantLoading(true);
    try {
      const { data: ctx } = await supabase
        .from("profiles")
        .select("active_organization_id")
        .eq("id", userId)
        .maybeSingle();

      let activeOrg = ctx?.active_organization_id ?? null;

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

      setOrgId(activeOrg);
      setNeedsOnboarding(!activeOrg);
      setActiveTenantHeaders(activeOrg);

      if (activeOrg) {
        const { data: role } = await supabase
          .from("organization_members")
          .select("role")
          .eq("organization_id", activeOrg)
          .eq("user_id", userId)
          .maybeSingle();
        setIsAdmin(role?.role === "ADMIN" || role?.role === "OWNER");

        if (!ctx?.active_organization_id) {
          await supabase.from("profiles").update({
            active_organization_id: activeOrg,
          }).eq("id", userId);
        }
      } else {
        setIsAdmin(false);
      }
    } catch (e) {
      console.error("loadTenant failed:", e);
      setOrgId(null);
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
    setIsAdmin(false);
    setNeedsOnboarding(false);
    setActiveTenantHeaders(null);
    navigate("/auth");
  };

  const refreshTenant = useCallback(async () => {
    if (user) await loadTenant(user.id);
  }, [user, loadTenant]);

  const setActiveTenant = useCallback(async (nextOrg: string) => {
    if (!user) return;
    await supabase.from("profiles").update({
      active_organization_id: nextOrg,
    }).eq("id", user.id);
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
