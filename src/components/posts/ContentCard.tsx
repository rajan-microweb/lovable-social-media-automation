import type { ContentItem } from "@/types/calendar";
import type { PublishJobState } from "@/lib/publishing/statusPipeline";
import type { Post } from "@/types/post";
import type { Story } from "@/types/story";

import { PostCard } from "./PostCard";
import { StoryCard } from "./StoryCard";

interface ContentCardProps {
  content: ContentItem;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDelete: (id: string) => void;
  publishJobState?: PublishJobState | null;
}

// Wrapper that renders the correct card UI based on the unified `content.kind`.
export function ContentCard({
  content,
  isSelected,
  onToggleSelect,
  onDelete,
  publishJobState,
}: ContentCardProps) {
  if (content.kind === "post") {
    return (
      <PostCard
        post={content as unknown as Post}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
        onDelete={onDelete}
        publishJobState={publishJobState ?? null}
      />
    );
  }

  return (
    <StoryCard
      story={content as unknown as Story}
      isSelected={isSelected}
      onToggleSelect={onToggleSelect}
      onDelete={onDelete}
      publishJobState={publishJobState ?? null}
    />
  );
}

