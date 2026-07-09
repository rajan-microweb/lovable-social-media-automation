import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, MailCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export default function AcceptInvite() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { user, loading, refreshTenant } = useAuth();
  const [state, setState] = useState<"idle" | "accepting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Preserve intent through auth.
    if (!loading && !user) {
      sessionStorage.setItem("pending_invite_token", token);
      navigate("/auth", { replace: true });
    }
  }, [loading, user, token, navigate]);

  const accept = async () => {
    setState("accepting");
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("accept-org-invite", {
        body: { token },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error ?? "Failed");
      sessionStorage.removeItem("pending_invite_token");
      if (data?.organization_id) {
        // Switch tenant to newly joined org
        const { data: ws } = await supabase
          .from("workspaces")
          .select("id")
          .eq("organization_id", data.organization_id)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        await supabase.from("profiles").update({
          active_organization_id: data.organization_id,
          active_workspace_id: ws?.id ?? null,
        }).eq("id", user!.id);

        await refreshTenant();
      }
      setState("done");
      toast.success("You're in!");
      setTimeout(() => navigate("/dashboard", { replace: true }), 600);
    } catch (e: any) {
      setError(e.message ?? "Could not accept invitation");
      setState("error");
    }
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            {state === "error" ? (
              <ShieldAlert className="h-6 w-6 text-destructive" />
            ) : (
              <MailCheck className="h-6 w-6 text-primary" />
            )}
          </div>
          <CardTitle>Join organization</CardTitle>
          <CardDescription>
            You've been invited to join an organization. Accept below to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          <Button className="w-full" onClick={accept} disabled={state === "accepting" || state === "done"}>
            {state === "accepting" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {state === "done" ? "Joined!" : "Accept invitation"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>
            Cancel
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
