import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import Calendar from "@/pages/Calendar";
import Queue from "@/pages/Queue";
import Analytics from "@/pages/Analytics";

type PipelineStage = "queued" | "published" | "failed";

let stage: PipelineStage = "queued";

const userId = "u1";
const workspaceId = "w1";

const scheduledAt = new Date().toISOString();

const authState = {
  user: { id: userId } as any,
  loading: false,
  isAdmin: false,
  workspaceId,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function calendarEventForStage(nextStage: PipelineStage) {
  const status =
    nextStage === "queued" ? ("scheduled" as const) : (nextStage as any);

  const publish_job_state = nextStage;

  return {
    id: "post-1",
    title: "My Scheduled Post",
    description: null,
    text: null,
    scheduled_at: scheduledAt,
    kind: "post",
    status,
    platforms: ["linkedin"] as any,
    type_of_post: "onlyText",
    image: null,
    video: null,
    pdf: null,
    account_type: null,
    tags: null,
    recurrence_frequency: "none" as const,
    recurrence_until: null,
    publish_job_state,
    publish_retry_count: 0,
    publish_last_error: null,
    publish_run_at: scheduledAt,
  };
}

const fetchScheduledCalendarEventsForUserInRangeMock = vi.hoisted(() => vi.fn());

const deleteCalendarEventForUserMock = vi.hoisted(() => vi.fn());
const rescheduleCalendarEventForUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/calendar", () => ({
  fetchScheduledCalendarEventsForUserInRange: fetchScheduledCalendarEventsForUserInRangeMock,
  deleteCalendarEventForUser: deleteCalendarEventForUserMock,
  rescheduleCalendarEventForUser: rescheduleCalendarEventForUserMock,
}));

const fetchPublishJobsForWorkspaceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/queue", () => ({
  fetchPublishJobsForWorkspace: fetchPublishJobsForWorkspaceMock,
}));

vi.mock("@/components/posts/PlatformActivityFeed", () => ({
  PlatformActivityFeed: ({ items, loading }: { items: any[]; loading: boolean }) => (
    <div>
      <div>{loading ? "loading" : `Activity:${items.length}`}</div>
      {items.map((it) => (
        <div key={it.id}>{it.content}</div>
      ))}
    </div>
  ),
}));

vi.mock("@/hooks/usePlatformActivity", () => ({
  usePlatformActivity: () => {
    const activities =
      stage === "queued"
        ? [
            {
              id: "act-1",
              platform: "linkedin",
              accountName: "LinkedIn",
              accountId: "acc-1",
              content: "Analytics after queued",
              publishedAt: scheduledAt,
              engagement: { likes: 1, comments: 0, shares: 0, views: 10 },
            },
          ]
        : stage === "published"
          ? [
              {
                id: "act-2",
                platform: "linkedin",
                accountName: "LinkedIn",
                accountId: "acc-1",
                content: "Analytics after published",
                publishedAt: scheduledAt,
                engagement: { likes: 5, comments: 1, shares: 0, views: 50 },
              },
            ]
          : [
              {
                id: "act-3",
                platform: "linkedin",
                accountName: "LinkedIn",
                accountId: "acc-1",
                content: "Analytics after failed",
                publishedAt: scheduledAt,
                engagement: { likes: 0, comments: 0, shares: 0, views: 0 },
              },
            ];

    return {
      activities,
      loading: false,
      error: null,
      refresh: vi.fn(),
      cacheInfo: { cached: false, latestSnapshotFetchedAt: scheduledAt, returnedCount: activities.length },
    };
  },
}));

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children, id }: { children: ReactNode; id?: string }) => (
    <div data-testid={id || "chart"}>{children}</div>
  ),
  ChartLegendContent: () => null,
  ChartTooltipContent: () => null,
}));

vi.mock("recharts", () => ({
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
}));

vi.mock("@/integrations/supabase/client", () => {
  const postsForStage = () => {
    const status = stage === "queued" ? "scheduled" : stage;
    return [
      {
        id: "post-1",
        status,
        platforms: ["linkedin"],
        scheduled_at: scheduledAt,
        created_at: scheduledAt,
        updated_at: scheduledAt,
      },
    ];
  };

  const storiesForStage = () => {
    const status = stage === "queued" ? "scheduled" : stage;
    return [];
  };

  return {
    supabase: {
      from: (table: string) => ({
        select: () => ({
          eq: () => {
            if (table === "posts") {
              return Promise.resolve({ data: postsForStage(), error: null });
            }
            return Promise.resolve({ data: storiesForStage(), error: null });
          },
        }),
      }),
    },
  };
});

async function expectCalendarPipelineState(expectedLabel: string) {
  const dayButton = screen.getByRole("button", { name: /^day$/i });
  const user = userEvent.setup();
  await user.click(dayButton);
  expect(await screen.findByText(expectedLabel)).toBeInTheDocument();
}

describe("Publer core flow (smoke/component)", () => {
  beforeEach(() => {
    stage = "queued";
    cleanup();
    fetchScheduledCalendarEventsForUserInRangeMock.mockClear();
    fetchPublishJobsForWorkspaceMock.mockClear();

    fetchScheduledCalendarEventsForUserInRangeMock.mockImplementation(async () => {
      return [calendarEventForStage(stage)];
    });

    fetchPublishJobsForWorkspaceMock.mockImplementation(async () => {
      const state = stage;
      return [
        {
          id: "job-1",
          workspace_id: workspaceId,
          content_type: "post",
          content_id: "post-1",
          state,
          run_at: scheduledAt,
          retry_count: 0,
          last_error: state === "failed" ? "Simulated failure" : null,
          title: "My Scheduled Post",
        },
      ];
    });
  });

  it("shows scheduled item in Calendar/Queue, then reflects published->failed and analytics updates", async () => {
    // Stage: queued
    const calendarQueued = render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>
    );
    expect(await screen.findByText("My Scheduled Post")).toBeInTheDocument();
    await expectCalendarPipelineState("Queued");
    calendarQueued.unmount();

    const queueQueued = render(
      <MemoryRouter>
        <Queue />
      </MemoryRouter>
    );
    expect(await screen.findByText("Queued")).toBeInTheDocument();
    queueQueued.unmount();

    const analyticsQueued = render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>
    );
    expect(await screen.findByText("Analytics after queued")).toBeInTheDocument();
    analyticsQueued.unmount();

    // Stage: published
    stage = "published";

    const calendarPublished = render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>
    );
    expect(await screen.findByText("My Scheduled Post")).toBeInTheDocument();
    await expectCalendarPipelineState("Published");
    calendarPublished.unmount();

    const queuePublished = render(
      <MemoryRouter>
        <Queue />
      </MemoryRouter>
    );
    expect(await screen.findByText("Published")).toBeInTheDocument();
    queuePublished.unmount();

    const analyticsPublished = render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>
    );
    expect(await screen.findByText("Analytics after published")).toBeInTheDocument();
    analyticsPublished.unmount();

    // Stage: failed
    stage = "failed";

    const calendarFailed = render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>
    );
    expect(await screen.findByText("My Scheduled Post")).toBeInTheDocument();
    await expectCalendarPipelineState("Failed");
    calendarFailed.unmount();

    const queueFailed = render(
      <MemoryRouter>
        <Queue />
      </MemoryRouter>
    );
    expect(await screen.findByText("Failed")).toBeInTheDocument();
    queueFailed.unmount();

    const analyticsFailed = render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>
    );
    expect(await screen.findByText("Analytics after failed")).toBeInTheDocument();
    analyticsFailed.unmount();
  });
});

