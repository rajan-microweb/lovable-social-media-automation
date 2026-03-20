import { useMemo, useState, useEffect } from "react";
import { parseISO, isValid, subDays, startOfDay, startOfWeek, startOfMonth, endOfDay, format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PlatformActivityFeed } from "@/components/posts/PlatformActivityFeed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChartContainer, ChartLegendContent, ChartTooltipContent } from "@/components/ui/chart";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformActivity, type PlatformActivityItem } from "@/hooks/usePlatformActivity";
import { SOCIAL_PLATFORMS, type SocialPlatform, SOCIAL_STATUSES, type SocialStatus } from "@/types/social";
import { fetchPublishingVolumeRowsForWorkspace, type PublishingVolumeRow } from "@/lib/api/analytics";

type TimeGrouping = "daily" | "weekly" | "monthly";
type EngagementMetric = "total" | "likes" | "comments" | "shares" | "views";
type ContentType = "all" | "posts" | "stories";

const ALL_PLATFORMS: SocialPlatform[] = [...SOCIAL_PLATFORMS];

type PlatformSeriesRow = { period: string; __t: number } & Record<SocialPlatform, number>;
type ChartSeriesRow = { period: string } & Record<SocialPlatform, number>;

const PLATFORM_COLORS: Record<SocialPlatform, string> = {
  linkedin: "#0A66C2",
  facebook: "#1877F2",
  instagram: "#E4405F",
  youtube: "#FF0000",
  twitter: "#1DA1F2",
};

function platformLabel(platform: SocialPlatform) {
  return platform[0].toUpperCase() + platform.slice(1);
}

function engagementValue(item: PlatformActivityItem, metric: EngagementMetric): number {
  const e = item.engagement ?? {};
  const likes = e.likes ?? 0;
  const comments = e.comments ?? 0;
  const shares = e.shares ?? 0;
  const views = e.views ?? 0;

  switch (metric) {
    case "likes":
      return likes;
    case "comments":
      return comments;
    case "shares":
      return shares;
    case "views":
      return views;
    case "total":
    default:
      return likes + comments + shares + views;
  }
}

function contentTime(
  row: { scheduled_at: string | null; created_at: string | null; updated_at: string | null },
): Date {
  const scheduled = row.scheduled_at ? new Date(row.scheduled_at) : null;
  if (scheduled && !Number.isNaN(scheduled.getTime())) return scheduled;
  const created = row.created_at ? new Date(row.created_at) : null;
  if (created && !Number.isNaN(created.getTime())) return created;
  return new Date(row.updated_at ?? Date.now());
}

function groupStart(date: Date, grouping: TimeGrouping): Date {
  if (grouping === "daily") return startOfDay(date);
  if (grouping === "weekly") return startOfWeek(date, { weekStartsOn: 1 });
  return startOfMonth(date);
}

function groupLabel(date: Date, grouping: TimeGrouping): string {
  switch (grouping) {
    case "daily":
      return format(date, "MMM d");
    case "weekly":
      return `${format(date, "MMM d")}`;
    case "monthly":
      return format(date, "MMM yyyy");
  }
}

