import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart3 } from "lucide-react";

interface Row {
  metric: string;
  total: number;
}

const LABELS: Record<string, string> = {
  "posts.created": "Posts created",
  "stories.created": "Stories created",
  "ai.tokens": "AI tokens",
  "media.bytes": "Media bytes",
};

export default function Usage() {
  const { orgId } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const start = new Date();
      start.setDate(1);
      const { data, error } = await supabase
        .from("usage_logs")
        .select("metric, quantity")
        .eq("organization_id", orgId)
        .gte("occurred_at", start.toISOString());
      if (!error && data) {
        const totals: Record<string, number> = {};
        for (const r of data as Array<{ metric: string; quantity: number }>) {
          totals[r.metric] = (totals[r.metric] ?? 0) + Number(r.quantity);
        }
        setRows(Object.entries(totals).map(([metric, total]) => ({ metric, total })));
      }
      setLoading(false);
    })();
  }, [orgId]);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" /> Usage this month
          </h1>
          <p className="text-muted-foreground">Metered consumption for your organization.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current period</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage recorded yet this month.</p>
            ) : (
              rows.map((r) => (
                <div key={r.metric}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{LABELS[r.metric] ?? r.metric}</span>
                    <span className="text-muted-foreground">{r.total.toLocaleString()}</span>
                  </div>
                  <Progress value={Math.min(100, r.total / 10)} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
