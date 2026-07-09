import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/components/ThemeProvider";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import {
  Settings2,
  Building2,
  KeyRound,
  Activity,
  Palette,
  Bell,
  Loader2,
  Save,
  Trash2,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
  Copy,
  Check,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SectionId = "general" | "api-keys" | "activity" | "appearance" | "notifications";

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
      { id: "api-keys", label: "API Keys", icon: KeyRound, iconTint: "text-amber-500 bg-amber-500/10", adminOnly: true },
      { id: "activity", label: "Activity", icon: Activity, iconTint: "text-emerald-500 bg-emerald-500/10", adminOnly: true },
    ],
  },
  {
    label: "Personal",
    items: [
      { id: "appearance", label: "Appearance", icon: Palette, iconTint: "text-pink-500 bg-pink-500/10" },
      { id: "notifications", label: "Notifications", icon: Bell, iconTint: "text-orange-500 bg-orange-500/10" },
    ],
  },
];

export default function Settings() {
  const { orgId, isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const requested = params.get("s") as SectionId | null;
  const isValid = requested && NAV.some((g) => g.items.some((i) => i.id === requested));
  const [active, setActive] = useState<SectionId>(isValid ? (requested as SectionId) : "general");

  useEffect(() => {
    if (params.get("s") !== active) {
      setParams({ s: active }, { replace: true });
    }
  }, [active, params, setParams]);

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
            {active === "api-keys" && <ApiKeysSection orgId={orgId} />}
            {active === "activity" && <ActivitySection orgId={orgId} />}
            {active === "appearance" && <AppearanceSection />}
            {active === "notifications" && <NotificationsSection orgId={orgId} />}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ----------------- Shared header ----------------- */

function SectionHeader({
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        {eyebrow && (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      {action}
    </div>
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
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center text-primary font-bold overflow-hidden">
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

/* ----------------- API Keys ----------------- */

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[] | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function ApiKeysSection({ orgId }: { orgId: string | null }) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const createKey = async () => {
    if (!name.trim()) return toast.error("Give the key a name");
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("create-api-key", {
      body: { name: name.trim() },
    });
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
    <div>
      <SectionHeader
        eyebrow="Growth"
        title="API Keys"
        description="Programmatic access to your organization."
      />

      <Card className="border-2 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Create new key</CardTitle>
          <CardDescription>Name it after where you'll use it, e.g. "n8n production".</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              placeholder="e.g. n8n production"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button onClick={createKey} disabled={creating} className="gap-2">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Create key
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6 border-2 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Existing keys</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : keys.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No API keys yet.
            </div>
          ) : (
            <div className="divide-y">
              {keys.map((k) => (
                <div key={k.id} className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{k.name}</span>
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
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => revoke(k.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}

/* ----------------- Activity (audit) ----------------- */

type AuditRow = {
  id: number;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  user_id: string | null;
  created_at: string;
};

function ActivitySection({ orgId }: { orgId: string | null }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [users, setUsers] = useState<Map<string, { name: string; email: string }>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("audit_logs")
          .select("id, action, resource_type, resource_id, user_id, created_at")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(200);
        const list = (data ?? []) as unknown as AuditRow[];
        setRows(list);
        const ids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
        if (ids.length) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, name, email")
            .in("id", ids);
          setUsers(
            new Map(
              (profiles ?? []).map((p: { id: string; name: string; email: string }) => [
                p.id,
                { name: p.name, email: p.email },
              ])
            )
          );
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  return (
    <div>
      <SectionHeader
        eyebrow="Growth"
        title="Activity"
        description="Recent actions taken by members and integrations."
      />
      <Card className="border-2 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              No activity yet. As members create, update, or delete content, events will show up here.
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

/* ----------------- Notifications ----------------- */

interface NotificationRow {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

function NotificationsSection({ orgId }: { orgId: string | null }) {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
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
    else setItems((data ?? []) as NotificationRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, orgId]);

  const markRead = async (id: string) => {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
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

  const unreadCount = items.filter((i) => !i.read_at).length;

  return (
    <div>
      <SectionHeader
        eyebrow="Personal"
        title="Notifications"
        description="Recent activity across your organization."
        action={
          <Button variant="outline" onClick={markAllRead} disabled={unreadCount === 0} className="gap-2">
            <Check className="h-4 w-4" /> Mark all read
          </Button>
        }
      />

      <Card className="border-2 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Inbox
            {unreadCount > 0 && <Badge variant="secondary">{unreadCount} new</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-sm text-muted-foreground flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <div className="divide-y">
              {items.map((n) => (
                <div key={n.id} className="p-4 flex items-start gap-3">
                  <div
                    className="mt-2 h-2 w-2 rounded-full shrink-0"
                    style={{ background: n.read_at ? "hsl(var(--muted-foreground) / 0.3)" : "hsl(var(--primary))" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary">{n.type}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {n.payload && (
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-32 overflow-auto">
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
  );
}
