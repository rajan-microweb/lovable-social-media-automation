import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Check, ChevronsUpDown, Building2, FolderKanban, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type Org = { id: string; name: string };
type Ws = { id: string; name: string; organization_id: string; is_default: boolean };

function slugify(v: string) {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

export function TenantSwitcher() {
  const { user, orgId, workspaceId, setActiveTenant, refreshTenant } = useAuth();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [workspaces, setWorkspaces] = useState<Ws[]>([]);
  const [wsOpen, setWsOpen] = useState(false);
  const [wsName, setWsName] = useState("");
  const [saving, setSaving] = useState(false);

  const currentOrg = orgs.find((o) => o.id === orgId);
  const currentWs = workspaces.find((w) => w.id === workspaceId);
  const orgWorkspaces = workspaces.filter((w) => w.organization_id === orgId);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: members } = await supabase
        .from("organization_members")
        .select("organization_id, organizations(id, name)")
        .eq("user_id", user.id)
        .eq("status", "active");
      const orgList: Org[] =
        (members ?? [])
          .map((m: any) => m.organizations)
          .filter(Boolean) ?? [];
      setOrgs(orgList);

      if (orgList.length > 0) {
        const { data: ws } = await supabase
          .from("workspaces")
          .select("id, name, organization_id, is_default")
          .in("organization_id", orgList.map((o) => o.id))
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true });
        setWorkspaces((ws ?? []) as Ws[]);
      }
    })();
  }, [user, orgId, workspaceId]);

  const pickWorkspace = async (ws: Ws) => {
    await setActiveTenant(ws.organization_id, ws.id);
    toast.success(`Switched to ${ws.name}`);
  };

  const pickOrg = async (org: Org) => {
    // pick default workspace of that org
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id")
      .eq("organization_id", org.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!ws) {
      toast.error("Organization has no workspace");
      return;
    }
    await setActiveTenant(org.id, ws.id);
    toast.success(`Switched to ${org.name}`);
  };

  const createWorkspace = async () => {
    if (!orgId) return;
    const trimmed = wsName.trim();
    if (!trimmed) {
      toast.error("Workspace name required");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("workspaces")
        .insert({
          organization_id: orgId,
          name: trimmed,
          slug: slugify(trimmed) || `ws-${crypto.randomUUID().slice(0, 6)}`,
          is_default: false,
        } as any)
        .select("id, name, organization_id, is_default")
        .single();
      if (error) throw error;
      toast.success("Workspace created");
      setWorkspaces((prev) => [...prev, data as Ws]);
      setWsName("");
      setWsOpen(false);
      await setActiveTenant(orgId, data.id);
      await refreshTenant();
    } catch (e: any) {
      toast.error(e.message || "Failed to create workspace");
    } finally {
      setSaving(false);
    }
  };

  if (!orgId) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 max-w-[280px] justify-between"
            aria-label="Switch organization or workspace"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-xs font-medium">
                {currentOrg?.name ?? "Organization"}
              </span>
              <span className="text-muted-foreground text-xs">/</span>
              <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-xs">{currentWs?.name ?? "Workspace"}</span>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="text-xs">Organizations</DropdownMenuLabel>
          {orgs.map((o) => (
            <DropdownMenuItem key={o.id} onClick={() => pickOrg(o)}>
              <Building2 className="mr-2 h-4 w-4" />
              <span className="flex-1 truncate">{o.name}</span>
              {o.id === orgId && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => navigate("/onboarding")}>
            <Plus className="mr-2 h-4 w-4" /> New organization
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">Workspaces</DropdownMenuLabel>
          {orgWorkspaces.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => pickWorkspace(w)}>
              <FolderKanban className="mr-2 h-4 w-4" />
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === workspaceId && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => setWsOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={wsOpen} onOpenChange={setWsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Workspaces group posts, stories, and integrations inside your organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              placeholder="Marketing"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWsOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={createWorkspace} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
