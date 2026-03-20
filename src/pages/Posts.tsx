import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { PostCard } from "@/components/posts/PostCard";
import { toast } from "@/hooks/use-toast";
import { DateRange } from "react-day-picker";
import { FilterBar } from "@/components/posts/FilterBar";
import { BulkActionToolbar } from "@/components/posts/BulkActionToolbar";
import { SortDropdown, SortField, SortOrder } from "@/components/posts/SortDropdown";
import type { Post } from "@/types/post";
import { SOCIAL_STATUS_SCHEDULED, type SocialStatus } from "@/types/social";
import { bulkDeletePosts, bulkUpdatePosts, deletePostForUser, fetchPostsForUser } from "@/lib/api/posts";
import { applyPostFiltersAndSorting } from "@/lib/posts/applyPostFiltersAndSorting";

export default function Posts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
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

  const showToastSuccess = (title: string, description?: string) => {
    toast({ title, description });
  };

  const showToastError = (title: string, description?: string) => {
    toast({ title, description, variant: "destructive" });
  };

  useEffect(() => {
    if (!user) return;
    fetchPosts();
  }, [user]);

  const fetchPosts = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await fetchPostsForUser(user!.id);
      setPosts(data);
    } catch {
      setFetchError("Failed to load posts. Please try again.");
    }
    finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePostForUser(user!.id, id);
      showToastSuccess("Post deleted");
      fetchPosts();
    } catch (error) {
      showToastError("Failed to delete post");
      console.error('Error deleting post:', error);
    }
  };

  // Filtered and sorted posts
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

  // Selection handlers
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredPosts.forEach((post) => next.add(post.id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const filteredPostIdSet = useMemo(
    () => new Set(filteredPosts.map((p) => p.id)),
    [filteredPosts]
  );

  const visibleSelectedIds = useMemo(
    () => Array.from(selectedIds).filter((id) => filteredPostIdSet.has(id)),
    [selectedIds, filteredPostIdSet]
  );

  const hiddenSelectedCount = selectedIds.size - visibleSelectedIds.length;

  // Bulk actions
  const handleBulkDelete = async () => {
    const targetIds = visibleSelectedIds;
    if (targetIds.length === 0) {
      showToastError("No visible selected posts to delete");
      return;
    }

    if (hiddenSelectedCount > 0) {
      toast({ title: "Some selections were skipped", description: `${hiddenSelectedCount} hidden selection(s) were skipped` });
    }

    const previousPosts = posts;
    const previousSelected = new Set(selectedIds);
    setPosts((current) => current.filter((post) => !targetIds.includes(post.id)));
    setSelectedIds((current) => {
      const next = new Set(current);
      targetIds.forEach((id) => next.delete(id));
      return next;
    });

    setBulkLoading(true);
    try {
      await bulkDeletePosts(targetIds);
      showToastSuccess(`Deleted ${targetIds.length} posts`);
    } catch (error) {
      setPosts(previousPosts);
      setSelectedIds(previousSelected);
      showToastError("Failed to delete posts");
      console.error(error);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    const targetIds = visibleSelectedIds;
    if (targetIds.length === 0) {
      showToastError("No visible selected posts to update");
      return;
    }

    if (hiddenSelectedCount > 0) {
      toast({ title: "Some selections were skipped", description: `${hiddenSelectedCount} hidden selection(s) were skipped` });
    }

    const previousPosts = posts;
    const previousSelected = new Set(selectedIds);
    setPosts((current) =>
      current.map((post) =>
        targetIds.includes(post.id) ? { ...post, status } : post
      )
    );
    setSelectedIds((current) => {
      const next = new Set(current);
      targetIds.forEach((id) => next.delete(id));
      return next;
    });

    setBulkLoading(true);
    try {
      await bulkUpdatePosts(targetIds, { status: status as SocialStatus });
      showToastSuccess(`Updated ${targetIds.length} posts to ${status}`);
    } catch (error) {
      setPosts(previousPosts);
      setSelectedIds(previousSelected);
      showToastError("Failed to update posts");
      console.error(error);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkSchedule = async (date: Date) => {
    const targetIds = visibleSelectedIds;
    if (targetIds.length === 0) {
      showToastError("No visible selected posts to schedule");
      return;
    }

    if (hiddenSelectedCount > 0) {
      toast({ title: "Some selections were skipped", description: `${hiddenSelectedCount} hidden selection(s) were skipped` });
    }

    const previousPosts = posts;
    const previousSelected = new Set(selectedIds);
    const scheduledAt = date.toISOString();
    setPosts((current) =>
      current.map((post) =>
        targetIds.includes(post.id)
          ? { ...post, status: SOCIAL_STATUS_SCHEDULED, scheduled_at: scheduledAt }
          : post
      )
    );
    setSelectedIds((current) => {
      const next = new Set(current);
      targetIds.forEach((id) => next.delete(id));
      return next;
    });

    setBulkLoading(true);
    try {
      await bulkUpdatePosts(targetIds, { status: SOCIAL_STATUS_SCHEDULED, scheduled_at: scheduledAt });
      showToastSuccess(`Scheduled ${targetIds.length} posts`);
    } catch (error) {
      setPosts(previousPosts);
      setSelectedIds(previousSelected);
      showToastError("Failed to schedule posts");
      console.error(error);
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Posts</h1>
            <p className="text-muted-foreground">Manage your social media posts</p>
          </div>
          <div className="flex items-center gap-2">
            <SortDropdown
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={(field, order) => {
                setSortBy(field);
                setSortOrder(order);
              }}
            />
            <Button onClick={() => navigate("/posts/create")}>
              <Plus className="mr-2 h-4 w-4" />
              Create Post
            </Button>
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

        {selectedIds.size > 0 && (
          <BulkActionToolbar
            selectedCount={visibleSelectedIds.length}
            totalCount={filteredPosts.length}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onBulkDelete={handleBulkDelete}
            onBulkStatusChange={handleBulkStatusChange}
            onBulkSchedule={handleBulkSchedule}
            isLoading={bulkLoading}
          />
        )}
        {hiddenSelectedCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {hiddenSelectedCount} selected post(s) hidden by filters. Bulk actions apply only to visible selected posts.
          </p>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center h-[420px] rounded-xl border border-border/50 bg-card">
            <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-muted border-t-primary" />
            <p className="text-muted-foreground mt-4 text-sm">Loading your posts...</p>
          </div>
        ) : fetchError ? (
          <Card>
            <CardContent className="py-10 text-center space-y-4">
              <p className="text-muted-foreground">{fetchError}</p>
              <div className="flex items-center justify-center gap-2">
                <Button onClick={fetchPosts} disabled={bulkLoading}>
                  Retry
                </Button>
                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : filteredPosts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <p className="text-muted-foreground">
                {posts.length === 0
                  ? "No posts yet. Create your first post!"
                  : "No posts match your filters."}
              </p>
              <div className="flex items-center justify-center gap-2">
                {posts.length === 0 ? (
                  <Button onClick={() => navigate("/posts/create")}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Post
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
                    <Button onClick={() => navigate("/posts/create")}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Post
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isSelected={selectedIds.has(post.id)}
                onToggleSelect={() => toggleSelection(post.id)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
