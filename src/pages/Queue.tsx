import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPublishJobsForWorkspace, type PublishJobView } from "@/lib/api/queue";
import { format, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { getContentPipelineStateBadgeClassName, getContentPipelineStateLabel } from "@/lib/publishing/statusPipeline";

export default function Queue() {
  const navigate = useNavigate();
  const { workspaceId } = useAuth();

  const [jobs, setJobs] = useState<PublishJobView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchPublishJobsForWorkspace(workspaceId);
        setJobs(rows);
      } catch (e) {
        setError("Failed to load publish queue.");
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [workspaceId]);

  const retryCountLabel = (count: number) => (count > 0 ? `${count} retries` : "0 retries");

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Queue</h1>
            <p className="text-muted-foreground">Scheduled publishing jobs for your active workspace.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/calendar")}>
              View Calendar
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="py-6">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-muted border-t-primary" />
              </div>
            ) : error ? (
              <div className="py-10 text-center space-y-3">
                <p className="text-muted-foreground">{error}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!workspaceId) return;
                    toast({ title: "Retrying...", description: "Reloading publish jobs." });
                    setError(null);
                    setLoading(true);
                    fetchPublishJobsForWorkspace(workspaceId)
                      .then(setJobs)
                      .catch((e) => {
                        console.error(e);
                        setError("Failed to load publish queue.");
                      })
                      .finally(() => setLoading(false));
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : jobs.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-muted-foreground">No scheduled publishing jobs yet.</p>
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
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job.id} className="border-t border-border/50">
                        <td className="py-3 px-3 whitespace-nowrap">
                          {format(parseISO(job.run_at), "MMM d, yyyy HH:mm")}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {job.title || "(Untitled)"}{" "}
                              <span className="text-xs text-muted-foreground">
                                ({job.content_type})
                              </span>
                            </span>
                            {job.content_id && (
                              <span className="text-xs text-muted-foreground truncate max-w-[320px]">
                                {job.content_id}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <Badge
                            variant="outline"
                            className={getContentPipelineStateBadgeClassName(job.state as any)}
                          >
                            {getContentPipelineStateLabel(job.state as any)}
                          </Badge>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-col">
                            <span>{retryCountLabel(job.retry_count ?? 0)}</span>
                            {job.last_error ? (
                              <span className="text-xs text-destructive mt-1 font-mono truncate max-w-[260px]">
                                {job.last_error}
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

