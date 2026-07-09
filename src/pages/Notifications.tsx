import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Bell, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export default function Notifications() {
  const { user, orgId } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user || !orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    else setItems((data ?? []) as Notification[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user, orgId]);

  const markRead = async (id: string) => {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  };

  const markAllRead = async () => {
    const unread = items.filter((i) => !i.read_at).map((i) => i.id);
    if (unread.length === 0) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unread);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6" /> Notifications
            </h1>
            <p className="text-muted-foreground">Recent activity across your organization.</p>
          </div>
          <Button variant="outline" onClick={markAllRead}>
            <Check className="mr-2 h-4 w-4" /> Mark all read
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inbox</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            ) : items.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">You're all caught up.</div>
            ) : (
              <div className="divide-y">
                {items.map((n) => (
                  <div key={n.id} className="p-4 flex items-start gap-3">
                    <div className="mt-1 h-2 w-2 rounded-full shrink-0" style={{ background: n.read_at ? "hsl(var(--muted))" : "hsl(var(--primary))" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">{n.type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      {n.payload && (
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                          {JSON.stringify(n.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                    {!n.read_at && (
                      <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>
                        Mark read
                      </Button>
                    )}
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
