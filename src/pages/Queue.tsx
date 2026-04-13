import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPublishJobsForWorkspace, type PublishJobView, requeuePublishJob } from "@/lib/api/queue";
import { format, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { getContentPipelineStateBadgeClassName, getContentPipelineStateLabel, getContentPipelineState } from "@/lib/publishing/statusPipeline";
import { Input } from "@/components/ui/input";
import { Copy, RefreshCw, RotateCcw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const QUEUE_STATES = ["queued", "publishing", "retrying"] as const;
const ERROR_STATES = ["failed"] as const;
type QueueMode = "queue" | "errors";

export function QueuePanel() {
  const navigate = useNavigate();
  const { workspaceId } = useAuth();

  const [jobs, setJobs] = useState<PublishJobView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<QueueMode>("queue");
  const [query, setQuery] = useState("");
  const [jobActionLoadingId, setJobActionLoadingId] = useState<string | null>(null);

  const refreshJobs = async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchPublishJobsForWorkspace(workspaceId);
      setJobs(rows);
    } catch (e) {
      console.error(e);
      setError("Failed to load publish queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!workspaceId) return;
    void refreshJobs();
  }, [workspaceId]);

  const retryCountLabel = (count: number) => (count > 0 ? `${count} retries` : "0 retries");

  const filteredJobs = jobs.filter((job) => {
    // If the content is missing, it should probably be removed from the queue view
    // as it can't be published anyway.
    if (job.content_missing) return false;

    // Determine the effective state in the pipeline
    const effectiveState = getContentPipelineState({
      contentStatus: job.content_status as any,
      publishJobState: job.state as any,
    });

    if (mode === "queue") {
      // If it's already published, remove it from the Queue tab (it moves to History)
      if (effectiveState === "published") return false;
      
      if (!QUEUE_STATES.includes(effectiveState as any)) return false;
    } else {
      if (!ERROR_STATES.includes(effectiveState as any)) return false;
    }

    const q = query.trim().toLowerCase();
    if (!q) return true;

    const title = (job.title ?? "").toLowerCase();
    const contentId = (job.content_id ?? "").toLowerCase();
    const lastError = (job.last_error ?? "").toLowerCase();

    return title.includes(q) || contentId.includes(q) || lastError.includes(q);
  });

  const copyError = async (text: string, jobId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: `Error copied for job ${jobId}.` });
    } catch (e) {
      console.error(e);
      toast({
        title: "Copy failed",
        description: "Clipboard access was blocked by the browser.",
        variant: "destructive",
      });
    }
  };

  const handleRequeue = async (job: PublishJobView) => {
    if (!workspaceId) return;
    setJobActionLoadingId(job.id);
    try {
      const nowIso = new Date().toISOString();
      await requeuePublishJob(job.id, { runAtIso: nowIso, clearLastError: true });
      toast({ title: "Requeued", description: "Job moved back to the queue." });
      await refreshJobs();
    } catch (e) {
      console.error(e);
      toast({ title: "Requeue failed", description: "Could not requeue this job.", variant: "destructive" });
    } finally {
      setJobActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Queue</h1>
          <p className="text-muted-foreground">Publishing jobs for your active workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/calendar")}>
            View Calendar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="py-6 space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as QueueMode)}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="queue">Queue</TabsTrigger>
              <TabsTrigger value="errors">Errors</TabsTrigger>
            </TabsList>

            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div className="space-y-2 w-full sm:w-[360px]">
                <label className="text-sm font-medium" htmlFor="queueSearch">
                  Search
                </label>
                <Input
                  id="queueSearch"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    mode === "errors"
                      ? "Search by title, content id, or error…"
                      : "Search by title or content id…"
                  }
                  disabled={loading}
                />
              </div>

              <div className="flex items-center justify-end">
                <Button variant="outline" onClick={() => void refreshJobs()} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>

            <TabsContent value="queue" className="mt-4">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-muted border-t-primary" />
                </div>
              ) : error ? (
                <div className="py-10 text-center space-y-3">
                  <p className="text-muted-foreground">{error}</p>
                  <Button variant="outline" onClick={() => void refreshJobs()}>
                    Retry
                  </Button>
                </div>
              ) : filteredJobs.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <p className="text-muted-foreground">{query.trim() ? "No matching jobs." : "No queued publishing jobs yet."}</p>
                  <p className="text-xs text-muted-foreground">Scheduling content will enqueue jobs automatically.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="font-medium py-2 px-3">Run At</th>
                        <th className="font-medium py-2 px-3">Content</th>
                        <th className="font-medium py-2 px-3">State</th>
                        <th className="font-medium py-2 px-3">Retries</th>
                        <th className="font-medium py-2 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredJobs.map((job) => (
                        <tr key={job.id} className="border-t border-border/50">
                          <td className="py-3 px-3 whitespace-nowrap">
                            {format(parseISO(job.run_at), "MMM d, yyyy HH:mm")}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {job.content_missing ? "Deleted" : job.title || "(Untitled)"}{" "}
                                <span className="text-xs text-muted-foreground">({job.content_type})</span>
                              </span>
                              {job.content_id && (
                                <span className="text-xs text-muted-foreground truncate max-w-[320px]">{job.content_id}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <Badge
                              variant="outline"
                              className={getContentPipelineStateBadgeClassName(
                                getContentPipelineState({
                                  contentStatus: job.content_status as any,
                                  publishJobState: job.state as any,
                                })
                              )}
                            >
                              {getContentPipelineStateLabel(
                                getContentPipelineState({
                                  contentStatus: job.content_status as any,
                                  publishJobState: job.state as any,
                                })
                              )}
                            </Badge>
                          </td>
                          <td className="py-3 px-3">
                            <span>{retryCountLabel(job.retry_count ?? 0)}</span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            {jobActionLoadingId === job.id ? (
                              <span className="text-xs text-muted-foreground">…</span>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handleRequeue(job)}
                                disabled={job.content_missing}
                              >
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Requeue now
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="errors" className="mt-4">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-muted border-t-primary" />
                </div>
              ) : error ? (
                <div className="py-10 text-center space-y-3">
                  <p className="text-muted-foreground">{error}</p>
                  <Button variant="outline" onClick={() => void refreshJobs()}>
                    Retry
                  </Button>
                </div>
              ) : filteredJobs.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <p className="text-muted-foreground">{query.trim() ? "No matching failed jobs." : "No failed jobs right now."}</p>
                  <p className="text-xs text-muted-foreground">Failures are shown here with the last error message.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="font-medium py-2 px-3">Run At</th>
                        <th className="font-medium py-2 px-3">Content</th>
                        <th className="font-medium py-2 px-3">State</th>
                        <th className="font-medium py-2 px-3">Retries</th>
                        <th className="font-medium py-2 px-3">Last error</th>
                        <th className="font-medium py-2 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredJobs.map((job) => (
                        <tr key={job.id} className="border-t border-border/50">
                          <td className="py-3 px-3 whitespace-nowrap">
                            {format(parseISO(job.run_at), "MMM d, yyyy HH:mm")}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {job.content_missing ? "Deleted" : job.title || "(Untitled)"}{" "}
                                <span className="text-xs text-muted-foreground">({job.content_type})</span>
                              </span>
                              {job.content_id && (
                                <span className="text-xs text-muted-foreground truncate max-w-[320px]">{job.content_id}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <Badge variant="outline" className={getContentPipelineStateBadgeClassName("failed")}>
                              {getContentPipelineStateLabel("failed")}
                            </Badge>
                          </td>
                          <td className="py-3 px-3">
                            <span>{retryCountLabel(job.retry_count ?? 0)}</span>
                          </td>
                          <td className="py-3 px-3">
                            {job.last_error ? (
                              <code className="text-xs text-destructive font-mono truncate max-w-[420px]">
                                {job.last_error}
                              </code>
                            ) : (
                              <span className="text-xs text-muted-foreground">No error message</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => job.last_error && void copyError(job.last_error, job.id)}
                                disabled={!job.last_error}
                                className="hidden sm:inline-flex"
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                Copy
                              </Button>
                              {jobActionLoadingId === job.id ? (
                                <span className="text-xs text-muted-foreground">…</span>
                              ) : (
                                <Button size="sm" onClick={() => void handleRequeue(job)} disabled={job.content_missing}>
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                  Retry
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Queue() {
  return (
    <DashboardLayout>
      <QueuePanel />
    </DashboardLayout>
  );
}

