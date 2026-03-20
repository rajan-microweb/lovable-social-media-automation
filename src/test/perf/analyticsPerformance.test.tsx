import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import Analytics from "@/pages/Analytics";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" } as any,
    loading: false,
    isAdmin: false,
    workspaceId: "w1",
  }),
}));

vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/posts/PlatformActivityFeed", () => ({
  PlatformActivityFeed: ({ items, loading }: { items: any[]; loading: boolean }) => (
    <div>{loading ? "loading" : `Activity:${items.length}`}</div>
  ),
}));

// Keep chart rendering cheap; engagement computation is still exercised by Analytics' `useMemo`.
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

const buildActivities = (count: number) => {
  const now = new Date();
  const base = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  const platforms = ["linkedin", "facebook", "instagram", "youtube", "twitter"] as const;

  return Array.from({ length: count }, (_, i) => {
    const dayOffset = i % 29; // keep within the default Analytics date window (~last 30 days)
    const publishedAt = new Date(base - dayOffset * dayMs - (i % 3600) * 1000).toISOString();
    const platform = platforms[i % platforms.length];
    return {
      id: `act-${i}`,
      platform,
      accountName: "Account",
      accountId: `acc-${i}`,
      content: `Item ${i}`,
      publishedAt,
      engagement: { likes: i % 10, comments: i % 3, shares: i % 5, views: i % 100 },
    };
  });
};

const activities = buildActivities(4000);

vi.mock("@/hooks/usePlatformActivity", () => ({
  usePlatformActivity: () => ({
    activities,
    loading: false,
    error: null,
    refresh: vi.fn(),
    cacheInfo: { cached: false },
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

describe("Analytics performance (smoke/benchmark)", () => {
  it("computes engagement data for thousands of snapshots quickly", async () => {
    const t0 = performance.now();

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>
    );

    expect(await screen.findByText(`Activity:${activities.length}`)).toBeInTheDocument();

    const elapsedMs = performance.now() - t0;
    // Generous threshold for CI/VM variance; this should still catch accidental O(n^2) regressions.
    expect(elapsedMs).toBeLessThan(5000);
  });
});

