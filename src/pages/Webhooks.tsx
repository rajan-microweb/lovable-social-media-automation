import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Webhook, Trash2 } from "lucide-react";

interface Wh {
  id: string;
  url: string;
  events: string[] | null;
  active: boolean;
  created_at: string;
}

const AVAILABLE_EVENTS = ["post.published", "post.failed", "story.published", "approval.requested"];

export default function Webhooks() {
  const { orgId } = useAuth();
  const [hooks, setHooks] = useState<Wh[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("webhooks")
      .select("id, url, events, active, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setHooks((data ?? []) as Wh[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [orgId]);

  const create = async () => {
    if (!orgId || !url.trim() || !secret.trim()) return toast.error("URL and secret required");
    const { error } = await supabase.from("webhooks").insert({
      organization_id: orgId,
      url: url.trim(),
      secret: secret.trim(),
      events: AVAILABLE_EVENTS,
      active: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Webhook added");
    setUrl("");
    setSecret("");
    load();
  };

  const toggle = async (id: string, active: boolean) => {
    const { error } = await supabase.from("webhooks").update({ active }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this webhook?")) return;
    const { error } = await supabase.from("webhooks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Webhook className="h-6 w-6" /> Webhooks
          </h1>
          <p className="text-muted-foreground">Receive HTTP callbacks on organization events.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add endpoint</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="url">URL</Label>
              <Input id="url" placeholder="https://example.com/webhook" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="secret">Signing secret</Label>
              <Input
                id="secret"
                placeholder="A strong random string"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Used to compute an HMAC-SHA256 signature on every request.
              </p>
            </div>
            <Button onClick={create}>Add webhook</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Endpoints</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            ) : hooks.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No endpoints yet.</div>
            ) : (
              <div className="divide-y">
                {hooks.map((h) => (
                  <div key={h.id} className="p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{h.url}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1">
                        {(h.events ?? []).map((e) => (
                          <Badge key={e} variant="secondary">{e}</Badge>
                        ))}
                      </div>
                    </div>
                    <Switch checked={h.active} onCheckedChange={(v) => toggle(h.id, v)} />
                    <Button size="sm" variant="ghost" onClick={() => remove(h.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
