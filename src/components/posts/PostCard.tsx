import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  ChevronDown,
  ChevronUp,
  Image,
  Film,
  FileText,
  Type,
  Images,
  Play,
  Linkedin,
  Facebook,
  Instagram,
  Youtube,
  Twitter,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Post } from "@/types/post";
import {
  normalizeSocialPlatform,
  type SocialPlatform,
  type SocialStatus,
} from "@/types/social";

interface PostCardProps {
  post: Post;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDelete: (id: string) => void;
}

const platformConfig: Record<SocialPlatform, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
  linkedin: { icon: Linkedin, color: "text-[#0A66C2]", bgColor: "bg-[#0A66C2]/10", label: "LinkedIn" },
  facebook: { icon: Facebook, color: "text-[#1877F2]", bgColor: "bg-[#1877F2]/10", label: "Facebook" },
  instagram: { icon: Instagram, color: "text-[#E4405F]", bgColor: "bg-[#E4405F]/10", label: "Instagram" },
  youtube: { icon: Youtube, color: "text-[#FF0000]", bgColor: "bg-[#FF0000]/10", label: "YouTube" },
  twitter: { icon: Twitter, color: "text-[#1DA1F2]", bgColor: "bg-[#1DA1F2]/10", label: "Twitter / X" },
};

const statusConfig: Record<SocialStatus, { className: string; label: string }> = {
  published: { className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20", label: "Published" },
  scheduled: { className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20", label: "Scheduled" },
  draft: { className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20", label: "Draft" },
  failed: { className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20", label: "Failed" },
};

function getPostTypeConfig(type: string | null) {
  switch (type?.toLowerCase()) {
    case "image":
      return { icon: Image, label: "Image Post", color: "text-violet-600 dark:text-violet-400" };
    case "carousel":
      return { icon: Images, label: "Carousel", color: "text-pink-600 dark:text-pink-400" };
    case "video":
    case "short":
    case "reel":
      return { icon: Film, label: type, color: "text-rose-600 dark:text-rose-400" };
    case "pdf":
    case "document":
      return { icon: FileText, label: "Document", color: "text-orange-600 dark:text-orange-400" };
    case "text":
      return { icon: Type, label: "Text Post", color: "text-sky-600 dark:text-sky-400" };
    default:
      return { icon: FileText, label: type || "Post", color: "text-muted-foreground" };
  }
}

export function PostCard({ post, isSelected, onToggleSelect, onDelete }: PostCardProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const typeConfig = getPostTypeConfig(post.type_of_post);
  const TypeIcon = typeConfig.icon;
  const status = statusConfig[post.status];

  const hasMedia = post.image || post.video || post.pdf;
  const hasLongText = (post.text?.length || 0) > 120;

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-300",
        "hover:shadow-lg hover:-translate-y-0.5",
        "border border-border/60",
        isSelected && "ring-2 ring-primary shadow-md"
      )}
    >
      {/* Selection checkbox - top left */}
      <div className="absolute top-3 left-3 z-10">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          className="bg-background/80 backdrop-blur-sm"
        />
      </div>

      {/* Media Preview Area */}
      {hasMedia && (
        <div className="relative w-full h-40 bg-muted/50 overflow-hidden">
          {post.image && (
            <img
              src={post.image}
              alt={post.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          )}
          {post.video && !post.image && (
            <div className="w-full h-full flex items-center justify-center bg-muted/80">
              <div className="w-14 h-14 rounded-full bg-background/90 shadow-lg flex items-center justify-center">
                <Play className="h-6 w-6 text-foreground ml-0.5" />
              </div>
            </div>
          )}
          {post.pdf && !post.image && !post.video && (
            <div className="w-full h-full flex flex-col items-center justify-center bg-muted/40 gap-2">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">PDF Document</span>
            </div>
          )}

          {/* Post type badge overlay */}
          <div className="absolute top-3 right-3">
            <Badge variant="outline" className="bg-background/80 backdrop-blur-sm border-0 shadow-sm text-xs gap-1">
              <TypeIcon className={cn("h-3 w-3", typeConfig.color)} />
              {typeConfig.label}
            </Badge>
          </div>
        </div>
      )}

      <CardContent className={cn("p-4 space-y-3", !hasMedia && "pt-5")}>
        {/* Header: Title + Status */}
        <div className="flex items-start justify-between gap-2 pl-6">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base leading-tight truncate">
              {post.title || "Untitled Post"}
            </h3>
            {post.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {post.description}
              </p>
            )}
          </div>
          <Badge variant="outline" className={cn("shrink-0 text-[10px] font-semibold border", status.className)}>
            {status.label}
          </Badge>
        </div>

        {/* Post type (when no media to show it as overlay) */}
        {!hasMedia && post.type_of_post && (
          <div className="flex items-center gap-1.5 pl-6">
            <TypeIcon className={cn("h-3.5 w-3.5", typeConfig.color)} />
            <span className="text-xs text-muted-foreground font-medium">{typeConfig.label}</span>
          </div>
        )}

        {/* Platform icons with names */}
        {post.platforms && post.platforms.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-6">
            {post.platforms.map((platform) => {
              const platformKey = normalizeSocialPlatform(platform);
              if (!platformKey) return null;
              const config = platformConfig[platformKey];
              const PlatformIcon = config.icon;
              return (
                <div
                  key={platform}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
                    config.bgColor, config.color
                  )}
                >
                  <PlatformIcon className="h-3 w-3" />
                  {config.label}
                </div>
              );
            })}
          </div>
        )}

        {/* Text content - collapsible */}
        {post.text && (
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <div className="pl-6">
              <p className={cn("text-sm text-muted-foreground", !expanded && "line-clamp-2")}>
                {post.text}
              </p>
              {hasLongText && (
                <CollapsibleTrigger asChild>
                  <button className="text-xs text-primary hover:text-primary/80 font-medium mt-1 flex items-center gap-0.5 transition-colors">
                    {expanded ? (
                      <>Show less <ChevronUp className="h-3 w-3" /></>
                    ) : (
                      <>Show more <ChevronDown className="h-3 w-3" /></>
                    )}
                  </button>
                </CollapsibleTrigger>
              )}
            </div>
            <CollapsibleContent />
          </Collapsible>
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pl-6">
            {post.tags.map((tag, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-[10px] font-medium"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Scheduled date */}
        {post.scheduled_at && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-6">
            <Calendar className="h-3.5 w-3.5" />
            <span>{format(new Date(post.scheduled_at), "MMM d, yyyy")}</span>
            <Clock className="h-3.5 w-3.5 ml-1" />
            <span>{format(new Date(post.scheduled_at), "h:mm a")}</span>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50 pl-6">
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(post.created_at), "MMM d, yyyy")}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 hover:bg-primary/10 hover:text-primary transition-colors"
              onClick={() => navigate(`/posts/${post.id}/edit`)}
              aria-label={`Edit post ${post.title || ""}`.trim()}
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive transition-colors"
                  aria-label={`Delete post ${post.title || ""}`.trim()}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete post?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. The selected post (and associated media) will be permanently deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(post.id)}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
