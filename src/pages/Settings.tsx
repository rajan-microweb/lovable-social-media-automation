import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/components/ThemeProvider";
import { toast } from "sonner";
import {
  Settings2,
  Building2,
  Plug,
  KeyRound,
  Activity,
  Webhook,
  Palette,
  Bell,
  Shield,
  Loader2,
  Save,
  Trash2,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SectionId =
  | "general"
  | "integrations"
  | "api-keys"
  | "activity"
  | "webhooks"
  | "appearance"
  | "notifications"
  | "security";

type NavItem = {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  iconTint: string;
  adminOnly?: boolean;
};

type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { id: "general", label: "General", icon: Building2, iconTint: "text-indigo-500 bg-indigo-500/10" },
      { id: "integrations", label: "Integrations", icon: Plug, iconTint: "text-violet-500 bg-violet-500/10" },
    ],
  },
  {
    label: "Growth",
    items: [
      { id: "api-keys", label: "API Keys", icon: KeyRound, iconTint: "text-amber-500 bg-amber-500/10", adminOnly: true },
      { id: "activity", label: "Activity", icon: Activity, iconTint: "text-emerald-500 bg-emerald-500/10", adminOnly: true },
      { id: "webhooks", label: "Webhooks", icon: Webhook, iconTint: "text-sky-500 bg-sky-500/10", adminOnly: true },
    ],
  },
  {
    label: "Personal",
    items: [
      { id: "appearance", label: "Appearance", icon: Palette, iconTint: "text-pink-500 bg-pink-500/10" },
      { id: "notifications", label: "Notifications", icon: Bell, iconTint: "text-orange-500 bg-orange-500/10" },
      { id: "security", label: "Security", icon: Shield, iconTint: "text-rose-500 bg-rose-500/10" },
    ],
  },
];

