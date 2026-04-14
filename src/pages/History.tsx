import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { fetchPublishJobsForWorkspace, type PublishJobView } from "@/lib/api/queue";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { RefreshCw, ExternalLink, RotateCcw, Copy, AlertCircle, FileText, CheckCircle2, TrendingUp, XCircle, Trash2, MoreVertical, Instagram, Facebook, Linkedin, Twitter, Youtube, Search, Calendar, LayoutGrid, List, ChevronLeft, ChevronRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { SOCIAL_STATUS_PUBLISHED } from "@/types/social";
import { requeuePublishJob } from "@/lib/api/queue";
import { getContentPipelineState, getContentPipelineStateBadgeClassName, getContentPipelineStateLabel, getContentPipelineStateUI } from "@/lib/publishing/statusPipeline";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";
import { normalizeSocialPlatform, type SocialPlatform } from "@/types/social";

const platformConfig: Record<SocialPlatform, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
  linkedin: { icon: Linkedin, color: "text-[#0A66C2]", bgColor: "bg-[#0A66C2]/10", label: "LinkedIn" },
  facebook: { icon: Facebook, color: "text-[#1877F2]", bgColor: "bg-[#1877F2]/10", label: "Facebook" },
  instagram: { icon: Instagram, color: "text-[#E4405F]", bgColor: "bg-[#E4405F]/10", label: "Instagram" },
  youtube: { icon: Youtube, color: "text-[#FF0000]", bgColor: "bg-[#FF0000]/10", label: "YouTube" },
  twitter: { icon: Twitter, color: "text-[#1DA1F2]", bgColor: "bg-[#1DA1F2]/10", label: "Twitter / X" },
};

const getPlatformLink = (platform: string, metadata: any, contentType: string, fallbackUrl?: string | null) => {
  const p = platform.toLowerCase();

  // Helper to extract from a raw object
  const extractFromObj = (obj: any): string | null => {
    if (!obj || typeof obj !== 'object') return null;
    // 1. Direct platform key { instagram: "link" }
    if (typeof obj[p] === 'string') return obj[p];
    // 2. Platform object with permalink { instagram: { permalink: "link" } }
    if (obj[p] && typeof obj[p] === 'object' && obj[p].permalink && typeof obj[p].permalink === 'string') return obj[p].permalink;
    // 3. Simple key with suffix { instagram_permalink: "link" }
    const suffixKey = `${p}_permalink`;
    if (typeof obj[suffixKey] === 'string') return obj[suffixKey];
    // 4. Nested published_results { published_results: { instagram: "link" } }
    if (obj.published_results) {
       const fromDeep = extractFromObj(obj.published_results);
       if (fromDeep) return fromDeep;
    }
    return null;
  };

  // 1. Try to extract from metadata object
  const fromMeta = extractFromObj(metadata);
  if (fromMeta && fromMeta.startsWith('http')) return fromMeta;

  // 2. If fallbackUrl looks like JSON, try to parse and extract
  if (fallbackUrl && fallbackUrl.startsWith('{')) {
    try {
      const parsed = JSON.parse(fallbackUrl);
      const fromParsedFallback = extractFromObj(parsed);
      if (fromParsedFallback && fromParsedFallback.startsWith('http')) return fromParsedFallback;
    } catch (e) {
      // Not valid JSON string or parse failed
    }
  }

  // 3. Final Fallback to raw fallbackUrl ONLY if it's a direct link
  if (fallbackUrl && fallbackUrl.startsWith('http')) return fallbackUrl;

  return null;
};

const PlatformIcon = ({ platform, link }: { platform: string, link?: string | null }) => {
  const icon = (() => {
    switch(platform.toLowerCase()) {
      case 'instagram': return <Instagram className="h-3.5 w-3.5" />;
      case 'facebook': return <Facebook className="h-3.5 w-3.5" />;
      case 'linkedin': return <Linkedin className="h-3.5 w-3.5" />;
      case 'twitter': return <Twitter className="h-3.5 w-3.5" />;
      case 'youtube': return <Youtube className="h-3.5 w-3.5" />;
      default: return null;
    }
  })();

  if (!icon) return null;

  if (link) {
    return (
      <a 
        href={link} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all transform hover:scale-110 shadow-sm"
        title={`View on ${platform}`}
        onClick={(e) => e.stopPropagation()}
      >
        {icon}
      </a>
    );
  }

  return (
    <div className="h-6 w-6 rounded-md bg-muted/40 flex items-center justify-center text-foreground/30 group-hover:text-foreground/80 transition-colors" title={platform}>
      {icon}
    </div>
  );
};

