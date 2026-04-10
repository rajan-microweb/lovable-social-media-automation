import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DateRange } from "react-day-picker";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterBar } from "@/components/posts/FilterBar";
import { BulkActionToolbar } from "@/components/posts/BulkActionToolbar";
import { SortDropdown, type SortField, type SortOrder } from "@/components/posts/SortDropdown";
import type { Post } from "@/types/post";
import type { Story } from "@/types/story";
import {
  SOCIAL_STATUS_PENDING_APPROVAL,
  SOCIAL_STATUS_SCHEDULED,
  type SocialStatus,
  type SocialPlatform,
} from "@/types/social";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { applyPostFiltersAndSorting } from "@/lib/posts/applyPostFiltersAndSorting";
import { fetchPostsForUser, deletePostForUser, bulkDeletePosts, bulkUpdatePosts } from "@/lib/api/posts";
import {
  fetchStoriesForUser,
  deleteStoryForUser,
  bulkDeleteStories,
  bulkUpdateStories,
} from "@/lib/api/stories";
import { ContentCard } from "@/components/posts/ContentCard";
import { fetchPublishJobsForWorkspace, type PublishJobState } from "@/lib/api/queue";

type ContentMode = "all" | "posts" | "stories";

type ContentRow =
  | { kind: "post"; id: string; post: Post }
  | { kind: "story"; id: string; story: Story };

const APPROVALS_ENABLED = import.meta.env.VITE_ENABLE_APPROVALS === "true";

type ApplyStoryFiltersAndSortingParams = {
  searchTerm: string;
  statusFilter: string | null;
  platformFilter: string[];
  dateRange: DateRange | undefined;
  sortBy: SortField;
  sortOrder: SortOrder;
};

function applyStoryFiltersAndSorting(stories: Story[], params: ApplyStoryFiltersAndSortingParams): Story[] {
  const { searchTerm, statusFilter, platformFilter, dateRange, sortBy, sortOrder } = params;

  let result = [...stories];

  // Search filter
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    result = result.filter(
      (s) =>
        s.title?.toLowerCase().includes(term) ||
        s.text?.toLowerCase().includes(term) ||
        s.description?.toLowerCase().includes(term)
    );
  }

  // Status filter
  if (statusFilter) {
    result = result.filter((s) => s.status === statusFilter);
  }

  // Platform filter
  if (platformFilter.length > 0) {
    result = result.filter((s) =>
      s.platforms?.some((platform: SocialPlatform) => platformFilter.includes(platform))
    );
  }

  // Date range filter (inclusive through end-of-day)
  if (dateRange?.from) {
    const fromDate = new Date(
      dateRange.from.getFullYear(),
      dateRange.from.getMonth(),
      dateRange.from.getDate(),
      0,
      0,
      0,
      0
    );

    const toDate = dateRange.to
      ? new Date(
          dateRange.to.getFullYear(),
          dateRange.to.getMonth(),
          dateRange.to.getDate(),
          23,
          59,
          59,
          999
        )
      : null;

    result = result.filter((s) => {
      if (!s.created_at) return false;
      const storyDate = new Date(s.created_at);
      if (toDate) return storyDate >= fromDate && storyDate <= toDate;
      return storyDate >= fromDate;
    });
  }

  // Sorting
  result.sort((a, b) => {
    if (sortBy === "created_at" || sortBy === "scheduled_at") {
      const getSortValue = (story: Story): number | null => {
        const value =
          sortBy === "created_at" ? story.created_at : story.scheduled_at;
        if (!value) return null;
        const t = new Date(value).getTime();
        return Number.isNaN(t) ? null : t;
      };

      const aVal = getSortValue(a);
      const bVal = getSortValue(b);

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return sortOrder === "asc" ? 1 : -1;
      if (bVal === null) return sortOrder === "asc" ? -1 : 1;

      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    }

    // Text fields
    const aVal = (sortBy === "title" ? a.title : a.status).toString().toLowerCase();
    const bVal = (sortBy === "title" ? b.title : b.status).toString().toLowerCase();
    const comparison = aVal.localeCompare(bVal);
    return sortOrder === "asc" ? comparison : -comparison;
  });

  return result;
}

function makeContentKey(kind: "post" | "story", id: string) {
  return `${kind}:${id}`;
}

function parseContentKey(key: string): { kind: "post" | "story"; id: string } {
  const idx = key.indexOf(":");
  const kind = key.slice(0, idx) as "post" | "story";
  const id = key.slice(idx + 1);
  return { kind, id };
}

