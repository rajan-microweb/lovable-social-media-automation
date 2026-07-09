import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type AuditRow = {
  id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  user_id: string | null;
  created_at: string;
  meta: any;
  ip: string | null;
};

export default function AuditLog() {
  const { orgId } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [users, setUsers] = useState<Map<string, { name: string; email: string }>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("audit_logs")
        .select("id, action, resource_type, resource_id, user_id, created_at, meta, ip")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(200);
      const list = (data ?? []) as AuditRow[];
      setRows(list);
      const ids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, name, email")
          .in("id", ids);
        setUsers(new Map((profiles ?? []).map((p: any) => [p.id, { name: p.name, email: p.email }])));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl">
        <div>
          <h1 className="text-3xl font-bold">Audit log</h1>
          <p className="text-muted-foreground">
            Recent actions taken in this organization by members and integrations.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No audit events yet. As members create, update, or delete content, events will show up here.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Resource</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const actor = r.user_id ? users.get(r.user_id) : null;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-sm">
                          {actor ? actor.name || actor.email : r.user_id ? "Unknown" : "System"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-[11px]">
                            {r.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {r.resource_type ?? "—"}
                          {r.resource_id ? ` · ${r.resource_id.slice(0, 8)}` : ""}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