type HistoryMode = "all" | "posts" | "stories";

export default function History() {
  const { workspaceId } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<HistoryMode>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "failed" | "scheduled">("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [jobActionLoadingId, setJobActionLoadingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Stats State
  const [stats, setStats] = useState({
    successRate: 0,
    totalPublished: 0,
    totalFailed: 0,
    totalScheduled: 0,
    postsVolume: 0,
    storiesVolume: 0
  });

  // Reschedule Dialog State
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<PublishJobView | null>(null);
  const [newRunAt, setNewRunAt] = useState<string>("");
  const [newTitle, setNewTitle] = useState<string>("");

  const [jobs, setJobs] = useState<PublishJobView[]>([]);

  const refreshJobs = async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchPublishJobsForWorkspace(workspaceId);
      setJobs(rows);
      
      // Calculate Stats
      const published = rows.filter(r => getContentPipelineState({ contentStatus: r.content_status as any, publishJobState: r.state as any}) === "published");
      const failed = rows.filter(r => getContentPipelineState({ contentStatus: r.content_status as any, publishJobState: r.state as any}) === "failed");
      const scheduled = rows.filter(r => {
        const s = getContentPipelineState({ contentStatus: r.content_status as any, publishJobState: r.state as any});
        return s === "scheduled" || s === "queued" || s === "publishing";
      });
      const totalFinised = published.length + failed.length;
      
      setStats({
        successRate: totalFinised > 0 ? Math.round((published.length / totalFinised) * 100) : 0,
        totalPublished: published.length,
        totalFailed: failed.length,
        totalScheduled: scheduled.length,
        postsVolume: rows.filter(r => r.content_type === "post").length,
        storiesVolume: rows.filter(r => r.content_type === "story").length
      });
    } catch (e) {
      console.error(e);
      setError("Failed to load history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshJobs();
  }, [workspaceId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [mode, statusFilter, platformFilter, query]);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selectedIds.length === filteredJobs.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredJobs.map(j => j.id));
    }
  };

  const handleBulkRequeue = async () => {
    if (selectedIds.length === 0) return;
    const confirm = window.confirm(`Are you sure you want to requeue ${selectedIds.length} items now?`);
    if (!confirm) return;

    setJobActionLoadingId("bulk");
    try {
      const nowIso = new Date().toISOString();
      for (const id of selectedIds) {
        await requeuePublishJob(id, { runAtIso: nowIso });
      }
      toast({ title: "Bulk Requeue", description: `Queued ${selectedIds.length} items successfully.` });
      setSelectedIds([]);
      await refreshJobs();
    } catch (e: any) {
       toast({ title: "Bulk failed", description: e.message, variant: "destructive" });
    } finally {
      setJobActionLoadingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirm = window.confirm(`Are you sure you want to remove ${selectedIds.length} jobs from history log? (Content will NOT be deleted)`);
    if (!confirm) return;

    setJobActionLoadingId("bulk");
    try {
      const { error } = await supabase.from("publish_jobs").delete().in("id", selectedIds);
      if (error) throw error;
      toast({ title: "History Cleaned", description: `Removed ${selectedIds.length} logs.` });
      setSelectedIds([]);
      await refreshJobs();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setJobActionLoadingId(null);
    }
  };

  const handleRequeue = (job: PublishJobView) => {
    setSelectedJob(job);
    setNewTitle(job.title || "");
    setNewRunAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setRescheduleDialogOpen(true);
  };

  const confirmRequeue = async () => {
    if (!selectedJob) return;
    setJobActionLoadingId(selectedJob.id);
    try {
      // Update title if changed
      if (newTitle !== selectedJob.title) {
        const table = selectedJob.content_type === "story" ? "stories" : "posts";
        await supabase.from(table).update({ title: newTitle }).eq("id", selectedJob.content_id);
      }
      
      await requeuePublishJob(selectedJob.id, { 
        runAtIso: new Date(newRunAt).toISOString(),
        clearLastError: true 
      });
      
      toast({
        title: "Content Requeued",
        description: "The item has been added back to the publishing queue.",
      });
      setRescheduleDialogOpen(false);
      await refreshJobs();
    } catch (e: any) {
      toast({
        title: "Requeue Failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setJobActionLoadingId(null);
    }
  };

  const handleCancelRequeue = async (jobId: string, contentId: string, contentType: string, wasPublished: boolean, hadError: boolean) => {
    setJobActionLoadingId(jobId);
    try {
      // Determine what status to revert to
      let revertStatus = "draft";
      if (wasPublished) revertStatus = SOCIAL_STATUS_PUBLISHED;
      else if (hadError) revertStatus = "failed";

      const table = contentType === "story" ? "stories" : "posts";
      
      // 1. Update content status back to something non-scheduled
      await supabase.from(table).update({ status: revertStatus }).eq("id", contentId);
      
      // 2. Update job status back to its previous state (or failed/published)
      const newState = wasPublished ? "published" : hadError ? "failed" : "failed";
      await supabase.from("publish_jobs").update({ state: newState }).eq("id", jobId);

      toast({
        title: "Queue Canceled",
        description: "Status reverted successfully.",
      });
      await refreshJobs();
    } catch (e: any) {
      toast({
        title: "Cancel Failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setJobActionLoadingId(null);
    }
  };

  const copyError = (error: string, jobId: string) => {
    void navigator.clipboard.writeText(error);
    toast({
      title: "Logs Copied",
      description: `Error details for job ${jobId.slice(0, 8)} copied to clipboard.`,
    });
  };

  const filteredJobs = jobs.filter((job) => {
    const effectiveState = getContentPipelineState({
      contentStatus: job.content_status as any,
      publishJobState: job.state as any,
    });

    // Filtering by status
    if (statusFilter !== "all") {
       if (statusFilter === "scheduled") {
          const s = effectiveState;
          if (s !== "scheduled" && s !== "queued" && s !== "publishing") return false;
       } else if (effectiveState !== statusFilter) {
          return false;
       }
    }

    // Platform Filtering
    if (platformFilter !== "all") {
       if (!job.platforms || !job.platforms.includes(platformFilter)) return false;

       // For published content, strictly check if it actually reached THIS platform
       const effectiveStateForFilter = getContentPipelineState({
         contentStatus: job.content_status as any,
         publishJobState: job.state as any,
       });

       if (effectiveStateForFilter === "published") {
         const hasLink = !!getPlatformLink(platformFilter, job.content_metadata, job.content_type, (job as any).url);
         if (!hasLink) return false;
       }
    }

    if (mode === "posts" && job.content_type !== "post") return false;
    if (mode === "stories" && job.content_type !== "story") return false;

    const q = query.trim().toLowerCase();
    if (!q) return true;

    const title = (job.title ?? "").toLowerCase();
    const contentId = (job.content_id ?? "").toLowerCase();
    const lastError = (job.last_error ?? "").toLowerCase();

    return title.includes(q) || contentId.includes(q) || lastError.includes(q);
  }).sort((a, b) => new Date(b.run_at).getTime() - new Date(a.run_at).getTime());

  const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
  const paginatedJobs = filteredJobs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);



  return (
    <DashboardLayout>
      <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activity History</h1>
          <p className="text-muted-foreground mt-1 text-sm">Detailed audit trail of your automated publishing workflow.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted/40 p-1 rounded-xl border border-border/50 mr-2">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className={`h-8 w-8 rounded-lg transition-all ${viewMode === "grid" ? "shadow-sm bg-background" : "opacity-40"}`}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className={`h-8 w-8 rounded-lg transition-all ${viewMode === "list" ? "shadow-sm bg-background" : "opacity-40"}`}
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" className="h-9 px-4 font-semibold" onClick={() => navigate("/calendar")}>
            Calendar View
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="border-none shadow-sm bg-primary/5">
          <CardContent className="p-4 flex items-center gap-4">
             <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <TrendingUp className="h-5 w-5" />
             </div>
             <div>
               <p className="text-[10px] font-semibold text-primary/70 uppercase tracking-widest">Success Rate</p>
               <p className="text-xl font-bold">{stats.successRate}%</p>
             </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-chart-3/5">
          <CardContent className="p-4 flex items-center gap-4">
             <div className="h-12 w-12 rounded-2xl bg-chart-3/10 flex items-center justify-center text-chart-3">
                <CheckCircle2 className="h-5 w-5" />
             </div>
             <div>
               <p className="text-[10px] font-semibold text-chart-3/70 uppercase tracking-widest">Published</p>
               <p className="text-xl font-bold">{stats.totalPublished}</p>
             </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-4">
             <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive">
                <XCircle className="h-5 w-5" />
             </div>
             <div>
               <p className="text-[10px] font-semibold text-destructive/70 uppercase tracking-widest">Failures</p>
               <p className="text-xl font-bold">{stats.totalFailed}</p>
             </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-chart-4/5">
          <CardContent className="p-4 flex items-center gap-4">
             <div className="h-12 w-12 rounded-2xl bg-chart-4/10 flex items-center justify-center text-chart-4">
                <Calendar className="h-5 w-5" />
             </div>
             <div>
               <p className="text-[10px] font-semibold text-chart-4/70 uppercase tracking-widest">Scheduled</p>
               <p className="text-xl font-bold">{stats.totalScheduled}</p>
             </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-4">
        <Card className="border-none shadow-sm bg-muted/50 w-full sm:w-1/4">
          <CardContent className="p-4 flex items-center gap-4">
             <div className="h-12 w-12 rounded-2xl bg-muted-foreground/10 flex items-center justify-center text-muted-foreground">
                <RotateCcw className="h-5 w-5" />
             </div>
             <div>
               <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Volume</p>
               <p className="text-xl font-bold">{stats.postsVolume + stats.storiesVolume}</p>
             </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="py-6 space-y-4">
            <div className="flex flex-col gap-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <Tabs value={mode} onValueChange={(v) => setMode(v as HistoryMode)}>
                <TabsList className="grid grid-cols-3 w-full lg:w-[320px] h-10 p-1 bg-muted/30">
                  <TabsTrigger value="all" className="rounded-md font-semibold text-[11px] uppercase tracking-wide">All</TabsTrigger>
                  <TabsTrigger value="posts" className="rounded-md font-semibold text-[11px] uppercase tracking-wide">Posts</TabsTrigger>
                  <TabsTrigger value="stories" className="rounded-md font-semibold text-[11px] uppercase tracking-wide">Stories</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/50">
                  <Button
                    variant={statusFilter === "all" ? "secondary" : "ghost"}
                    size="sm"
                    className={`h-7 text-[10px] px-3 font-semibold rounded-lg transition-all ${statusFilter === 'all' ? 'shadow-sm' : ''}`}
                    onClick={() => setStatusFilter("all")}
                  >
                    ALL STATUS
                  </Button>
                  <Button
                    variant={statusFilter === "published" ? "secondary" : "ghost"}
                    size="sm"
                    className={`h-7 text-[10px] px-3 font-semibold rounded-lg transition-all ${statusFilter === 'published' ? 'shadow-sm text-chart-3' : ''}`}
                    onClick={() => setStatusFilter("published")}
                  >
                    PUBLISHED
                  </Button>
                  <Button
                    variant={statusFilter === "failed" ? "secondary" : "ghost"}
                    size="sm"
                    className={`h-7 text-[10px] px-3 font-semibold rounded-lg transition-all ${statusFilter === 'failed' ? 'shadow-sm text-destructive' : ''}`}
                    onClick={() => setStatusFilter("failed")}
                  >
                    FAILED
                  </Button>
                  <Button
                    variant={statusFilter === "scheduled" ? "secondary" : "ghost"}
                    size="sm"
                    className={`h-7 text-[10px] px-3 font-semibold rounded-lg transition-all ${statusFilter === 'scheduled' ? 'shadow-sm text-chart-4' : ''}`}
                    onClick={() => setStatusFilter("scheduled")}
                  >
                    SCHEDULED
                  </Button>
                </div>

                <div className="h-7 w-[1px] bg-border/60 mx-1 hidden sm:block" />

                <div className="flex items-center gap-1 bg-muted/20 p-1 rounded-lg">
                  {['all', 'instagram', 'facebook', 'linkedin', 'twitter'].map((p) => (
                    <Button
                      key={p}
                      variant={platformFilter === p ? "secondary" : "ghost"}
                      size="icon"
                      className={`h-7 w-7 rounded-md transition-all ${platformFilter === p ? 'shadow-sm bg-background border border-border/20' : 'opacity-50'}`}
                      onClick={() => setPlatformFilter(p)}
                    >
                      {p === 'all' ? <span className="text-[9px] font-bold">ALL</span> : <PlatformIcon platform={p} />}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/10 p-4 rounded-xl border border-border/40 shadow-sm relative overflow-hidden">
               {/* Bulk Action Overlay */}
               {selectedIds.length > 0 && (
                 <div className="absolute inset-0 bg-primary/95 text-primary-foreground flex items-center justify-between px-6 z-10 animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-4">
                       <span className="text-sm font-bold uppercase tracking-wider">{selectedIds.length} Selected</span>
                       <div className="h-6 w-[1px] bg-primary-foreground/20" />
                       <Button variant="ghost" className="h-8 font-semibold text-[11px] hover:bg-white/10" onClick={() => setSelectedIds([])}>Deselect All</Button>
                    </div>
                    <div className="flex items-center gap-2">
                       <Button variant="secondary" className="h-8 font-bold text-[11px] px-4 flex items-center gap-2 shadow-lg" onClick={handleBulkRequeue}>
                          <RotateCcw className="h-3 w-3" /> REQUEUE ALL
                       </Button>
                       <Button variant="ghost" className="h-8 font-bold text-[11px] px-4 flex items-center gap-2 hover:bg-destructive text-white" onClick={handleBulkDelete}>
                          <Trash2 className="h-3 w-3" /> REMOVE LOGS
                       </Button>
                    </div>
                 </div>
               )}

              <div className="relative w-full sm:w-[500px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <Input
                  className="pl-10 h-10 bg-background/50 border-muted-foreground/10 focus-visible:ring-primary/10 transition-all rounded-lg text-sm"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search logs..."
                  disabled={loading}
                />
              </div>

              <div className="flex items-center gap-3">
                <Button 
                  variant="outline" 
                  className="h-10 px-5 rounded-lg border-muted-foreground/10 hover:bg-background transition-all font-semibold text-sm group shadow-sm" 
                  onClick={() => { setSelectedIds([]); void refreshJobs(); }} 
                  disabled={loading}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-2 group-hover:rotate-180 transition-transform duration-500 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-8">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <RefreshCw className="h-10 w-10 animate-spin text-primary/40" />
                <p className="text-muted-foreground font-medium">Crunching your activity data...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20 text-destructive gap-3">
                <AlertCircle className="h-12 w-12" />
                <p className="font-semibold">{error}</p>
                <Button variant="ghost" onClick={() => void refreshJobs()}>Try Again</Button>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mb-6">
                  <FileText className="h-10 w-10 text-muted-foreground/40" />
                </div>
                <h3 className="text-xl font-bold mb-2">Clear as a whistle</h3>
                <p className="text-muted-foreground max-w-sm mx-auto">No activity found matching your current filters. Try broadening your search or switching tabs.</p>
                <Button variant="link" className="mt-4 font-bold" onClick={() => { setQuery(""); setStatusFilter("all"); setMode("all"); setPlatformFilter("all"); }}>
                  Reset all filters
                </Button>
              </div>
            ) : viewMode === "list" ? (
              <div className="overflow-hidden rounded-xl border border-border/40">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border/40 bg-muted/5">
                        <th className="h-10 px-4 w-10 text-center">
                           <Checkbox 
                              checked={selectedIds.length === filteredJobs.length && filteredJobs.length > 0} 
                              onCheckedChange={toggleAll}
                              className="border-muted-foreground/30 data-[state=checked]:bg-primary h-4 w-4 rounded-[4px]"
                           />
                        </th>
                        <th className="font-semibold h-10 px-4 whitespace-nowrap text-[10px] uppercase tracking-widest text-muted-foreground/40 text-center">Date</th>
                        <th className="font-semibold h-10 px-4 min-w-[280px] text-[10px] uppercase tracking-widest text-muted-foreground/40">Details</th>
                        <th className="font-semibold h-10 px-4 text-[10px] uppercase tracking-widest text-muted-foreground/40 text-center">Apps</th>
                        <th className="font-semibold h-10 px-4 text-[10px] uppercase tracking-widest text-muted-foreground/40">State</th>
                        <th className="font-semibold h-10 px-4 text-right text-[10px] uppercase tracking-widest text-muted-foreground/40">Toolbox</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {paginatedJobs.map((job) => {
                          const effectiveState = getContentPipelineState({
                            contentStatus: job.content_status as any,
                            publishJobState: job.state as any,
                          });
                          const isSelected = selectedIds.includes(job.id);

                          return (
                            <tr key={job.id} className={`group hover:bg-muted/5 transition-colors ${isSelected ? 'bg-primary/[0.03]' : ''}`}>
                               <td className="py-4 px-4 w-10">
                                  <Checkbox 
                                     checked={isSelected} 
                                     onCheckedChange={() => toggleSelection(job.id)}
                                     className="border-muted-foreground/20 data-[state=checked]:bg-primary h-4 w-4 rounded-[4px]"
                                  />
                               </td>
                               <td className="py-4 px-4 whitespace-nowrap text-center">
                                <div className="flex flex-col">
                                  <span className="font-semibold text-foreground text-sm tracking-tight">{format(parseISO(job.run_at), "MMM d")}</span>
                                  <span className="text-[10px] opacity-40 font-medium tracking-widest">{format(parseISO(job.run_at), "HH:mm")}</span>
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-semibold text-[15px] flex items-center gap-2 group-hover:text-primary transition-colors">
                                    {job.content_missing ? (
                                      <span className="text-muted-foreground/50 line-through italic font-normal">Removed</span>
                                    ) : (
                                      job.title || "(No Title)"
                                    )}
                                    <Badge variant="outline" className="text-[8px] h-3.5 font-bold tracking-widest uppercase px-1 opacity-40 group-hover:opacity-100 transition-opacity">
                                      {job.content_type}
                                    </Badge>
                                  </span>
                                  <div className="flex items-center gap-3">
                                     {job.content_id && (
                                       <span className="text-[10px] text-muted-foreground/40 font-mono">#{job.content_id.slice(-6)}</span>
                                     )}
                                     {job.retry_count > 0 && (
                                       <span className="text-[10px] text-chart-4/60 font-medium">
                                          {job.retry_count} {job.retry_count === 1 ? 'retry' : 'retries'}
                                       </span>
                                     )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                 <div className="flex items-center justify-center gap-1.5 min-w-[80px]">
                                    {job.platforms && job.platforms.filter(Boolean).length > 0 ? (
                                       job.platforms
                                         .filter(Boolean)
                                         .filter(p => {
                                            if (effectiveState === 'published') {
                                               return !!getPlatformLink(p, job.content_metadata, job.content_type, (job as any).url);
                                            }
                                            return true;
                                         })
                                         .map((p, idx) => {
                                            const link = getPlatformLink(p, job.content_metadata, job.content_type, (job as any).url);
                                            return (
                                              <PlatformIcon key={idx} platform={p} link={link} />
                                            );
                                         })
                                    ) : (
                                       <span className="text-[9px] text-muted-foreground/20 font-medium italic">-</span>
                                    )}
                                 </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex flex-col items-start gap-1">
                                   <Badge
                                     variant="outline"
                                     className={
                                       job.content_missing
                                         ? "bg-destructive/5 text-destructive border-transparent font-semibold"
                                         : `${getContentPipelineStateBadgeClassName(effectiveState)} font-semibold px-2 py-0 border-transparent tracking-tight text-[9px] h-4 uppercase`
                                     }
                                   >
                                     {job.content_missing ? "Deleted" : getContentPipelineStateLabel(effectiveState)}
                                   </Badge>
                                </div>
                              </td>
                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                              {jobActionLoadingId === job.id ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
                              ) : effectiveState === "queued" || effectiveState === "publishing" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive h-8 text-[10px] font-bold hover:bg-destructive/10 rounded-md px-3"
                                  onClick={() => handleCancelRequeue(job.id, job.content_id, job.content_type, !!job.published_at, !!job.last_error)}
                                >
                                  HALT
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-3 text-[10px] font-semibold bg-background border-border/20 shadow-none hover:bg-muted"
                                    onClick={() => handleRequeue(job)}
                                    disabled={job.content_missing}
                                  >
                                    Requeue
                                  </Button>
                                  
                                  <DropdownMenu>
                                     <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" className="h-8 w-8 p-0 opacity-40 hover:opacity-100">
                                           <MoreVertical className="h-3.5 w-3.5" />
                                        </Button>
                                     </DropdownMenuTrigger>
                                     <DropdownMenuContent align="end" className="w-40">
                                        <DropdownMenuItem 
                                          className="text-xs font-semibold" 
                                          onClick={() => {
                                            const routePrefix = job.content_type === "story" ? "/stories" : "/posts";
                                            navigate(`${routePrefix}/${job.content_id}/edit`);
                                          }} 
                                          disabled={job.content_missing || effectiveState === 'published'}
                                        >
                                           <ExternalLink className="h-3 w-3 mr-2 opacity-40" /> Edit Detail
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="text-destructive text-xs font-semibold" onClick={async () => {
                                           if (window.confirm("Remove log?")) {
                                              await supabase.from("publish_jobs").delete().eq("id", job.id);
                                              await refreshJobs();
                                           }
                                        }}>
                                           <Trash2 className="h-3 w-3 mr-2" /> Delete Log
                                        </DropdownMenuItem>
                                     </DropdownMenuContent>
                                  </DropdownMenu>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {paginatedJobs.map((job) => {
                    const effectiveState = getContentPipelineState({
                      contentStatus: job.content_status as any,
                      publishJobState: job.state as any,
                    });
                    const pipelineUI = getContentPipelineStateUI(effectiveState);
                    const isSelected = selectedIds.includes(job.id);
                    
                    // Extract image preview
                    const metadata = job.content_metadata || {};
                    const previewUrl = metadata.image_url || metadata.imageUrl || metadata.media_url || metadata.video_thumbnail_url;
                    const isStory = job.content_type === "story";
                    
                    return (
                      <Card 
                        key={job.id} 
                        className={cn(
                          "group relative overflow-hidden transition-all duration-300",
                          "hover:shadow-lg hover:-translate-y-0.5",
                          "border border-border/60",
                          isSelected && "ring-2 ring-primary shadow-md"
                        )}
                      >
                        {/* Selection checkbox overlay */}
                        <div className="absolute top-3 left-3 z-10">
                           <Checkbox 
                             checked={isSelected} 
                             onCheckedChange={() => toggleSelection(job.id)}
                             className="bg-background/80 backdrop-blur-sm shadow-sm"
                           />
                        </div>

                        {/* Media Preview Area */}
                        <div className="relative w-full h-44 bg-muted/30 overflow-hidden cursor-pointer" onClick={() => toggleSelection(job.id)}>
                          {previewUrl ? (
                            <img src={previewUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          ) : (
                            <div className="h-full w-full flex flex-col items-center justify-center opacity-20 gap-2 bg-gradient-to-br from-muted/50 to-muted">
                              {isStory ? <FileText className="h-10 w-10" /> : <LayoutGrid className="h-10 w-10" />}
                              <span className="text-[10px] font-bold uppercase tracking-widest">No Media</span>
                            </div>
                          )}
                          
                          {/* Status and Type Badges Overlay */}
                          <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
                             <Badge className={cn("border-none text-[8px] font-bold uppercase px-2 h-5 shadow-sm", pipelineUI.badgeClassName)}>
                               {pipelineUI.label}
                             </Badge>
                             <Badge variant="outline" className="bg-background/80 backdrop-blur-sm border-0 shadow-sm text-[8px] font-bold uppercase h-5 text-muted-foreground">
                                {job.content_type}
                             </Badge>
                          </div>

                          {/* Info Overlay at bottom of media */}
                          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                             <p className="text-white text-sm font-bold truncate leading-tight">{job.title || "(No Title)"}</p>
                             <div className="flex items-center gap-2 mt-1">
                               <span className="text-white/60 text-[10px] font-medium flex items-center gap-1">
                                 <Calendar className="h-3 w-3" />
                                 {format(parseISO(job.run_at), "MMM d, HH:mm")}
                               </span>
                             </div>
                          </div>
                        </div>

                        <CardContent className="p-4 space-y-3">
                          {/* Type and Platforms Info */}
                          <div className="space-y-1.5">
                             <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Type:</span>
                                <span className="text-[10px] font-medium text-foreground capitalize">{job.content_type}</span>
                             </div>

                             {job.platforms && job.platforms.length > 0 && (
                               <div className="flex flex-wrap gap-1 mt-1">
                                 {job.platforms
                                   .filter(p => {
                                      if (effectiveState === 'published') {
                                         return !!getPlatformLink(p, job.content_metadata, job.content_type, (job as any).url);
                                      }
                                      return true;
                                   })
                                   .map((platform) => {
                                    const platformKey = normalizeSocialPlatform(platform);
                                    if (!platformKey) return null;
                                    const config = platformConfig[platformKey];
                                    if (!config) return null;
                                    const PlatformIconComp = config.icon;
                                    return (
                                      <div
                                        key={platform}
                                        className={cn(
                                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tight",
                                          config.bgColor, config.color
                                        )}
                                      >
                                        <PlatformIconComp className="h-2.5 w-2.5" />
                                        {config.label}
                                      </div>
                                    );
                                 })}
                               </div>
                             )}
                          </div>

                          {/* Published info if relevant */}
                          {effectiveState === 'published' && job.published_at && (
                             <div className="pt-1">
                                <p className="text-[10px] text-muted-foreground font-medium">
                                  <span className="font-bold text-primary/70">Published:</span> {format(new Date(job.published_at), "PPp")}
                                </p>
                             </div>
                          )}

                          {/* Last Error if failed */}
                          {effectiveState === 'failed' && job.last_error && (
                             <div className="p-2 bg-destructive/5 rounded-md border border-destructive/10">
                                <p className="text-[10px] text-destructive font-medium line-clamp-2 italic leading-relaxed">
                                  {job.last_error}
                                </p>
                             </div>
                          )}

                          {/* Footer Actions */}
                          <div className="flex items-center justify-between pt-2 border-t border-border/50">
                             <div className="flex gap-2 flex-wrap">
                                {effectiveState === 'published' && (
                                  <>
                                    {job.platforms?.map((p, idx) => {
                                      const link = getPlatformLink(p, job.content_metadata, job.content_type, (job as any).url);
                                      if (!link) return null;
                                      return (
                                        <Button
                                          key={idx}
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2.5 text-[9px] font-bold bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 transition-all gap-1.5 uppercase"
                                          onClick={(e) => { e.stopPropagation(); window.open(link, "_blank"); }}
                                        >
                                          {p}
                                          <ExternalLink className="h-3 w-3" />
                                        </Button>
                                      );
                                    })}
                                  </>
                                )}

                                {effectiveState !== 'published' && effectiveState !== 'queued' && effectiveState !== 'publishing' && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 px-3 text-[10px] font-bold shadow-sm"
                                    onClick={(e) => { e.stopPropagation(); handleRequeue(job); }}
                                    disabled={job.content_missing}
                                  >
                                    Requeue
                                  </Button>
                                )}
                                
                                {(effectiveState === 'queued' || effectiveState === 'publishing') && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-3 text-[10px] font-bold text-destructive hover:bg-destructive/10"
                                    onClick={(e) => { e.stopPropagation(); handleCancelRequeue(job.id, job.content_id, job.content_type, !!job.published_at, !!job.last_error); }}
                                  >
                                    Halt Queue
                                  </Button>
                                )}
                             </div>

                             <div className="flex items-center gap-1">
                                <DropdownMenu>
                                   <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" className="h-7 w-7 p-0 opacity-40 hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                                         <MoreVertical className="h-3.5 w-3.5" />
                                      </Button>
                                   </DropdownMenuTrigger>
                                   <DropdownMenuContent align="end" className="w-40">
                                      <DropdownMenuItem 
                                        className="text-xs font-semibold" 
                                        onClick={() => {
                                          const routePrefix = job.content_type === "story" ? "/stories" : "/posts";
                                          navigate(`${routePrefix}/${job.content_id}/edit`);
                                        }} 
                                        disabled={job.content_missing || effectiveState === 'published'}
                                      >
                                         <ExternalLink className="h-3 w-3 mr-2 opacity-50" /> Edit Detail
                                      </DropdownMenuItem>
                                      {job.last_error && (
                                        <DropdownMenuItem className="text-xs font-semibold" onClick={() => copyError(job.last_error!, job.id)}>
                                           <Copy className="h-3 w-3 mr-2 opacity-50" /> Copy Error
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem className="text-destructive text-xs font-semibold" onClick={async () => {
                                         if (window.confirm("Remove log?")) {
                                            await supabase.from("publish_jobs").delete().eq("id", job.id);
                                            await refreshJobs();
                                         }
                                      }}>
                                         <Trash2 className="h-3 w-3 mr-2" /> Delete Log
                                      </DropdownMenuItem>
                                   </DropdownMenuContent>
                                </DropdownMenu>
                             </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                })}
              </div>
            )}

            {/* Pagination UI */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-8 border-t border-border/10 pt-6">
                <p className="text-xs text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-semibold text-foreground">{Math.min(currentPage * itemsPerPage, filteredJobs.length)}</span> of <span className="font-semibold text-foreground">{filteredJobs.length}</span> results
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum = i + 1;
                      if (totalPages > 5 && currentPage > 3) {
                         pageNum = currentPage - 2 + i;
                         if (pageNum + 2 > totalPages) pageNum = totalPages - 4 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "secondary" : "ghost"}
                          size="sm"
                          className={`h-8 w-8 rounded-lg font-bold text-xs ${currentPage === pageNum ? 'bg-primary/10 text-primary hover:bg-primary/20' : ''}`}
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Requeue Content</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">New Title (Optional)</Label>
              <Input
                id="title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter a title for this piece of content"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="runAt">New Schedule Time</Label>
              <Input
                id="runAt"
                type="datetime-local"
                value={newRunAt}
                onChange={(e) => setNewRunAt(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmRequeue} disabled={jobActionLoadingId === selectedJob?.id}>
              {jobActionLoadingId === selectedJob?.id && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              Queue Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