export default function Analytics() {
  const { user, workspaceId } = useAuth();

  const [timeGrouping, setTimeGrouping] = useState<TimeGrouping>("daily");
  const [metric, setMetric] = useState<EngagementMetric>("total");

  const [contentType, setContentType] = useState<ContentType>("all");
  const [status, setStatus] = useState<SocialStatus | "all">("all");

  const [platforms, setPlatforms] = useState<SocialPlatform[]>([...SOCIAL_PLATFORMS]);

  const today = useMemo(() => new Date(), []);
  const [dateFromStr, setDateFromStr] = useState<string>(() => format(subDays(today, 29), "yyyy-MM-dd"));
  const [dateToStr, setDateToStr] = useState<string>(() => format(today, "yyyy-MM-dd"));

  const dateFrom = useMemo(() => {
    const parsed = parseISO(dateFromStr);
    return isValid(parsed) ? parsed : subDays(new Date(), 29);
  }, [dateFromStr]);

  const dateTo = useMemo(() => {
    const parsed = parseISO(dateToStr);
    return isValid(parsed) ? parsed : new Date();
  }, [dateToStr]);

  const dateFromStart = useMemo(() => startOfDay(dateFrom), [dateFrom]);
  const dateToEnd = useMemo(() => endOfDay(dateTo), [dateTo]);

  const platformsForBackend = platforms.length ? platforms : undefined;

  const { activities, loading: loadingActivity, cacheInfo, refresh } = usePlatformActivity({
    userId: user?.id,
    workspaceId: workspaceId ?? undefined,
    dateFrom: dateFromStart.toISOString(),
    dateTo: dateToEnd.toISOString(),
    platforms: platformsForBackend,
    maxAgeSeconds: 60 * 10, // 10m snapshot cache
  });

  // Publishing volume chart (uses scheduled_at/created_at from our content DB)
  const [volumeLoading, setVolumeLoading] = useState(false);
  const [volumeError, setVolumeError] = useState<string | null>(null);
  const [volumeData, setVolumeData] = useState<ChartSeriesRow[]>([]);

  const selectedPlatformsForCharts = platforms.length ? platforms : [...SOCIAL_PLATFORMS];

  const chartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {};
    for (const p of selectedPlatformsForCharts) {
      cfg[p] = { label: platformLabel(p), color: PLATFORM_COLORS[p] };
    }
    return cfg;
  }, [selectedPlatformsForCharts]);

  const engagementData = useMemo(() => {
    if (!activities.length) return [];

    const map = new Map<number, PlatformSeriesRow>();

    for (const item of activities) {
      const published = new Date(item.publishedAt);
      if (Number.isNaN(published.getTime())) continue;
      if (published < dateFromStart || published > dateToEnd) continue;

      const start = groupStart(published, timeGrouping);
      const key = start.getTime();

      const label = groupLabel(start, timeGrouping);
      if (!map.has(key)) {
        const row = { period: label, __t: key } as PlatformSeriesRow;
        for (const p of ALL_PLATFORMS) row[p] = 0;
        map.set(key, row);
      }

      const platformKey = item.platform as SocialPlatform;
      if (!selectedPlatformsForCharts.includes(platformKey)) continue;
      const value = engagementValue(item, metric);
      map.get(key)![platformKey] += value;
    }

    return Array.from(map.values())
      .sort((a, b) => (a.__t as number) - (b.__t as number))
      .map(({ __t: _ignored, ...rest }) => rest as ChartSeriesRow);
  }, [activities, dateFromStart, dateToEnd, metric, selectedPlatformsForCharts, timeGrouping]);

  useEffect(() => {
    let cancelled = false;
    async function loadVolume() {
      if (!user || !workspaceId) return;

      setVolumeLoading(true);
      setVolumeError(null);

      try {
        const allRows = await fetchPublishingVolumeRowsForWorkspace(workspaceId);
        const rows: PublishingVolumeRow[] =
          contentType === "all"
            ? allRows
            : allRows.filter((r) => (contentType === "posts" ? r.kind === "post" : r.kind === "story"));

        // Performance guard: parse/compute row time once per row (previously `contentTime()`
        // was called in both `filter()` and the grouping loop).
        const rowsWithTime = rows.map((row) => {
          const time = contentTime(row);
          const rowPlatforms: SocialPlatform[] = (row.platforms || []) as SocialPlatform[];
          return { row, time, rowPlatforms };
        });

        const filtered = rowsWithTime.filter(({ time, row, rowPlatforms }) => {
          if (time < dateFromStart || time > dateToEnd) return false;
          if (status !== "all" && row.status !== status) return false;

          if (!selectedPlatformsForCharts.length) return true;
          if (platforms.length) {
            return rowPlatforms.some((p) => platforms.includes(p));
          }
          return true;
        });

        const map = new Map<number, PlatformSeriesRow>();
        for (const { row, time, rowPlatforms } of filtered) {
          const start = groupStart(time, timeGrouping);
          const key = start.getTime();
          const label = groupLabel(start, timeGrouping);
          if (!map.has(key)) {
            const out = { period: label, __t: key } as PlatformSeriesRow;
            for (const p of ALL_PLATFORMS) out[p] = 0;
            map.set(key, out);
          }

          const matchingPlatforms = platforms.length ? rowPlatforms.filter((p) => platforms.includes(p)) : rowPlatforms;
          for (const p of matchingPlatforms) {
            if (!selectedPlatformsForCharts.includes(p)) continue;
            map.get(key)![p] += 1;
          }
        }

        const nextData = Array.from(map.values())
          .sort((a, b) => (a.__t as number) - (b.__t as number))
          .map(({ __t: _ignored, ...rest }) => rest as ChartSeriesRow);

        if (!cancelled) setVolumeData(nextData);
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setVolumeError("Failed to load publishing volume");
      } finally {
        if (!cancelled) setVolumeLoading(false);
      }
    }

    loadVolume();
    return () => {
      cancelled = true;
    };
  }, [
    contentType,
    dateFromStart,
    dateToEnd,
    platforms,
    selectedPlatformsForCharts,
    status,
    timeGrouping,
    user,
    workspaceId,
  ]);

  const refreshWithForce = async () => {
    if (!user) return;
    await refresh({ force: true });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground mt-1">Platform engagement and publishing volume.</p>
          </div>

          <div className="flex items-center gap-2">
            {cacheInfo?.cached ? (
              <Badge variant="secondary">Using cached snapshots</Badge>
            ) : (
              <Badge variant="secondary">Fresh platform fetch</Badge>
            )}
            {cacheInfo?.latestSnapshotFetchedAt && (
              <Badge variant="outline">{new Date(cacheInfo.latestSnapshotFetchedAt).toLocaleTimeString()}</Badge>
            )}
            <Button variant="outline" onClick={refreshWithForce} disabled={loadingActivity}>
              Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-3 space-y-2">
                <p className="text-sm font-medium">Platforms</p>
                <div className="flex flex-wrap gap-3">
                  {SOCIAL_PLATFORMS.map((p) => (
                    <label key={p} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={platforms.includes(p)}
                        onCheckedChange={(checked) => {
                          setPlatforms((prev) => {
                            const next = checked === true
                              ? Array.from(new Set([...prev, p]))
                              : checked === false
                                ? prev.filter((x) => x !== p)
                                : prev;
                            return next;
                          });
                        }}
                      />
                      <span className="text-muted-foreground">{platformLabel(p)}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  If you uncheck all platforms, charts default to all.
                </p>
              </div>

              <div className="lg:col-span-2 space-y-2">
                <p className="text-sm font-medium">Grouping</p>
                <Select value={timeGrouping} onValueChange={(v) => setTimeGrouping(v as TimeGrouping)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Daily" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="lg:col-span-2 space-y-2">
                <p className="text-sm font-medium">Metric</p>
                <Select value={metric} onValueChange={(v) => setMetric(v as EngagementMetric)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Total" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total">Total engagement</SelectItem>
                    <SelectItem value="likes">Likes</SelectItem>
                    <SelectItem value="comments">Comments</SelectItem>
                    <SelectItem value="shares">Shares</SelectItem>
                    <SelectItem value="views">Views</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="lg:col-span-2 space-y-2">
                <p className="text-sm font-medium">Content Type</p>
                <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="posts">Posts</SelectItem>
                    <SelectItem value="stories">Stories</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="lg:col-span-3 space-y-2">
                <p className="text-sm font-medium">Status</p>
                <Select value={status} onValueChange={(v) => setStatus(v as SocialStatus | "all")}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {SOCIAL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="lg:col-span-6 space-y-2">
                <p className="text-sm font-medium">Date range</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">From</span>
                    <Input type="date" value={dateFromStr} onChange={(e) => setDateFromStr(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">To</span>
                    <Input type="date" value={dateToStr} onChange={(e) => setDateToStr(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-6 flex items-end justify-end">
                <p className="text-xs text-muted-foreground">
                  Engagement uses cached platform snapshots; volume uses your scheduled content tables.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Engagement by Platform</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {metric === "total" ? "Total likes/comments/shares/views" : metric} over {timeGrouping} periods.
              </p>
            </CardHeader>
            <CardContent>
              {loadingActivity ? (
                <p className="text-sm text-muted-foreground">Loading snapshots…</p>
              ) : engagementData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No engagement data for this range.</p>
              ) : (
                <ChartContainer id="analytics-engagement" config={chartConfig}>
                  <BarChart data={engagementData} margin={{ top: 10, left: 0, right: 10, bottom: 10 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="period" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltipContent />
                    <ChartLegendContent />
                    {selectedPlatformsForCharts.map((p) => (
                      <Bar
                        key={p}
                        dataKey={p}
                        stackId="engagement"
                        fill={`var(--color-${p})`}
                        isAnimationActive={false}
                      />
                    ))}
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Publishing Volume</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Counts of posts/stories by platform and status.</p>
            </CardHeader>
            <CardContent>
              {volumeLoading ? (
                <p className="text-sm text-muted-foreground">Loading publishing volume…</p>
              ) : volumeError ? (
                <p className="text-sm text-destructive">{volumeError}</p>
              ) : volumeData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No publishing data for this range.</p>
              ) : (
                <ChartContainer id="analytics-volume" config={chartConfig}>
                  <BarChart data={volumeData} margin={{ top: 10, left: 0, right: 10, bottom: 10 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="period" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltipContent />
                    <ChartLegendContent />
                    {selectedPlatformsForCharts.map((p) => (
                      <Bar
                        key={p}
                        dataKey={p}
                        stackId="volume"
                        fill={`var(--color-${p})`}
                        isAnimationActive={false}
                      />
                    ))}
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Platform Activity</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Showing the latest items fetched within your selected range.
            </p>
          </CardHeader>
          <CardContent>
            <PlatformActivityFeed
              items={activities}
              loading={loadingActivity}
              onRefresh={() => refresh({ force: true })}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

