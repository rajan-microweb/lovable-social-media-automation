import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { reviewContentApproval, fetchPendingApprovalsForWorkspace, type ContentApprovalItem } from "@/lib/api/approvals";

const APPROVALS_ENABLED = import.meta.env.VITE_ENABLE_APPROVALS === "true";

export default function Approvals() {
  const navigate = useNavigate();
  const { workspaceId, isAdmin } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ContentApprovalItem[]>([]);

  const canReview = Boolean(workspaceId) && isAdmin;

  const refresh = async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchPendingApprovalsForWorkspace(workspaceId);
      setApprovals(rows);
    } catch (e) {
      console.error(e);
      setError("Failed to load pending approvals.");
      toast.error("Failed to load pending approvals.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!APPROVALS_ENABLED) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [APPROVALS_ENABLED, workspaceId]);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const handleDecision = async (item: ContentApprovalItem, decision: "approved" | "rejected") => {
    if (!workspaceId) return;
    if (!isAdmin) {
      toast.error("Only workspace admins can review approvals.");
      return;
    }

    setActionLoadingId(item.id);
    try {
      await reviewContentApproval({
        workspaceId,
        contentType: item.content_type,
        contentId: item.content_id,
        decision,
        note: null,
      });

      toast.success(decision === "approved" ? "Content approved." : "Content rejected.");
      await refresh();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to submit approval decision.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const headerSubtitle = useMemo(() => {
    if (!APPROVALS_ENABLED) return "";
    if (!workspaceId) return "Select a workspace to review approvals.";
    if (isAdmin) return "Review pending workspace approvals.";
    return "You can view pending approvals (review restricted to admins).";
  }, [workspaceId, isAdmin]);

  if (!APPROVALS_ENABLED) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold">Approvals</h1>
            <p className="text-muted-foreground">Approvals are currently disabled in this build.</p>
          </div>
          <Card>
            <CardContent className="py-10 flex flex-col gap-3">
              <p className="text-muted-foreground">
                Enable approvals by setting <span className="font-mono">VITE_ENABLE_APPROVALS=true</span> and redeploying.
              </p>
              <div className="flex items-center gap-2">
                <Button onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
                <Button variant="outline" onClick={() => navigate("/calendar")}>
                  View Calendar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold">Approvals</h1>
            <p className="text-muted-foreground">{headerSubtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading || !workspaceId}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Pending approvals</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {approvals.length ? "Review and approve/reject scheduled content." : "No pending approvals right now."}
            </p>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="py-6 text-sm text-destructive">{error}</div>
            ) : loading ? (
              <div className="py-6 text-sm text-muted-foreground">Loading…</div>
            ) : approvals.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-muted-foreground">Nothing pending.</p>
                <p className="text-xs text-muted-foreground">Scheduled items will enter the queue once approved.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Requested</TableHead>
                      <TableHead>Content</TableHead>
                      <TableHead>Requester</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvals.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-nowrap">
                          {item.requested_at ? format(new Date(item.requested_at), "MMM d, yyyy HH:mm") : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-[280px]">
                            <Badge variant="secondary" className="capitalize">
                              {item.content_type}
                            </Badge>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{item.contentTitle}</div>
                              <div className="text-xs text-muted-foreground truncate">{item.content_id}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {item.requestedByName ?? "Unknown"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {item.scheduled_at ? format(new Date(item.scheduled_at), "MMM d, yyyy HH:mm") : "—"}
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <span className="block text-sm text-muted-foreground truncate">
                            {item.note ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!canReview || actionLoadingId === item.id}
                              onClick={() => void handleDecision(item, "approved")}
                            >
                              {actionLoadingId === item.id ? "…" : "Approve"}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!canReview || actionLoadingId === item.id}
                              onClick={() => void handleDecision(item, "rejected")}
                            >
                              {actionLoadingId === item.id ? "…" : "Reject"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground">
          Approvals are applied at review-time. Once approved, items move to the publishing schedule and can be picked up by the publishing worker.
        </div>
      </div>
    </DashboardLayout>
  );
}

