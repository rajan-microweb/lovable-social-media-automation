import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Copy } from "lucide-react";

type OrgRole = "OWNER" | "ADMIN" | "MANAGER" | "EDITOR" | "VIEWER";

const ROLE_OPTIONS: OrgRole[] = ["OWNER", "ADMIN", "MANAGER", "EDITOR", "VIEWER"];

type MemberRow = {
  user_id: string;
  role: OrgRole;
  status: string;
  joined_at: string;
  email: string;
  name: string;
};

type Invitation = {
  id: string;
  email: string;
  role: OrgRole;
  token: string;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
};

export default function AdminUsers() {
  const { user, orgId, isAdmin } = useAuth();

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("EDITOR");
  const [inviting, setInviting] = useState(false);

  const ownerCount = useMemo(
    () => members.filter((m) => m.role === "OWNER" && m.status === "active").length,
    [members],
  );

  useEffect(() => {
    if (!orgId) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const fetchAll = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from("organization_members")
        .select("user_id, role, status, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = (rows ?? []).map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", ids);
      const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      setMembers(
        (rows ?? []).map((r: any) => ({
          user_id: r.user_id,
          role: r.role,
          status: r.status,
          joined_at: r.created_at,
          email: byId.get(r.user_id)?.email ?? "unknown",
          name: byId.get(r.user_id)?.name ?? "Unknown",
        })),
      );

      const { data: invites } = await supabase
        .from("organization_invitations")
        .select("id, email, role, token, expires_at, created_at, accepted_at")
        .eq("organization_id", orgId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      setInvitations((invites ?? []) as Invitation[]);
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to load org members");
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return toast.error("Email required");
    if (!isAdmin) return toast.error("Only org admins can invite");
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("org-invite-member", {
        body: { email, role: inviteRole },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error ?? "Invite failed");
      toast.success(
        data?.mode === "invited" ? "Invitation created" : "Member added",
      );
      setInviteEmail("");
      fetchAll();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to invite");
    } finally {
      setInviting(false);
    }
  };

  const setRole = async (m: MemberRow, role: OrgRole) => {
    if (m.role === "OWNER" && role !== "OWNER" && ownerCount <= 1) {
      return toast.error("Cannot demote the last owner");
    }
    const { data, error } = await supabase.functions.invoke("org-update-member", {
      body: { action: "set_role", user_id: m.user_id, role },
    });
    if (error || data?.success === false) {
      return toast.error(error?.message || data?.error || "Failed to update role");
    }
    toast.success("Role updated");
    fetchAll();
  };

  const removeMember = async (m: MemberRow) => {
    if (m.user_id === user?.id) return toast.error("You can't remove yourself");
    const { data, error } = await supabase.functions.invoke("org-update-member", {
      body: { action: "remove", user_id: m.user_id },
    });
    if (error || data?.success === false) {
      return toast.error(error?.message || data?.error || "Failed to remove");
    }
    toast.success("Member removed");
    fetchAll();
  };

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Organization Members</h1>
          <p className="text-muted-foreground">
            Invite people and manage their role in this organization.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Invite member</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-[1fr_160px_auto] items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="invite-email">Email</label>
                <Input
                  id="invite-email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="member@company.com"
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Role</label>
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v as OrgRole)}
                  disabled={!isAdmin}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={handleInvite} disabled={!isAdmin || inviting}>
                {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Invite
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              If the email already has an account, they're added immediately. Otherwise, an invite link is generated below.
            </p>
          </CardContent>
        </Card>

        {invitations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pending invitations</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.email}</TableCell>
                      <TableCell><Badge variant="secondary">{inv.role}</Badge></TableCell>
                      <TableCell>{format(new Date(inv.expires_at), "PP")}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => copyInviteLink(inv.token)}>
                          <Copy className="mr-1 h-3.5 w-3.5" /> Copy link
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.user_id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>{m.email}</TableCell>
                      <TableCell>
                        <Select
                          value={m.role}
                          onValueChange={(v) => setRole(m, v as OrgRole)}
                          disabled={!isAdmin}
                        >
                          <SelectTrigger className="h-8 w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{format(new Date(m.joined_at), "PP")}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => removeMember(m)}
                          disabled={
                            !isAdmin ||
                            m.user_id === user?.id ||
                            (m.role === "OWNER" && ownerCount <= 1)
                          }
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
