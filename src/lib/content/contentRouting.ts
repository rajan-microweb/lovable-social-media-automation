import type { ContentKind } from "@/types/calendar";

export function getContentEditPath(kind: ContentKind, id: string): string {
  return kind === "post" ? `/posts/${id}/edit` : `/stories/${id}/edit`;
}

export function getContentLabel(kind: ContentKind): string {
  return kind === "post" ? "Post" : "Story";
}

