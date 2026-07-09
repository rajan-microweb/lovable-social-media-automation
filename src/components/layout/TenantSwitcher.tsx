import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type Org = { id: string; name: string };

export function TenantSwitcher() {
  const { user, orgId, setActiveTenant } = useAuth();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<Org[]>([]);

  const currentOrg = orgs.find((o) => o.id === orgId);

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
    })();
  }, [user, orgId]);

  const pickOrg = async (org: Org) => {
    await setActiveTenant(org.id);
    toast.success(`Switched to ${org.name}`);
  };

  if (!orgId) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 max-w-[280px] justify-between"
          aria-label="Switch organization"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-xs font-medium">
              {currentOrg?.name ?? "Organization"}
            </span>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
