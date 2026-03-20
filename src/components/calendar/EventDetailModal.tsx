import { format, parseISO } from "date-fns";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Edit,
  Trash2,
  Calendar,
  Clock,
  FileText,
  Image,
  Film,
  Type,
  Images,
  Play,
  Linkedin,
  Facebook,
  Instagram,
  Youtube,
  Twitter,
  Globe,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import type { ContentItem, ContentKind } from "@/types/calendar";
import {
  normalizeSocialPlatform,
  SOCIAL_STATUS_PENDING_APPROVAL,
  type SocialPlatform,
  type SocialStatus,
} from "@/types/social";
import { useAuth } from "@/contexts/AuthContext";
import { reviewContentApproval } from "@/lib/api/approvals";
import { getContentEditPath, getContentLabel } from "@/lib/content/contentRouting";
import {
  getContentPipelineState,
  getContentPipelineStateDotClassName,
  getContentPipelineStateUI,
} from "@/lib/publishing/statusPipeline";

const APPROVALS_ENABLED = import.meta.env.VITE_ENABLE_APPROVALS === "true";

interface EventDetailModalProps {
  event: ContentItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (id: string, kind: ContentKind) => void;
  onAfterReview?: () => void;
}

const platformConfig: Record<SocialPlatform, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
  linkedin: { icon: Linkedin, color: "text-[hsl(210,90%,40%)]", bgColor: "bg-[hsl(210,90%,40%)]/10", label: "LinkedIn" },
  facebook: { icon: Facebook, color: "text-[hsl(220,80%,52%)]", bgColor: "bg-[hsl(220,80%,52%)]/10", label: "Facebook" },
  instagram: { icon: Instagram, color: "text-[hsl(340,82%,52%)]", bgColor: "bg-[hsl(340,82%,52%)]/10", label: "Instagram" },
  youtube: { icon: Youtube, color: "text-destructive", bgColor: "bg-destructive/10", label: "YouTube" },
  twitter: { icon: Twitter, color: "text-[hsl(203,89%,53%)]", bgColor: "bg-[hsl(203,89%,53%)]/10", label: "Twitter / X" },
};

function getTypeConfig(type: string | null) {
  switch (type?.toLowerCase()) {
    case "image": return { icon: Image, label: "Image", color: "text-accent" };
    case "carousel": return { icon: Images, label: "Carousel", color: "text-accent" };
    case "video": case "short": case "reel": return { icon: Film, label: type || "Video", color: "text-destructive" };
    case "pdf": case "document": return { icon: FileText, label: "Document", color: "text-chart-4" };
    case "text": return { icon: Type, label: "Text", color: "text-primary" };
    default: return { icon: FileText, label: type || "Post", color: "text-muted-foreground" };
  }
}

