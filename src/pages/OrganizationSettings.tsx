import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Org = {
  id: string;
  name: string;
  slug: string;
  timezone: string | null;
  country: string | null;
};

export default function OrganizationSettings() {
  const { orgId, isAdmin, refreshTenant } = useAuth();
  const [org, setOrg] = useState<Org | null>(null);
  const [name, setName] = useState("");
  const [tz, setTz] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id, name, slug, timezone, country")
        .eq("id", orgId)
        .maybeSingle();
      if (data) {
        setOrg(data as Org);
        setName(data.name);
        setTz(data.timezone ?? "UTC");
        setCountry(data.country ?? "");
      }
      setLoading(false);
    })();
  }, [orgId]);

  const save = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ name: name.trim(), timezone: tz, country: country || null })
        .eq("id", orgId);
      if (error) throw error;
      toast.success("Organization updated");
      await refreshTenant();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update organization");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold">Organization</h1>
          <p className="text-muted-foreground">General settings for {org?.name}.</p>
        </div>
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Country</Label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={2} disabled={!isAdmin} />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Input value={tz} onChange={(e) => setTz(e.target.value)} disabled={!isAdmin} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input value={org?.slug ?? ""} disabled />
            </div>
            <Button onClick={save} disabled={!isAdmin || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
