import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ensurePersonalWorkspace } from "@/lib/workspaces/ensurePersonalWorkspace";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  workspaceId: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (session?.user) {
          setTimeout(() => {
            checkAdminStatus(session.user.id);
          }, 0);
        } else {
          setIsAdmin(false);
          setWorkspaceId(null);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        checkAdminStatus(session.user.id);
        // MVP: active workspace defaults to personal workspace (= user id)
        setWorkspaceId(session.user.id);
        ensurePersonalWorkspace(session.user.id).catch((e) => {
          // Non-fatal: UI falls back to workspaceId=user.id, and RLS should still allow
          // the user to create the membership once they try to create content.
          console.error("Failed to ensure personal workspace:", e);
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdminStatus = async (userId: string) => {
    // Admin is derived from workspace_members (workspace-scoped roles).
    // MVP: active workspace defaults to personal workspace (= user id).
    const { data, error } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", userId)
      .eq("user_id", userId)
      .eq("role", "ADMIN")
      .maybeSingle();

    if (error) {
      console.error("Failed to check workspace admin status:", error);
      setIsAdmin(false);
      return;
    }

    setIsAdmin(!!data);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
    setWorkspaceId(null);
    navigate("/auth");
  };

  useEffect(() => {
    if (!user) return;
    const id = user.id;
    setWorkspaceId(id);
    ensurePersonalWorkspace(id).catch((e) => {
      console.error("Failed to ensure personal workspace:", e);
    });
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, isAdmin, workspaceId }}>
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
