import type { SocialPlatform, SocialStatus } from "./social";

export type ContentKind = "post" | "story";

// Unified domain model for calendar rendering and detail views.
// Both posts and stories are represented by the same shape via `kind`.
export interface ContentItem {
  id: string;
  title: string;
  description?: string | null;
  text?: string | null;
  scheduled_at: string | null;
  kind: ContentKind;
  status: SocialStatus;
  platforms?: SocialPlatform[] | null;
  type_of_post?: string | null;
  type_of_story?: string | null;
  image?: string | null;
  video?: string | null;
  pdf?: string | null;
  account_type?: string | null;
  tags?: string[] | null;
  // Used by content list cards. Not always populated in calendar queries.
  created_at?: string | null;
  updated_at?: string | null;
  // Derived publishing queue metadata (from `publish_jobs`).
  // These are optional so existing callers don't need to provide queue state.
  publish_job_state?: "queued" | "publishing" | "published" | "failed" | "retrying" | null;
  publish_retry_count?: number | null;
  publish_last_error?: string | null;
  publish_run_at?: string | null;
  // Recurrence metadata for scheduled content.
  // When enabled, the calendar renders derived upcoming occurrences from `scheduled_at`.
  recurrence_frequency?: "none" | "weekly" | "monthly" | null;
  recurrence_until?: string | null;
}

// Backwards-compatible alias (older code still refers to calendar events).
export type CalendarEventDetail = ContentItem;