export default function Settings() {
  const { orgId, isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const initial = (params.get("s") as SectionId) || "general";
  const [active, setActive] = useState<SectionId>(initial);

  useEffect(() => {
    setParams({ s: active }, { replace: true });
  }, [active, setParams]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          {/* Sub sidebar */}
          <aside className="lg:sticky lg:top-6 self-start rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 px-2 pb-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Settings2 className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-bold tracking-tight">Settings</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Workspace preferences
                </div>
              </div>
            </div>
            <nav className="space-y-4">
              {NAV.map((group) => {
                const items = group.items.filter((i) => !i.adminOnly || isAdmin);
                if (items.length === 0) return null;
                return (
                  <div key={group.label}>
                    <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </div>
                    <ul className="space-y-0.5">
                      {items.map((item) => {
                        const isActive = active === item.id;
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => setActive(item.id)}
                              className={cn(
                                "group w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-all",
                                isActive
                                  ? "bg-primary text-primary-foreground shadow-sm"
                                  : "hover:bg-muted"
                              )}
                            >
                              <span
                                className={cn(
                                  "h-7 w-7 rounded-md flex items-center justify-center transition-colors",
                                  isActive ? "bg-primary-foreground/15 text-primary-foreground" : item.iconTint
                                )}
                              >
                                <item.icon className="h-3.5 w-3.5" />
                              </span>
                              <span className="flex-1 text-left font-medium">{item.label}</span>
                              <ChevronRight
                                className={cn(
                                  "h-3.5 w-3.5 transition-opacity",
                                  isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                                )}
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <section className="min-w-0">
            {active === "general" && <GeneralSection orgId={orgId} isAdmin={isAdmin} />}
            {active === "integrations" && (
              <LinkSection
                title="Integrations"
                subtitle="Connect and manage social platform integrations."
                icon={Plug}
                href="/accounts"
                cta="Open integrations"
              />
            )}
            {active === "api-keys" && (
              <LinkSection
                title="API Keys"
                subtitle="Create and rotate programmatic access tokens."
                icon={KeyRound}
                href="/settings/api-keys"
                cta="Manage API keys"
              />
            )}
            {active === "activity" && (
              <LinkSection
                title="Activity"
                subtitle="Audit log of every recent action in your organization."
                icon={Activity}
                href="/settings/audit"
                cta="View activity log"
              />
            )}
            {active === "webhooks" && (
              <LinkSection
                title="Webhooks"
                subtitle="Send HTTP callbacks when key events happen."
                icon={Webhook}
                href="/settings/webhooks"
                cta="Manage webhooks"
              />
            )}
            {active === "appearance" && <AppearanceSection />}
            {active === "notifications" && (
              <LinkSection
                title="Notifications"
                subtitle="Review recent events in your inbox."
                icon={Bell}
                href="/notifications"
                cta="Open inbox"
              />
            )}
            {active === "security" && (
              <LinkSection
                title="Security"
                subtitle="Password, sessions, and login activity."
                icon={Shield}
                href="/profile"
                cta="Manage security"
              />
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ----------------- General ----------------- */

type Org = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  timezone: string | null;
  country: string | null;
};

function SectionHeader({
  title,
  description,
  eyebrow,
}: {
  title: string;
  description: string;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6">
      {eyebrow && (
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
          {eyebrow}
        </div>
      )}
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
  );
}

function GeneralSection({ orgId, isAdmin }: { orgId: string | null; isAdmin: boolean }) {
  const { refreshTenant } = useAuth();
  const [org, setOrg] = useState<Org | null>(null);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id, name, slug, logo_url, timezone, country")
        .eq("id", orgId)
        .maybeSingle();
      if (data) {
        setOrg(data as Org);
        setName(data.name);
        setLogoUrl(data.logo_url ?? "");
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
        .update({ name: name.trim(), logo_url: logoUrl.trim() || null })
        .eq("id", orgId);
      if (error) throw error;
      toast.success("Organization updated");
      await refreshTenant();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update organization");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initial = (org?.name ?? "?").charAt(0).toUpperCase();

  return (
    <div>
      <SectionHeader
        eyebrow={org?.name ?? "Organization"}
        title="General"
        description="Manage your general preferences."
      />

      <Card className="border-2 shadow-sm">
        <CardHeader className="flex-row items-start gap-4 space-y-0">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center text-primary font-bold">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-11 w-11 rounded-xl object-cover" />
            ) : (
              initial
            )}
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">Organization profile</CardTitle>
            <CardDescription>Basic details visible to your team.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isAdmin}
                placeholder="Acme Inc."
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input value={org?.slug ?? ""} disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Logo URL</Label>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
              disabled={!isAdmin}
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={!isAdmin || saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="mt-6 border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center">
              <Trash2 className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-destructive">Delete organization</div>
              <div className="text-sm text-muted-foreground">
                Permanently deletes this organization, all members, content, and integrations. This cannot be undone.
              </div>
            </div>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => toast.error("Contact support to delete your organization.")}
            >
              <Trash2 className="h-4 w-4" />
              Delete organization
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ----------------- Appearance ----------------- */

const ACCENT_SWATCHES = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#e11d48",
  "#ea580c",
  "#16a34a",
  "#0d9488",
  "#0ea5e9",
  "#111827",
];

function AppearanceSection() {
  const { theme, setTheme, accentColor, setAccentColor } = useTheme();

  const themes: { id: "light" | "dark" | "system"; label: string; icon: LucideIcon }[] = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ];

  return (
    <div>
      <SectionHeader
        eyebrow="Personal"
        title="Appearance"
        description="Customize the look and feel of your workspace."
      />
      <Card className="border-2 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Theme</CardTitle>
          <CardDescription>Choose how the interface looks to you.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {themes.map((t) => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    "rounded-xl border-2 p-4 flex flex-col items-center gap-2 transition-all",
                    active
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/40"
                  )}
                >
                  <t.icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
                  <span className={cn("text-sm font-medium", active && "text-primary")}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 border-2 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Accent color</CardTitle>
          <CardDescription>Applied across buttons, links, and highlights.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {ACCENT_SWATCHES.map((c) => {
              const active = accentColor.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAccentColor(c)}
                  className={cn(
                    "h-9 w-9 rounded-full ring-offset-2 ring-offset-background transition-all",
                    active ? "ring-2 ring-primary scale-110" : "hover:scale-105"
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Accent ${c}`}
                />
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Label className="text-xs text-muted-foreground">Custom</Label>
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="h-9 w-16 rounded-md border cursor-pointer bg-transparent"
            />
            <Badge variant="secondary" className="font-mono">{accentColor}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ----------------- Link section (bridge to other pages) ----------------- */

function LinkSection({
  title,
  subtitle,
  icon: Icon,
  href,
  cta,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  href: string;
  cta: string;
}) {
  const navigate = useNavigate();
  return (
    <div>
      <SectionHeader eyebrow="Settings" title={title} description={subtitle} />
      <Card className="border-2 shadow-sm">
        <CardContent className="flex items-center gap-4 py-6">
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold">{title}</div>
            <div className="text-sm text-muted-foreground">{subtitle}</div>
          </div>
          <Button onClick={() => navigate(href)} className="gap-2">
            {cta}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