function compareRows(a: ContentRow, b: ContentRow, sortBy: SortField, sortOrder: SortOrder) {
  const dir = sortOrder === "asc" ? 1 : -1;

  if (sortBy === "created_at" || sortBy === "scheduled_at") {
    const getTs = (row: ContentRow): number | null => {
      const value =
        sortBy === "created_at"
          ? row.kind === "post"
            ? row.post.created_at
            : row.story.created_at
          : row.kind === "post"
            ? row.post.scheduled_at
            : row.story.scheduled_at;
      if (!value) return null;
      const t = new Date(value).getTime();
      return Number.isNaN(t) ? null : t;
    };

    const aVal = getTs(a);
    const bVal = getTs(b);

    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return dir === 1 ? 1 : -1;
    if (bVal === null) return dir === 1 ? -1 : 1;

    return dir * (aVal - bVal);
  }

  const aVal = (sortBy === "title"
    ? a.kind === "post"
      ? a.post.title
      : a.story.title
    : a.kind === "post"
      ? a.post.status
      : a.story.status
  )
    .toString()
    .toLowerCase();

  const bVal = (sortBy === "title"
    ? b.kind === "post"
      ? b.post.title
      : b.story.title
    : b.kind === "post"
      ? b.post.status
      : b.story.status
  )
    .toString()
    .toLowerCase();

  const comparison = aVal.localeCompare(bVal);
  return sortOrder === "asc" ? comparison : -comparison;
}

