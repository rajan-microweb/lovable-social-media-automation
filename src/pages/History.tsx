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
import { Input } from "@/components/ui/input";
import { RefreshCw, ExternalLink } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SOCIAL_STATUS_PUBLISHED } from "@/types/social";

type HistoryMode = "all" | "posts" | "stories";

export function HistoryPanel() {
  const navigate = useNavigate();
  const { workspaceId } = useAuth();

  const [jobs, setJobs] = useState<PublishJobView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<HistoryMode>("all");
  const [query, setQuery] = useState("");

  const refreshJobs = async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchPublishJobsForWorkspace(workspaceId);
      setJobs(rows);
    } catch (e) {
      console.error(e);
      setError("Failed to load history.");
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
    // Only show published jobs in history
    if (job.state !== SOCIAL_STATUS_PUBLISHED) return false;

    if (mode === "posts" && job.content_type !== "post") return false;
    if (mode === "stories" && job.content_type !== "story") return false;

    const q = query.trim().toLowerCase();
    if (!q) return true;

    const title = (job.title ?? "").toLowerCase();
    const contentId = (job.content_id ?? "").toLowerCase();

    return title.includes(q) || contentId.includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">History</h1>
          <p className="text-muted-foreground">Log of your successfully published posts and stories.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/calendar")}>
            View Calendar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="py-6 space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as HistoryMode)}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="posts">Posts</TabsTrigger>
              <TabsTrigger value="stories">Stories</TabsTrigger>
            </TabsList>

            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mt-4">
              <div className="space-y-2 w-full sm:w-[360px]">
                <label className="text-sm font-medium" htmlFor="historySearch">
                  Search
                </label>
                <Input
                  id="historySearch"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by title or content id..."
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

            <TabsContent value={mode} className="mt-4">
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
                  <p className="text-muted-foreground">
                    {query.trim() ? "No matching history items found." : "No history to show yet."}
                  </p>
                  <p className="text-xs text-muted-foreground">Successfully published content will appear here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="font-medium py-2 px-3 whitespace-nowrap">Published At</th>
                        <th className="font-medium py-2 px-3">Content</th>
                        <th className="font-medium py-2 px-3">State</th>
                        <th className="font-medium py-2 px-3">Retries</th>
                        <th className="font-medium py-2 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredJobs
                        .sort((a, b) => new Date(b.run_at).getTime() - new Date(a.run_at).getTime())
                        .map((job) => (
                        <tr key={job.id} className="border-t border-border/50 hover:bg-muted/5 transition-colors">
                          <td className="py-3 px-3 whitespace-nowrap">
                            {format(parseISO(job.run_at), "MMM d, yyyy HH:mm")}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {job.content_missing ? "Deleted" : job.title || "(Untitled)"}{" "}
                                <span className="text-xs text-muted-foreground font-normal">({job.content_type})</span>
                              </span>
                              {job.content_id && (
                                <span className="text-xs text-muted-foreground truncate max-w-[320px]">{job.content_id}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <Badge
                              variant="outline"
                              className={
                                job.content_missing
                                  ? "bg-destructive/15 text-destructive border-destructive/30 capitalize"
                                  : getContentPipelineStateBadgeClassName(job.state as any)
                              }
                            >
                              {job.content_missing ? "Deleted" : getContentPipelineStateLabel(job.state as any)}
                            </Badge>
                          </td>
                          <td className="py-3 px-3">
                            <span>{retryCountLabel(job.retry_count ?? 0)}</span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/${job.content_type}s/${job.content_id}/edit`)}
                              disabled={job.content_missing}
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View
                            </Button>
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

export default function History() {
  return (
    <DashboardLayout>
      <HistoryPanel />
    </DashboardLayout>
  );
}
