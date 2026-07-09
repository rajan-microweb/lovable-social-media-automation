import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Building2 } from "lucide-react";

function slugify(v: string) {
  return v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export default function Onboarding() {
  const { user, loading, orgId, refreshTenant } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [tz, setTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
    if (!loading && orgId) navigate("/dashboard");
  }, [loading, user, orgId, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      toast.error("Organization name is required");
      return;
    }
    setSubmitting(true);
    try {
      const baseSlug = slugify(name) || `org-${user.id.slice(0, 8)}`;
      const slug = `${baseSlug}-${user.id.slice(0, 6)}`;

      // 1. Create organization
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .insert({
          name: name.trim(),
          slug,
          timezone: tz,
          country: country || null,
          owner_id: user.id,
        })
        .select("id")
        .single();
      if (orgErr) throw orgErr;

      // 2. Owner member is auto-created by trg_add_owner_as_member on organizations insert.

      // 3. Seed built-in role permissions
      await supabase.rpc("seed_org_role_permissions", { _org: org.id });

      // 4. Create default workspace
      const { data: ws, error: wsErr } = await supabase
        .from("workspaces")
        .insert({
          organization_id: org.id,
          name: "Default Workspace",
          slug: "default",
          is_default: true,
        } as any)
        .select("id")
        .single();
      if (wsErr) throw wsErr;

      // 5. Assign a Free subscription
      const { data: freePlan } = await supabase
        .from("plans")
        .select("id")
        .eq("code", "free")
        .maybeSingle();
      if (freePlan) {
        await supabase.from("subscriptions").insert({
          organization_id: org.id,
          plan_id: freePlan.id,
          status: "active",
        });
      }

      // 6. Set active context
      await supabase.from("profiles").update({
        active_organization_id: org.id,
        active_workspace_id: ws.id,
      }).eq("id", user.id);


      toast.success("Organization created!");
      await refreshTenant();
      navigate("/dashboard");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to create organization");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Create your organization</CardTitle>
          <CardDescription>
            Set up a workspace for your team. You can invite members and configure more later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Inc."
                maxLength={100}
                required
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="org-country">Country</Label>
                <Input
                  id="org-country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="US"
                  maxLength={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-tz">Timezone</Label>
                <Input
                  id="org-tz"
                  value={tz}
                  onChange={(e) => setTz(e.target.value)}
                  placeholder="UTC"
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create organization"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
