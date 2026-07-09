import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";

type Plan = {
  id: string;
  code: string;
  name: string;
  price_month: number;
  price_year: number;
  currency: string;
  max_users: number | null;
  max_workspaces: number | null;
  max_posts_month: number | null;
  max_media_gb: number | null;
  ai_credits_month: number | null;
  features: any;
};

type Sub = {
  id: string;
  status: string;
  plan_id: string;
  current_period_end: string | null;
};

export default function Billing() {
  const { orgId, isAdmin } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Sub | null>(null);
  const [usage, setUsage] = useState({ posts: 0, stories: 0, members: 0, workspaces: 0 });
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const load = async () => {
    setLoading(true);
    try {
      const [plansRes, subRes, postsRes, storiesRes, membersRes, wsRes] = await Promise.all([
        supabase.from("plans").select("*").order("price_month", { ascending: true }),
        supabase.from("subscriptions").select("*").eq("organization_id", orgId!).maybeSingle(),
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId!)
          .gte("created_at", startOfMonthIso()),
        supabase
          .from("stories")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId!)
          .gte("created_at", startOfMonthIso()),
        supabase
          .from("organization_members")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId!)
          .eq("status", "active"),
        supabase
          .from("workspaces")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId!),
      ]);

      setPlans((plansRes.data ?? []) as Plan[]);
      setSub((subRes.data as Sub) ?? null);
      setUsage({
        posts: postsRes.count ?? 0,
        stories: storiesRes.count ?? 0,
        members: membersRes.count ?? 0,
        workspaces: wsRes.count ?? 0,
      });
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to load billing info");
    } finally {
      setLoading(false);
    }
  };

  const startOfMonthIso = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  };

  const currentPlan = plans.find((p) => p.id === sub?.plan_id);

  const switchPlan = async (plan: Plan) => {
    if (!orgId) return;
    if (!isAdmin) return toast.error("Only org admins can change plans");
    setSwitching(plan.id);
    try {
      if (sub) {
        const { error } = await supabase
          .from("subscriptions")
          .update({ plan_id: plan.id, status: "active" })
          .eq("id", sub.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("subscriptions")
          .insert({ organization_id: orgId, plan_id: plan.id, status: "active" });
        if (error) throw error;
      }
      toast.success(`Switched to ${plan.name}`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to switch plan");
    } finally {
      setSwitching(null);
    }
  };

  const usageRow = (label: string, current: number, max: number | null) => {
    const pct = max ? Math.min(100, Math.round((current / max) * 100)) : 0;
    return (
      <div key={label} className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">
            {current}
            {max ? ` / ${max}` : " (unlimited)"}
          </span>
        </div>
        {max ? <Progress value={pct} /> : null}
      </div>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-3xl font-bold">Billing & Plans</h1>
          <p className="text-muted-foreground">
            Manage your organization's subscription and monitor usage.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Current plan
              </CardTitle>
              <CardDescription>
                {currentPlan ? currentPlan.name : "No active plan"}
              </CardDescription>
            </div>
            {sub?.status && (
              <Badge variant={sub.status === "active" ? "default" : "secondary"}>
                {sub.status}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {usageRow("Posts this month", usage.posts, currentPlan?.max_posts_month ?? null)}
            {usageRow("Stories this month", usage.stories, null)}
            {usageRow("Members", usage.members, currentPlan?.max_users ?? null)}
            {usageRow("Workspaces", usage.workspaces, currentPlan?.max_workspaces ?? null)}
          </CardContent>
        </Card>

        <div>
          <h2 className="text-xl font-semibold mb-3">Choose a plan</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((p) => {
              const isCurrent = p.id === currentPlan?.id;
              const features = Array.isArray(p.features) ? p.features : [];
              return (
                <Card key={p.id} className={isCurrent ? "border-primary shadow-md" : ""}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{p.name}</CardTitle>
                      {isCurrent && <Badge>Current</Badge>}
                    </div>
                    <CardDescription>
                      <span className="text-2xl font-bold text-foreground">
                        {p.currency.toUpperCase()} {p.price_month}
                      </span>
                      <span className="text-muted-foreground text-sm"> /month</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-primary" />
                        {p.max_users ? `${p.max_users} members` : "Unlimited members"}
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-primary" />
                        {p.max_workspaces ? `${p.max_workspaces} workspaces` : "Unlimited workspaces"}
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-primary" />
                        {p.max_posts_month ? `${p.max_posts_month} posts/mo` : "Unlimited posts"}
                      </li>
                      {p.ai_credits_month != null && (
                        <li className="flex items-center gap-2">
                          <Check className="h-3.5 w-3.5 text-primary" />
                          {p.ai_credits_month} AI credits/mo
                        </li>
                      )}
                      {features.slice(0, 3).map((f: string, i: number) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className="h-3.5 w-3.5 text-primary" />
                          {String(f)}
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="w-full"
                      variant={isCurrent ? "outline" : "default"}
                      disabled={isCurrent || !isAdmin || switching === p.id}
                      onClick={() => switchPlan(p)}
                    >
                      {switching === p.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {isCurrent ? "Current plan" : "Switch"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Payment processing isn't connected yet. Plan changes are recorded in your organization but
            no card is charged.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