export function ContentView({
  initialMode,
  initialStatus,
  showModeTabs = true,
  showLayout = true,
}: {
  initialMode: ContentMode;
  initialStatus?: string | null;
  showModeTabs?: boolean;
  showLayout?: boolean;
}) {
  const { user, workspaceId } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<ContentMode>(initialMode);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [publishJobStateByKey, setPublishJobStateByKey] = useState<Record<string, PublishJobState | null>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Selection state (composite keys to avoid post/story id collisions)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(initialStatus ?? null);
  const [platformFilter, setPlatformFilter] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  // Sort state
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter(null);
    setPlatformFilter([]);
    setDateRange(undefined);
  };

  useEffect(() => {
    if (!user || !workspaceId) return;

    const shouldFetchPosts = showModeTabs ? true : initialMode !== "stories";
    const shouldFetchStories = showModeTabs ? true : initialMode !== "posts";

    const run = async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const results = await Promise.all([
          shouldFetchPosts ? fetchPostsForUser(workspaceId) : Promise.resolve([] as Post[]),
          shouldFetchStories ? fetchStoriesForUser(workspaceId) : Promise.resolve([] as Story[]),
          fetchPublishJobsForWorkspace(workspaceId),
        ]);

        setPosts(results[0]);
        setStories(results[1]);

        const jobs = results[2];
        const byKey: Record<string, PublishJobState | null> = {};
        for (const job of jobs) {
          // publish_jobs uses (content_type, content_id) as a unique identifier.
          byKey[`${job.content_type}:${job.content_id}`] = job.state === null ? null : (job.state as PublishJobState);
        }
        setPublishJobStateByKey(byKey);
      } catch {
        setFetchError("Failed to load content. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [user, workspaceId, initialMode, showModeTabs]);

  // Avoid confusing bulk-selection carryover when switching modes.
  useEffect(() => {
    setSelectedKeys(new Set());
  }, [mode]);

  const filteredPosts = useMemo(() => {
    return applyPostFiltersAndSorting(posts, {
      searchTerm,
      statusFilter,
      platformFilter,
      dateRange,
      sortBy,
      sortOrder,
    });
  }, [posts, searchTerm, statusFilter, platformFilter, dateRange, sortBy, sortOrder]);

  const filteredStories = useMemo(() => {
    return applyStoryFiltersAndSorting(stories, {
      searchTerm,
      statusFilter,
      platformFilter,
      dateRange,
      sortBy,
      sortOrder,
    });
  }, [stories, searchTerm, statusFilter, platformFilter, dateRange, sortBy, sortOrder]);

  const rows = useMemo(() => {
    const postRows: ContentRow[] = filteredPosts.map((post) => ({
      kind: "post",
      id: post.id,
      post,
    }));

    const storyRows: ContentRow[] = filteredStories.map((story) => ({
      kind: "story",
      id: story.id,
      story,
    }));

    const merged =
      mode === "posts" ? postRows : mode === "stories" ? storyRows : [...postRows, ...storyRows];

    // Ensure consistent sorting across kinds.
    return merged.slice().sort((a, b) => compareRows(a, b, sortBy, sortOrder));
  }, [mode, filteredPosts, filteredStories, sortBy, sortOrder]);

  const visibleKeySet = useMemo(() => {
    return new Set(rows.map((r) => makeContentKey(r.kind, r.id)));
  }, [rows]);

  const visibleSelectedKeys = useMemo(() => {
    return Array.from(selectedKeys).filter((key) => visibleKeySet.has(key));
  }, [selectedKeys, visibleKeySet]);

  const hiddenSelectedCount = selectedKeys.size - visibleSelectedKeys.length;

  const toggleSelection = (kind: "post" | "story", id: string) => {
    const key = makeContentKey(kind, id);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedKeys(new Set(rows.map((r) => makeContentKey(r.kind, r.id))));
  };

  const clearSelection = () => {
    setSelectedKeys(new Set());
  };

  const showToastSuccess = (title: string, description?: string) => {
    toast({ title, description });
  };

  const showToastError = (title: string, description?: string) => {
    toast({ title, description, variant: "destructive" });
  };

  const handleDeletePost = async (postId: string) => {
    if (!workspaceId) return;

    const targetKey = makeContentKey("post", postId);
    const previousPosts = posts;
    const previousStories = stories;
    const previousSelected = new Set(selectedKeys);

    setPosts((current) => current.filter((p) => p.id !== postId));
    setSelectedKeys((current) => {
      const next = new Set(current);
      next.delete(targetKey);
      return next;
    });

    try {
      await deletePostForUser(workspaceId, postId);
      showToastSuccess("Post deleted");
    } catch (error) {
      setPosts(previousPosts);
      setStories(previousStories);
      setSelectedKeys(previousSelected);
      showToastError("Failed to delete post");
      console.error(error);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    if (!workspaceId) return;

    const targetKey = makeContentKey("story", storyId);
    const previousPosts = posts;
    const previousStories = stories;
    const previousSelected = new Set(selectedKeys);

    setStories((current) => current.filter((s) => s.id !== storyId));
    setSelectedKeys((current) => {
      const next = new Set(current);
      next.delete(targetKey);
      return next;
    });

    try {
      await deleteStoryForUser(workspaceId, storyId);
      showToastSuccess("Story deleted");
    } catch (error) {
      setPosts(previousPosts);
      setStories(previousStories);
      setSelectedKeys(previousSelected);
      showToastError("Failed to delete story");
      console.error(error);
    }
  };

  const partitionTargets = (keys: string[]) => {
    const postIds: string[] = [];
    const storyIds: string[] = [];

    for (const key of keys) {
      const parsed = parseContentKey(key);
      if (parsed.kind === "post") postIds.push(parsed.id);
      else storyIds.push(parsed.id);
    }

    return { postIds, storyIds };
  };

  const handleBulkDelete = async () => {
    if (!workspaceId) return;
    const targetKeys = visibleSelectedKeys;
    if (targetKeys.length === 0) {
      showToastError("No visible selected items to delete");
      return;
    }

    if (hiddenSelectedCount > 0) {
      toast({
        title: "Some selections were skipped",
        description: `${hiddenSelectedCount} hidden selection(s) were skipped`,
      });
    }

    const { postIds: targetPostIds, storyIds: targetStoryIds } = partitionTargets(targetKeys);

    const previousPosts = posts;
    const previousStories = stories;
    const previousSelected = new Set(selectedKeys);

    setPosts((current) => current.filter((p) => !targetPostIds.includes(p.id)));
    setStories((current) => current.filter((s) => !targetStoryIds.includes(s.id)));
    setSelectedKeys((current) => {
      const next = new Set(current);
      targetKeys.forEach((k) => next.delete(k));
      return next;
    });

    setBulkLoading(true);
    try {
      await Promise.all([
        targetPostIds.length ? bulkDeletePosts(workspaceId, targetPostIds) : Promise.resolve(),
        targetStoryIds.length ? bulkDeleteStories(workspaceId, targetStoryIds) : Promise.resolve(),
      ]);
      showToastSuccess(`Deleted ${targetKeys.length} item(s)`);
    } catch (error) {
      setPosts(previousPosts);
      setStories(previousStories);
      setSelectedKeys(previousSelected);
      showToastError("Failed to delete items");
      console.error(error);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    if (!workspaceId) return;
    const targetKeys = visibleSelectedKeys;
    if (targetKeys.length === 0) {
      showToastError("No visible selected items to update");
      return;
    }

    if (hiddenSelectedCount > 0) {
      toast({
        title: "Some selections were skipped",
        description: `${hiddenSelectedCount} hidden selection(s) were skipped`,
      });
    }

    const { postIds: targetPostIds, storyIds: targetStoryIds } = partitionTargets(targetKeys);

    const previousPosts = posts;
    const previousStories = stories;
    const previousSelected = new Set(selectedKeys);

    setPosts((current) =>
      current.map((p) => (targetPostIds.includes(p.id) ? { ...p, status: status as SocialStatus } : p))
    );
    setStories((current) =>
      current.map((s) => (targetStoryIds.includes(s.id) ? { ...s, status: status as SocialStatus } : s))
    );
    setSelectedKeys((current) => {
      const next = new Set(current);
      targetKeys.forEach((k) => next.delete(k));
      return next;
    });

    setBulkLoading(true);
    try {
      await Promise.all([
        targetPostIds.length
          ? bulkUpdatePosts(workspaceId, targetPostIds, { status: status as SocialStatus })
          : Promise.resolve(),
        targetStoryIds.length
          ? bulkUpdateStories(workspaceId, targetStoryIds, { status: status as SocialStatus })
          : Promise.resolve(),
      ]);
      showToastSuccess(`Updated ${targetKeys.length} item(s)`);
    } catch (error) {
      setPosts(previousPosts);
      setStories(previousStories);
      setSelectedKeys(previousSelected);
      showToastError("Failed to update items");
      console.error(error);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkSchedule = async (date: Date) => {
    if (!workspaceId) return;
    const targetKeys = visibleSelectedKeys;
    if (targetKeys.length === 0) {
      showToastError("No visible selected items to schedule");
      return;
    }

    if (hiddenSelectedCount > 0) {
      toast({
        title: "Some selections were skipped",
        description: `${hiddenSelectedCount} hidden selection(s) were skipped`,
      });
    }

    const scheduledAt = date.toISOString();
    const { postIds: targetPostIds, storyIds: targetStoryIds } = partitionTargets(targetKeys);
    const nextStatus: SocialStatus = APPROVALS_ENABLED ? SOCIAL_STATUS_PENDING_APPROVAL : SOCIAL_STATUS_SCHEDULED;

    const previousPosts = posts;
    const previousStories = stories;
    const previousSelected = new Set(selectedKeys);

    setPosts((current) =>
      current.map((p) =>
        targetPostIds.includes(p.id)
          ? { ...p, status: nextStatus, scheduled_at: scheduledAt }
          : p
      )
    );
    setStories((current) =>
      current.map((s) =>
        targetStoryIds.includes(s.id)
          ? { ...s, status: nextStatus, scheduled_at: scheduledAt }
          : s
      )
    );
    setSelectedKeys((current) => {
      const next = new Set(current);
      targetKeys.forEach((k) => next.delete(k));
      return next;
    });

    setBulkLoading(true);
    try {
      await Promise.all([
        targetPostIds.length
          ? bulkUpdatePosts(workspaceId, targetPostIds, { status: nextStatus, scheduled_at: scheduledAt })
          : Promise.resolve(),
        targetStoryIds.length
          ? bulkUpdateStories(workspaceId, targetStoryIds, { status: nextStatus, scheduled_at: scheduledAt })
          : Promise.resolve(),
      ]);
      showToastSuccess(
        APPROVALS_ENABLED ? `Submitted ${targetKeys.length} item(s) for approval` : `Scheduled ${targetKeys.length} item(s)`
      );
    } catch (error) {
      setPosts(previousPosts);
      setStories(previousStories);
      setSelectedKeys(previousSelected);
      showToastError("Failed to schedule items");
      console.error(error);
    } finally {
      setBulkLoading(false);
    }
  };

  const renderEmpty = () => {
    if (mode === "posts") {
      return {
        title: "No posts yet. Create your first post!",
        primaryText: "Create Post",
        onPrimary: () => navigate("/posts/create"),
      };
    }

    if (mode === "stories") {
      return {
        title: "No stories yet. Create your first story!",
        primaryText: "Create Story",
        onPrimary: () => navigate("/stories/create"),
      };
    }

    return {
      title: "No content yet. Create your first post or story!",
      primaryText: "Create Post",
      secondaryText: "Create Story",
    };
  };

  const empty = renderEmpty();

  const header =
    initialStatus === "published"
      ? { title: "History", subtitle: "View your published posts and stories" }
      : mode === "posts"
        ? { title: "Posts", subtitle: "Manage your social media posts" }
        : mode === "stories"
          ? { title: "Stories", subtitle: "Manage your social media stories" }
          : { title: "Content", subtitle: "Manage posts and stories in one place" };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">{header.title}</h1>
            <p className="text-muted-foreground">{header.subtitle}</p>
          </div>

          <div className="flex items-center gap-2">
            {showModeTabs && (
              <Tabs
                value={mode}
                onValueChange={(v) => setMode(v as ContentMode)}
                className="w-full"
              >
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="posts">Posts</TabsTrigger>
                  <TabsTrigger value="stories">Stories</TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            <SortDropdown
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={(field, order) => {
                setSortBy(field);
                setSortOrder(order);
              }}
            />

            {mode === "posts" && (
              <Button onClick={() => navigate("/posts/create")}>
                Create Post
              </Button>
            )}
            {mode === "stories" && (
              <Button onClick={() => navigate("/stories/create")}>
                Create Story
              </Button>
            )}
            {mode === "all" && (
              <>
                <Button onClick={() => navigate("/posts/create")}>Create Post</Button>
                <Button variant="outline" onClick={() => navigate("/stories/create")}>
                  Create Story
                </Button>
              </>
            )}
          </div>
        </div>

        <FilterBar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          platformFilter={platformFilter}
          onPlatformChange={setPlatformFilter}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />

        {selectedKeys.size > 0 && (
          <BulkActionToolbar
            selectedCount={visibleSelectedKeys.length}
            totalCount={rows.length}
            onSelectAll={selectAllVisible}
            onClearSelection={clearSelection}
            onBulkDelete={handleBulkDelete}
            onBulkStatusChange={handleBulkStatusChange}
            onBulkSchedule={handleBulkSchedule}
            isLoading={bulkLoading}
          />
        )}

        {hiddenSelectedCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {hiddenSelectedCount} selected item(s) hidden by filters. Bulk actions apply only to visible selected items.
          </p>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center h-[420px] rounded-xl border border-border/50 bg-card">
            <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-muted border-t-primary" />
            <p className="text-muted-foreground mt-4 text-sm">Loading your content...</p>
          </div>
        ) : fetchError ? (
          <Card>
            <CardContent className="py-10 text-center space-y-4">
              <p className="text-muted-foreground">{fetchError}</p>
              <div className="flex items-center justify-center gap-2">
                <Button
                  onClick={() => {
                    if (!user) return;
                    setLoading(true);
                    setFetchError(null);
                    if (!workspaceId) return;
                    Promise.all([fetchPostsForUser(workspaceId), fetchStoriesForUser(workspaceId)])
                      .then(([p, s]) => {
                        setPosts(p);
                        setStories(s);
                      })
                      .catch(() => {
                        setFetchError("Failed to load content. Please try again.");
                      })
                      .finally(() => setLoading(false));
                  }}
                  disabled={bulkLoading}
                >
                  Retry
                </Button>
                <Button variant="outline" onClick={clearFilters} disabled={bulkLoading}>
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <p className="text-muted-foreground">{empty.title}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {"onPrimary" in empty ? (
                  <Button onClick={empty.onPrimary}>{empty.primaryText}</Button>
                ) : (
                  <>
                    <Button onClick={() => navigate("/posts/create")}>{empty.primaryText}</Button>
                    {"secondaryText" in empty && empty.secondaryText ? (
                      <Button variant="outline" onClick={() => navigate("/stories/create")}>
                        {empty.secondaryText}
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => {
              const content =
                row.kind === "post"
                  ? ({ ...row.post, kind: "post" } as const)
                  : ({ ...row.story, kind: "story" } as const);

              return (
                <ContentCard
                  key={row.id}
                  content={content as any}
                  isSelected={selectedKeys.has(makeContentKey(row.kind, row.id))}
                  onToggleSelect={() => toggleSelection(row.kind, row.id)}
                  onDelete={row.kind === "post" ? handleDeletePost : handleDeleteStory}
                  publishJobState={publishJobStateByKey[`${row.kind}:${row.id}`] ?? null}
                />
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function Content() {
  // Always show a unified feed of both posts + stories.
  return <ContentView initialMode="all" showModeTabs={false} />;
}

