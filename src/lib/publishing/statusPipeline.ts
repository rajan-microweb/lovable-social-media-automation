import type { SocialStatus } from "@/types/social";

export type PublishJobState = "queued" | "publishing" | "published" | "failed" | "retrying";

// UI-level representation of the full publishing lifecycle.
// "queued/publishing/retrying" are derived from `publish_jobs.state` when the content is still `scheduled`.
export type ContentPipelineState =
  | SocialStatus
  | Extract<PublishJobState, "queued" | "publishing" | "retrying">;

// Authoritative state machine for UI/pipeline representation.
// The "queued/publishing/retrying" states are derived from `publish_jobs.state`.
export const CONTENT_PIPELINE_STATE_MACHINE: Record<ContentPipelineState, ContentPipelineState[]> = {
  draft: ["scheduled"],
  scheduled: ["queued"],
  pending_approval: ["queued"],
  queued: ["publishing"],
  publishing: ["published", "failed", "retrying"],
  retrying: ["publishing"],
  published: [],
  failed: [],
};

export function isValidContentPipelineTransition(from: ContentPipelineState, to: ContentPipelineState): boolean {
  return CONTENT_PIPELINE_STATE_MACHINE[from]?.includes(to) ?? false;
}

const pipelineStateLabel: Record<ContentPipelineState, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  pending_approval: "Pending Approval",
  published: "Published",
  failed: "Failed",
  queued: "Queued",
  publishing: "Publishing",
  retrying: "Retrying",
};

type BadgeStyle = {
  badgeClassName: string;
  dotClassName: string;
};

const pipelineStateStyle: Record<ContentPipelineState, BadgeStyle> = {
  draft: {
    badgeClassName: "bg-chart-4/15 text-chart-4 border-chart-4/30 capitalize",
    dotClassName: "bg-chart-4",
  },
  scheduled: {
    badgeClassName: "bg-primary/15 text-primary border-primary/30 capitalize",
    dotClassName: "bg-primary",
  },
  queued: {
    // "queued" maps to the same palette as "scheduled", but with a different label.
    badgeClassName: "bg-primary/15 text-primary border-primary/30 capitalize",
    dotClassName: "bg-primary",
  },
  publishing: {
    badgeClassName: "bg-chart-3/15 text-chart-3 border-chart-3/30 capitalize",
    dotClassName: "bg-chart-3",
  },
  retrying: {
    badgeClassName: "bg-amber-500/15 text-amber-600 border-amber-500/30 capitalize",
    dotClassName: "bg-amber-500",
  },
  pending_approval: {
    badgeClassName: "bg-chart-2/15 text-chart-2 border-chart-2/30 capitalize",
    dotClassName: "bg-chart-2",
  },
  published: {
    badgeClassName: "bg-chart-3/15 text-chart-3 border-chart-3/30 capitalize",
    dotClassName: "bg-chart-3",
  },
  failed: {
    badgeClassName: "bg-destructive/15 text-destructive border-destructive/30 capitalize",
    dotClassName: "bg-destructive",
  },
};

export function getContentPipelineState(params: {
  contentStatus: SocialStatus;
  publishJobState?: PublishJobState | null;
}): ContentPipelineState {
  const { contentStatus, publishJobState } = params;

  // Pending approval is a hard gate; ignore publish job state.
  if (contentStatus === "pending_approval") return "pending_approval";

  // Only derive queued/publishing/retrying while content is still scheduled.
  if (contentStatus === "scheduled" && publishJobState) {
    switch (publishJobState) {
      case "queued":
      case "publishing":
      case "retrying":
      case "published":
      case "failed": {
        // For "published/failed" we still prefer the job's final state, since the content
        // row may lag behind until the worker completes.
        return publishJobState as ContentPipelineState;
      }
      default:
        return "scheduled";
    }
  }

  // Otherwise fall back to the content status.
  return contentStatus as ContentPipelineState;
}

export function getContentPipelineStateLabel(state: ContentPipelineState): string {
  return pipelineStateLabel[state] ?? state;
}

export function getContentPipelineStateBadgeClassName(state: ContentPipelineState): string {
  return pipelineStateStyle[state]?.badgeClassName ?? "bg-muted text-muted-foreground";
}

export function getContentPipelineStateDotClassName(state: ContentPipelineState): string {
  return pipelineStateStyle[state]?.dotClassName ?? "bg-muted-foreground";
}

export function getContentPipelineStateUI(state: ContentPipelineState): BadgeStyle & { label: string } {
  const style = pipelineStateStyle[state] ?? pipelineStateStyle.scheduled;
  return { ...style, label: getContentPipelineStateLabel(state) };
}