export function EventDetailModal({ event, open, onOpenChange, onDelete, onAfterReview }: EventDetailModalProps) {
  const navigate = useNavigate();
  const { workspaceId, isAdmin } = useAuth();

  const [reviewLoading, setReviewLoading] = useState<"approved" | "rejected" | null>(null);

  if (!event) return null;

  const typeConfig = getTypeConfig(event.kind === "post" ? event.type_of_post : event.type_of_story);
  const TypeIcon = typeConfig.icon;
  const pipelineState = getContentPipelineState({
    contentStatus: event.status,
    publishJobState: event.publish_job_state ?? null,
  });
  const pipelineUI = getContentPipelineStateUI(pipelineState);
  const isPost = event.kind === "post";
  const hasMedia = event.image || event.video || event.pdf;

  const handleEdit = () => {
    onOpenChange(false);
    navigate(getContentEditPath(event.kind, event.id));
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(event.id, event.kind);
      onOpenChange(false);
    }
  };

  const handleReview = async (decision: "approved" | "rejected") => {
    if (!workspaceId || !isAdmin) return;

    setReviewLoading(decision);
    try {
      await reviewContentApproval({
        workspaceId,
        contentType: event.kind,
        contentId: event.id,
        decision,
        note: null,
      });

      toast.success(decision === "approved" ? "Content approved." : "Content rejected.");
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : "Failed to submit review decision.";
      toast.error(message);
    } finally {
      setReviewLoading(null);
      // Let the Calendar refresh its event/chip state after the modal closes.
      // (If the parent doesn't provide this callback, the modal still closes.)
      onAfterReview?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden gap-0">
        {/* Media Preview */}
        {hasMedia && (
          <div className="relative w-full h-52 bg-muted/30 overflow-hidden">
            {event.image && (
              <img
                src={event.image}
                alt={event.title}
                className="w-full h-full object-cover"
              />
            )}
            {event.video && !event.image && (
              <div className="w-full h-full flex items-center justify-center bg-muted/60">
                <div className="w-16 h-16 rounded-full bg-background/90 shadow-xl flex items-center justify-center backdrop-blur-sm">
                  <Play className="h-7 w-7 text-foreground ml-0.5" />
                </div>
              </div>
            )}
            {event.pdf && !event.image && !event.video && (
              <div className="w-full h-full flex flex-col items-center justify-center bg-muted/20 gap-2">
                <FileText className="h-12 w-12 text-muted-foreground" />
                <span className="text-sm text-muted-foreground font-medium">PDF Document</span>
              </div>
            )}
            {/* Type overlay */}
            <div className="absolute top-3 left-3">
              <Badge className={cn(
                "gap-1 font-semibold text-xs border-0 shadow-md",
                isPost
                  ? "bg-primary/90 text-primary-foreground"
                  : "bg-accent/90 text-accent-foreground"
              )}>
                {isPost ? <FileText className="h-3 w-3" /> : <Image className="h-3 w-3" />}
                {isPost ? "Post" : "Story"}
              </Badge>
            </div>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Header */}
          <DialogHeader className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {!hasMedia && (
                  <Badge className={cn(
                    "gap-1 font-semibold text-xs border-0 mb-2",
                    isPost
                      ? "bg-primary/15 text-primary"
                      : "bg-accent/15 text-accent"
                  )}>
                    {isPost ? <FileText className="h-3 w-3" /> : <Image className="h-3 w-3" />}
                    {isPost ? "Post" : "Story"}
                  </Badge>
                )}
                <DialogTitle className="text-xl font-bold leading-tight">
                  {event.title || "Untitled"}
                </DialogTitle>
              </div>
              <Badge variant="outline" className={cn("shrink-0 text-xs font-semibold border", pipelineUI.badgeClassName)}>
                {pipelineUI.label}
              </Badge>
            </div>
          </DialogHeader>

          {APPROVALS_ENABLED && event.status === SOCIAL_STATUS_PENDING_APPROVAL && (
            <div className="text-sm bg-chart-2/10 border border-chart-2/30 rounded-md px-3 py-2 text-chart-2">
              This content is pending workspace approval. Publishing will start once it is approved.
            </div>
          )}

          {/* Publishing pipeline info (queue state + retries) */}
          {event.publish_job_state ? (
            <div className={cn("text-sm rounded-md px-3 py-2 border", event.publish_job_state === "failed" ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-chart-3/10 border-chart-3/30 text-chart-3")}>
              <div className="flex items-start gap-2">
                <div className={cn("w-2 h-2 mt-2 rounded-full", getContentPipelineStateDotClassName(pipelineState))} />
                <div className="space-y-1">
                  <div className="font-medium">
                    {pipelineState === "retrying"
                      ? `Retrying (${event.publish_retry_count ?? 0} attempt${(event.publish_retry_count ?? 0) === 1 ? "" : "s"})`
                      : pipelineState === "failed"
                        ? `Failed (${event.publish_retry_count ?? 0} retries)`
                        : pipelineUI.label}
                  </div>
                  {((pipelineState === "queued" || pipelineState === "retrying") && event.publish_run_at) ? (
                    <div className="text-xs text-muted-foreground">
                      Next run: {format(parseISO(event.publish_run_at), "MMM d, yyyy HH:mm")}
                    </div>
                  ) : null}
                  {event.publish_last_error ? (
                    <div className="text-xs text-destructive mt-1 font-mono truncate max-w-full">
                      {event.publish_last_error}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* Description */}
          {event.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{event.description}</p>
          )}

          {/* Content Type & Schedule */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <TypeIcon className={cn("h-4 w-4", typeConfig.color)} />
              <span className="font-medium capitalize">{typeConfig.label}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{format(parseISO(event.scheduled_at!), "MMM d, yyyy")}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{format(parseISO(event.scheduled_at!), "h:mm a")}</span>
            </div>
          </div>

          {/* Text Content */}
          {event.text && (
            <div className="bg-muted/30 rounded-lg p-3.5 border border-border/50">
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap line-clamp-6">
                {event.text}
              </p>
            </div>
          )}

          {/* Platforms */}
          {event.platforms && event.platforms.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Platforms</span>
              <div className="flex flex-wrap gap-2">
                {event.platforms.map((platform) => {
                  const platformKey = normalizeSocialPlatform(platform);
                  if (!platformKey) return null;
                  const config = platformConfig[platformKey];
                  if (!config) return null;
                  const PlatformIcon = config.icon;
                  return (
                    <div
                      key={platform}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold",
                        config.bgColor, config.color
                      )}
                    >
                      <PlatformIcon className="h-3.5 w-3.5" />
                      {config.label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tags */}
          {event.tags && event.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {event.tags.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-xs font-medium">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-border/50">
            {APPROVALS_ENABLED && isAdmin && event.status === SOCIAL_STATUS_PENDING_APPROVAL && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={reviewLoading !== null}
                  onClick={() => void handleReview("approved")}
                >
                  {reviewLoading === "approved" ? "…" : "Approve"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={reviewLoading !== null}
                  onClick={() => void handleReview("rejected")}
                >
                  {reviewLoading === "rejected" ? "…" : "Reject"}
                </Button>
              </div>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {getContentLabel(event.kind)}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. The selected item will be permanently deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" onClick={handleEdit}>
              <Edit className="h-4 w-4 mr-1.5" />
              Edit {getContentLabel(event.kind)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
