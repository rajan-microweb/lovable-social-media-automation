import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { format } from "date-fns";
import { Edit, Trash2 } from "lucide-react";
import type { Story } from "@/types/story";
import type { PublishJobState } from "@/lib/publishing/statusPipeline";
import { getContentPipelineState, getContentPipelineStateUI } from "@/lib/publishing/statusPipeline";

interface StoryCardProps {
  story: Story;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDelete: (id: string) => void;
  publishJobState?: PublishJobState | null;
}

export function StoryCard({ story, isSelected, onToggleSelect, onDelete, publishJobState }: StoryCardProps) {
  const navigate = useNavigate();

  const pipelineState = getContentPipelineState({
    contentStatus: story.status,
    publishJobState: publishJobState ?? null,
  });
  const pipelineUI = getContentPipelineStateUI(pipelineState);

  return (
    <Card
      className={`relative transition-all ${
        isSelected ? "ring-2 ring-primary" : "hover:shadow-md"
      }`}
    >
      <CardHeader>
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            className="mt-1"
          />
          <div className="flex-1 flex items-start justify-between">
            <CardTitle className="text-lg">
              {story.type_of_story
                ? story.type_of_story.charAt(0).toUpperCase() + story.type_of_story.slice(1)
                : "Story"}
            </CardTitle>
            <Badge variant="outline" className={pipelineUI.badgeClassName}>
              {pipelineUI.label}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {story.type_of_story && (
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold">Type:</span> {story.type_of_story}
          </p>
        )}

        {story.platforms && story.platforms.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold">Platforms:</span> {story.platforms.join(", ")}
          </p>
        )}


        {(story.image || story.video) && (
          <div className="mt-2">
            {story.image && (
              <img
                src={story.image}
                alt="Story preview"
                className="w-full h-32 object-cover rounded"
              />
            )}
            {story.video && (
              <video
                src={story.video}
                className="w-full h-32 object-cover rounded"
              />
            )}
          </div>
        )}

        {story.scheduled_at && story.status !== "published" && (
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold">Scheduled:</span>{" "}
            {format(new Date(story.scheduled_at), "PPp")}
          </p>
        )}
        
        {story.status === "published" && story.published_at && (
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold">Published:</span>{" "}
            {format(new Date(story.published_at), "PPp")}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          {story.status === "published" && story.url && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-[10px] font-bold bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20 hover:text-green-700 transition-all gap-1.5"
              onClick={() => window.open(story.url!, "_blank")}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
              Live
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/stories/${story.id}/edit`)}
          >
            <Edit className="h-3 w-3" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete story?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. The story and its media will be permanently removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(story.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

