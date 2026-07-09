import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { KeyRound, Copy, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[] | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export default function ApiKeys() {
  const { orgId } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, scopes, last_used_at, revoked_at, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setKeys((data ?? []) as ApiKey[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [orgId]);

  const createKey = async () => {
    if (!name.trim()) return toast.error("Give the key a name");
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("create-api-key", { body: { name: name.trim() } });
    setCreating(false);
    if (error || !data?.success) {
      toast.error(error?.message || data?.error || "Failed to create key");
      return;
    }
    setNewKey(data.data.api_key);
    setName("");
    load();
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this key? Requests using it will start failing.")) return;
    const { error } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Key revoked");
    load();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <KeyRound className="h-6 w-6" /> API Keys
          </h1>
          <p className="text-muted-foreground">Programmatic access to your organization.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create new key</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3 items-end">
            <div className="flex-1">
              <Label htmlFor="key-name">Name</Label>
              <Input id="key-name" placeholder="e.g. n8n production" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button onClick={createKey} disabled={creating}>
              {creating ? "Creating…" : "Create key"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Existing keys</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            ) : keys.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No API keys yet.</div>
            ) : (
              <div className="divide-y">
                {keys.map((k) => (
                  <div key={k.id} className="p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{k.name}</span>
                        {k.revoked_at ? (
                          <Badge variant="destructive">Revoked</Badge>
                        ) : (
                          <Badge variant="secondary">Active</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 font-mono">
                        {k.key_prefix}••••••••
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Created {format(new Date(k.created_at), "PP")}
                        {k.last_used_at && ` · Last used ${format(new Date(k.last_used_at), "PP")}`}
                      </div>
                    </div>
                    {!k.revoked_at && (
                      <Button size="sm" variant="ghost" onClick={() => revoke(k.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!newKey} onOpenChange={(o) => !o && setNewKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Copy this now. For security, you won't be able to see it again.
          </p>
          <div className="bg-muted p-3 rounded font-mono text-sm break-all">{newKey}</div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (newKey) navigator.clipboard.writeText(newKey);
                toast.success("Copied");
              }}
            >
              <Copy className="mr-2 h-4 w-4" /> Copy
            </Button>
            <Button variant="outline" onClick={() => setNewKey(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
