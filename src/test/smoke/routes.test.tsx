import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import type { Post } from "@/types/post";
import type { CalendarEventDetail } from "@/types/calendar";
import Dashboard from "@/pages/Dashboard";
import Posts from "@/pages/Posts";
import Calendar from "@/pages/Calendar";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import { SOCIAL_STATUS_DRAFT, SOCIAL_STATUS_PUBLISHED } from "@/types/social";

import type { ReactNode } from "react";

let authState: {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  workspaceId?: string | null;
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const fetchPostsForUserMock = vi.hoisted(() => vi.fn());
const bulkDeletePostsMock = vi.hoisted(() => vi.fn());
const bulkUpdatePostsMock = vi.hoisted(() => vi.fn());
const deletePostForUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/posts", () => ({
  fetchPostsForUser: fetchPostsForUserMock,
  deletePostForUser: deletePostForUserMock,
  bulkDeletePosts: bulkDeletePostsMock,
  bulkUpdatePosts: bulkUpdatePostsMock,
}));

const fetchScheduledEventsMock = vi.hoisted(() => vi.fn());
const deleteCalendarEventForUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/calendar", () => ({
  fetchScheduledCalendarEventsForUserInRange: fetchScheduledEventsMock,
  deleteCalendarEventForUser: deleteCalendarEventForUserMock,
}));

vi.mock("@/integrations/supabase/client", () => {
  const fromMock = vi.fn((table: string) => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      single: vi.fn(() => chain),
      then: vi.fn((resolve) => {
        if (table === "posts") {
          return resolve({
            data: [
              { id: "p1", title: "Test Post 1", status: SOCIAL_STATUS_DRAFT, platforms: ["linkedin"], updated_at: new Date().toISOString() },
              { id: "p2", title: "Test Post 2", status: SOCIAL_STATUS_PUBLISHED, platforms: ["facebook"], updated_at: new Date().toISOString() }
            ],
            error: null,
          });
        }
        if (table === "stories") {
          return resolve({
            data: [
              { id: "s1", title: "Test Story 1", status: SOCIAL_STATUS_PUBLISHED, platforms: ["instagram"], updated_at: new Date().toISOString() }
            ],
            error: null,
          });
        }
        if (table === "profiles") {
          return resolve({
            data: { name: "Rajan Microweb" },
            error: null,
          });
        }
        return resolve({ data: [], error: null });
      }),
    };
    return chain;
  });

  return {
    supabase: {
      from: fromMock,
    },
  };
});

describe("Smoke tests for protected routes", () => {
  beforeEach(() => {
    authState = {
      user: { id: "u1" } as unknown as User,
      loading: false,
      isAdmin: false,
      workspaceId: "u1",
    };

    const posts: Post[] = [];
    fetchPostsForUserMock.mockResolvedValue(posts);

    const now = new Date();
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
        title: "Smoke Post",
        description: null,
        text: null,
        scheduled_at: todayAt10,
        status: SOCIAL_STATUS_PUBLISHED,
        platforms: ["linkedin"],
        type_of_post: "text",
        image: null,
        video: null,
        pdf: null,
        account_type: null,
        tags: null,
      },
    ];

    fetchScheduledEventsMock.mockResolvedValue(events);
  });

  it("renders Dashboard when authenticated", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/auth" element={<div>Auth Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Total Posts")).toBeInTheDocument();
  });

  it("renders Posts when authenticated", async () => {
    render(
      <MemoryRouter initialEntries={["/posts"]}>
        <Routes>
          <Route
            path="/posts"
            element={
              <ProtectedRoute>
                <Posts />
              </ProtectedRoute>
            }
          />
          <Route path="/auth" element={<div>Auth Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Posts")).toBeInTheDocument();
    const createButtons = await screen.findAllByText("Create Post");
    expect(createButtons.length).toBeGreaterThan(0);
  });

  it("renders Calendar when authenticated", async () => {
    render(
      <MemoryRouter initialEntries={["/calendar"]}>
        <Routes>
          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <Calendar />
              </ProtectedRoute>
            }
          />
          <Route path="/auth" element={<div>Auth Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Calendar")).toBeInTheDocument();
    expect(await screen.findByText("Smoke Post")).toBeInTheDocument();
    expect(screen.getAllByText(/posts/i).length).toBeGreaterThan(0);
  });

  it("redirects to /auth when unauthenticated", async () => {
    authState.user = null;

    render(
      <MemoryRouter initialEntries={["/posts"]}>
        <Routes>
          <Route
            path="/posts"
            element={
              <ProtectedRoute>
                <Posts />
              </ProtectedRoute>
            }
          />
          <Route path="/auth" element={<div>Auth Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Auth Page")).toBeInTheDocument();
    expect(screen.queryByText("Posts")).not.toBeInTheDocument();
  });
});

