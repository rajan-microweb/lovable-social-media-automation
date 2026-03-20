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

type WorkspaceRole = "ADMIN" | "CLIENT";

type WorkspaceMemberRow = {
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
  email: string;
  name: string;
};

export default function AdminUsers() {
  const { user, workspaceId, isAdmin } = useAuth();

  const [members, setMembers] = useState<WorkspaceMemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("CLIENT");

  const adminCount = useMemo(
    () => members.filter((m) => m.role === "ADMIN").length,
    [members]
  );

  useEffect(() => {
    if (!workspaceId) return;
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const fetchMembers = async () => {
    if (!workspaceId) return;

    setLoading(true);
    try {
      const { data: rawMembers, error: membersError } = await supabase
        .from("workspace_members")
        .select("user_id, role, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (membersError) throw membersError;

      const memberRows = rawMembers ?? [];
      const ids = memberRows.map((m: any) => m.user_id);

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, name, email, created_at")
        .in("id", ids);

      if (profilesError) throw profilesError;

      const profileById = new Map(
        (profiles ?? []).map((p: any) => [p.id, p])
      );

      const mappedMembers: WorkspaceMemberRow[] = memberRows.map((m: any) => {
        const profile = profileById.get(m.user_id);
        return {
          user_id: m.user_id,
          role: m.role as WorkspaceRole,
          joined_at: m.created_at,
          email: profile?.email ?? "unknown",
          name: profile?.name ?? "Unknown",
        };
      });

      setMembers(mappedMembers);
    } catch (e) {
      console.error("Failed to load workspace members:", e);
      toast.error("Failed to load workspace members");
    } finally {
      setLoading(false);
    }
  };

  const upsertMemberRoleByEmail = async (email: string, role: WorkspaceRole) => {
    if (!workspaceId || !user) return;

    const { data, error } = await supabase.functions.invoke(
      "invite-workspace-member",
      {
        body: {
          workspace_id: workspaceId,
          email,
          role,
        },
      }
    );

    if (error) {
      toast.error(error.message || "Failed to update member role");
      return;
    }

    if (data && data.success === false) {
      toast.error(data.error || "Failed to update member role");
      return;
    }

    toast.success("Workspace member updated");
    fetchMembers();
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      toast.error("Email is required");
      return;
    }

    if (!isAdmin) {
      toast.error("Only workspace admins can invite/manage members");
      return;
    }

    await upsertMemberRoleByEmail(email, inviteRole);
    setInviteEmail("");
  };

  const handleSetRole = async (member: WorkspaceMemberRow, role: WorkspaceRole) => {
    // Avoid locking out yourself from admin management.
    if (member.user_id === user?.id && member.role === "ADMIN" && adminCount <= 1) {
      toast.error("You must keep at least one workspace admin");
      return;
    }

    await upsertMemberRoleByEmail(member.email, role);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Workspace Members</h1>
          <p className="text-muted-foreground">
            Invite members and manage workspace roles.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Invite Member</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_160px_auto] items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="invite-email">
                  Email
                </label>
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
                  onValueChange={(v) => setInviteRole(v as WorkspaceRole)}
                  disabled={!isAdmin}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="CLIENT">Client</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                onClick={handleInvite}
                disabled={!isAdmin}
              >
                Invite
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Note: invitations only work for users that already exist in Supabase Auth
              (we match by email and then upsert `workspace_members`).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
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
                  {members.map((member) => {
                    const canManage = isAdmin;
                    return (
                      <TableRow key={member.user_id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>{member.email}</TableCell>
                        <TableCell>
                          <Badge
                            variant={member.role === "ADMIN" ? "default" : "secondary"}
                          >
                            {member.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(member.joined_at), "PP")}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={member.role === "ADMIN" ? "secondary" : "default"}
                              disabled={!canManage || member.role === "ADMIN"}
                              onClick={() => handleSetRole(member, "ADMIN")}
                            >
                              Make Admin
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={
                                !canManage ||
                                member.role !== "ADMIN" ||
                                (adminCount <= 1 && member.user_id === user?.id)
                              }
                              onClick={() => handleSetRole(member, "CLIENT")}
                            >
                              Demote
                            </Button>
                          </div>
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
