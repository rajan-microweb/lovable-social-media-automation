import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { startOfMonth, endOfMonth, subMonths } from "date-fns";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Calendar from "./Calendar";
import type { ReactNode } from "react";

import type { CalendarEventDetail } from "@/types/calendar";

const authState = {
  user: { id: "u1" } as { id: string },
  loading: false,
  isAdmin: false,
  workspaceId: "u1",
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

const fetchScheduledCalendarEventsForUserInRangeMock = vi.hoisted(() => vi.fn());
const deleteCalendarEventForUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/calendar", () => ({
  fetchScheduledCalendarEventsForUserInRange:
    fetchScheduledCalendarEventsForUserInRangeMock,
  deleteCalendarEventForUser: deleteCalendarEventForUserMock,
}));

vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("Calendar", () => {
  beforeEach(() => {
    fetchScheduledCalendarEventsForUserInRangeMock.mockReset();
  });

  it("fetches events for the visible month range and renders merged post+story chips", async () => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(monthStart);

    const fetchStart = subMonths(monthStart, 12);

    const startIso = new Date(
      fetchStart.getFullYear(),
      fetchStart.getMonth(),
      fetchStart.getDate(),
      0,
      0,
      0,
      0
    ).toISOString();

    const endIso = new Date(
      monthEnd.getFullYear(),
      monthEnd.getMonth(),
      monthEnd.getDate(),
      23,
      59,
      59,
      999
    ).toISOString();

    const todayAt10 = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      10,
      0,
      0,
      0
    ).toISOString();

    const events: CalendarEventDetail[] = [
      {
        id: "post-1",
        kind: "post",
        title: "Post Chip",
        description: null,
        text: null,
        scheduled_at: todayAt10,
        status: "published",
        platforms: ["linkedin"],
        type_of_post: "image",
        image: null,
        video: null,
        pdf: null,
        account_type: null,
        tags: null,
      },
      {
        id: "story-1",
        kind: "story",
        title: "Story Chip",
        description: null,
        text: null,
        scheduled_at: todayAt10,
        status: "scheduled",
        platforms: ["twitter"],
        type_of_story: "text",
        image: null,
        video: null,
        account_type: null,
        tags: null,
      },
    ];

    fetchScheduledCalendarEventsForUserInRangeMock.mockResolvedValueOnce(events);

    render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>
    );

    expect(fetchScheduledCalendarEventsForUserInRangeMock).toHaveBeenCalledWith(
      authState.workspaceId,
      startIso,
      endIso
    );

    expect(await screen.findByText("Post Chip")).toBeInTheDocument();
    expect(await screen.findByText("Story Chip")).toBeInTheDocument();

    // Header totals
    expect(screen.getByText(/1 posts/i)).toBeInTheDocument();
    expect(screen.getByText(/1 stories/i)).toBeInTheDocument();
  });
});

