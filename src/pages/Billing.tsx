import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles, Check, Zap, TrendingUp, FileText, Image as ImageIcon, Users, Cpu } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PlanLimits = {
  max_users?: number | null;
  max_posts_month?: number | null;
  max_media_gb?: number | null;
  ai_credits_month?: number | null;
};

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_monthly_cents: number;
  price_yearly_cents: number;
  features: any;
  limits: PlanLimits;
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
  const [usage, setUsage] = useState({ posts: 0, stories: 0, members: 0, aiTokens: 0 });
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  useEffect(() => {
    if (!orgId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const startOfMonthIso = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  };

  const load = async () => {
    setLoading(true);
    try {
      const [plansRes, subRes, postsRes, storiesRes, membersRes, aiRes] = await Promise.all([
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
          .from("usage_logs")
          .select("quantity")
          .eq("organization_id", orgId!)
          .eq("metric", "ai.tokens")
          .gte("occurred_at", startOfMonthIso()),
      ]);

      const rawPlans = (plansRes.data ?? []) as any[];
      setPlans(rawPlans.map((p) => ({ ...p, limits: (p.limits ?? {}) as PlanLimits })) as Plan[]);
      setSub((subRes.data as Sub) ?? null);
      const aiTotal = (aiRes.data ?? []).reduce(
        (acc: number, r: any) => acc + Number(r.quantity ?? 0),
        0,
      );
      setUsage({
        posts: postsRes.count ?? 0,
        stories: storiesRes.count ?? 0,
        members: membersRes.count ?? 0,
        aiTokens: aiTotal,
      });
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to load billing info");
    } finally {
      setLoading(false);
    }
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

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const renewal = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const metrics = [
    {
      label: "Posts",
      icon: FileText,
      current: usage.posts,
      max: currentPlan?.limits?.max_posts_month ?? null,
      suffix: "this month",
    },
    {
      label: "Stories",
      icon: ImageIcon,
      current: usage.stories,
      max: null,
      suffix: "this month",
    },
    {
      label: "Members",
      icon: Users,
      current: usage.members,
      max: currentPlan?.limits?.max_users ?? null,
      suffix: "active",
    },
    {
      label: "AI credits",
      icon: Cpu,
      current: usage.aiTokens,
      max: currentPlan?.limits?.ai_credits_month ?? null,
      suffix: "tokens used",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-6xl">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8">
          <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs uppercase tracking-widest text-primary font-semibold">
                  Billing
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                {currentPlan ? (
                  <>You're on the <span className="text-primary">{currentPlan.name}</span> plan</>
                ) : (
                  "Choose your plan"
                )}
              </h1>
              <p className="text-muted-foreground mt-2">
                {renewal
                  ? `Renews on ${renewal}. Manage your subscription and monitor usage.`
                  : "Pick a plan that fits your team and scale as you grow."}
              </p>
            </div>
            {sub?.status && (
              <Badge
                variant={sub.status === "active" ? "default" : "secondary"}
                className="w-fit text-sm px-3 py-1"
              >
                {sub.status}
              </Badge>
            )}
          </div>
        </div>

        {/* Usage summary — Lovable-style */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Usage this period
              </h2>
              <p className="text-sm text-muted-foreground">
                Resets on the 1st of every month.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((m) => {
              const pct = m.max ? Math.min(100, Math.round((m.current / m.max) * 100)) : 0;
              const near = pct >= 80;
              return (
                <Card key={m.label} className="relative overflow-hidden">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                        <m.icon className="h-4 w-4" />
                      </div>
                      {m.max ? (
                        <span
                          className={cn(
                            "text-xs font-medium",
                            near ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {pct}%
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Unlimited
                        </Badge>
                      )}
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">{m.label}</div>
                      <div className="text-2xl font-bold">
                        {m.current.toLocaleString()}
                        {m.max ? (
                          <span className="text-sm font-normal text-muted-foreground">
                            {" "}/ {m.max.toLocaleString()}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{m.suffix}</div>
                    </div>
                    {m.max ? (
                      <Progress
                        value={pct}
                        className={cn(near && "[&>div]:bg-destructive")}
                      />
                    ) : (
                      <div className="h-2 rounded-full bg-gradient-to-r from-primary/40 via-primary/20 to-primary/40" />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Plans */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-semibold">Choose a plan</h2>
              <p className="text-sm text-muted-foreground">
                Upgrade, downgrade, or cancel anytime.
              </p>
            </div>
            <div className="inline-flex items-center rounded-full border p-1 bg-muted/40 self-start">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={cn(
                  "px-4 py-1.5 text-xs font-medium rounded-full transition",
                  billingCycle === "monthly"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle("yearly")}
                className={cn(
                  "px-4 py-1.5 text-xs font-medium rounded-full transition flex items-center gap-1",
                  billingCycle === "yearly"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                Yearly
                <Badge variant="secondary" className="ml-1 h-4 text-[9px] px-1.5">
                  -20%
                </Badge>
              </button>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((p, idx) => {
              const isCurrent = p.id === currentPlan?.id;
              const featured = idx === 1 && !isCurrent;
              const features = Array.isArray(p.features) ? p.features : [];
              const limits = p.limits ?? {};
              const priceCents =
                billingCycle === "yearly"
                  ? Math.round(p.price_yearly_cents / 12)
                  : p.price_monthly_cents;
              const priceLabel = (priceCents / 100).toFixed(0);

              return (
                <Card
                  key={p.id}
                  className={cn(
                    "relative transition-all hover:shadow-lg",
                    isCurrent && "border-primary ring-2 ring-primary/20",
                    featured && "border-primary/50 shadow-md scale-[1.01]",
                  )}
                >
                  {featured && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-gradient-to-r from-primary to-primary/70 shadow">
                        <Zap className="h-3 w-3 mr-1" /> Most popular
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{p.name}</CardTitle>
                      {isCurrent && <Badge>Current</Badge>}
                    </div>
                    <CardDescription className="min-h-[2.5rem]">
                      {p.description || "\u00A0"}
                    </CardDescription>
                    <div className="pt-2">
                      <span className="text-4xl font-bold tracking-tight">${priceLabel}</span>
                      <span className="text-muted-foreground text-sm"> /month</span>
                      {billingCycle === "yearly" && p.price_yearly_cents > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Billed annually (${(p.price_yearly_cents / 100).toFixed(0)}/yr)
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0" />
                        {limits.max_users ? `${limits.max_users} team members` : "Unlimited team members"}
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0" />
                        {limits.max_posts_month ? `${limits.max_posts_month} posts / month` : "Unlimited posts"}
                      </li>
                      {limits.ai_credits_month != null && (
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary shrink-0" />
                          {limits.ai_credits_month.toLocaleString()} AI credits / month
                        </li>
                      )}
                      {limits.max_media_gb != null && (
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary shrink-0" />
                          {limits.max_media_gb} GB media storage
                        </li>
                      )}
                      {features.slice(0, 4).map((f: string, i: number) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary shrink-0" />
                          <span>{String(f)}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      className={cn(
                        "w-full",
                        featured && "bg-gradient-to-r from-primary to-primary/80",
                      )}
                      variant={isCurrent ? "outline" : "default"}
                      disabled={isCurrent || !isAdmin || switching === p.id}
                      onClick={() => switchPlan(p)}
                    >
                      {switching === p.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {isCurrent ? "Current plan" : `Switch to ${p.name}`}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Payment processing isn't connected yet — plan changes are recorded but no card is charged.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
