import { ContentView } from "./Content";

export default function Stories() {
  return <ContentView initialMode="stories" showModeTabs={false} />;
}

/*
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { DateRange } from "react-day-picker";
import { FilterBar } from "@/components/posts/FilterBar";
import { BulkActionToolbar } from "@/components/posts/BulkActionToolbar";
import { SortDropdown, SortField, SortOrder } from "@/components/posts/SortDropdown";

import { SOCIAL_STATUS_SCHEDULED, type SocialPlatform, type SocialStatus } from "@/types/social";
import {
  bulkDeleteStories,
  bulkUpdateStories,
  deleteStoryForUser,
  fetchStoriesForUser,
} from "@/lib/api/stories";
import { StoryCard } from "@/components/posts/StoryCard";

interface Story {
  id: string;
  title: string;
  description: string;
  status: SocialStatus;
  scheduled_at: string | null;
  type_of_story: string | null;
  platforms: SocialPlatform[] | null;
  account_type: string | null;
  text: string | null;
  image: string | null;
  video: string | null;
  updated_at?: string;
  created_at?: string;
}

export default function Stories() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkLoading, setBulkLoading] = useState(false);

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

  useEffect(() => {
    if (!user) return;
    fetchStories();
  }, [user]);

  const fetchStories = async () => {
    try {
      const data = await fetchStoriesForUser(user!.id);
      setStories(data);
    } catch {
      toast.error("Failed to load stories");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteStoryForUser(user!.id, id);
      toast.success("Story deleted");
      fetchStories();
    } catch (error) {
      toast.error("Failed to delete story");
      console.error('Error deleting story:', error);
    }
  };

  // Filtered and sorted stories
  const filteredStories = useMemo(() => {
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
        s.platforms?.some((platform) => platformFilter.includes(platform))
      );
    }

    // Date range filter
    if (dateRange?.from) {
      result = result.filter((s) => {
        if (!s.created_at) return false;
        const storyDate = new Date(s.created_at);
        if (dateRange.to) {
          return storyDate >= dateRange.from! && storyDate <= dateRange.to;
        }
        return storyDate >= dateRange.from!;
      });
    }

    // Sorting
    result.sort((a, b) => {
      let aVal: string | null = null;
      let bVal: string | null = null;

      switch (sortBy) {
        case "created_at":
          aVal = a.created_at ?? null;
          bVal = b.created_at ?? null;
          break;
        case "scheduled_at":
          aVal = a.scheduled_at;
          bVal = b.scheduled_at;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "title":
          aVal = a.title;
          bVal = b.title;
          break;
      }

      if (!aVal && !bVal) return 0;
      if (!aVal) return sortOrder === "asc" ? 1 : -1;
      if (!bVal) return sortOrder === "asc" ? -1 : 1;

      const comparison = aVal.localeCompare(bVal);
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [stories, searchTerm, statusFilter, platformFilter, dateRange, sortBy, sortOrder]);

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
    setSelectedIds(new Set(filteredStories.map((s) => s.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    setBulkLoading(true);
    try {
      await bulkDeleteStories(Array.from(selectedIds));
      toast.success(`Deleted ${selectedIds.size} stories`);
      clearSelection();
      fetchStories();
    } catch (error) {
      toast.error("Failed to delete stories");
      console.error(error);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    setBulkLoading(true);
    try {
      await bulkUpdateStories(Array.from(selectedIds), {
        status: status as SocialStatus,
      });
      toast.success(`Updated ${selectedIds.size} stories to ${status}`);
      clearSelection();
      fetchStories();
    } catch (error) {
      toast.error("Failed to update stories");
      console.error(error);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkSchedule = async (date: Date) => {
    setBulkLoading(true);
    try {
      await bulkUpdateStories(Array.from(selectedIds), {
        status: SOCIAL_STATUS_SCHEDULED,
        scheduled_at: date.toISOString(),
      });
      toast.success(`Scheduled ${selectedIds.size} stories`);
      clearSelection();
      fetchStories();
    } catch (error) {
      toast.error("Failed to schedule stories");
      console.error(error);
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Stories</h1>
            <p className="text-muted-foreground">Manage your social media stories</p>
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
            <Button onClick={() => navigate("/stories/create")}>
              <Plus className="mr-2 h-4 w-4" />
              Create Story
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
            selectedCount={selectedIds.size}
            totalCount={filteredStories.length}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onBulkDelete={handleBulkDelete}
            onBulkStatusChange={handleBulkStatusChange}
            onBulkSchedule={handleBulkSchedule}
            isLoading={bulkLoading}
          />
        )}

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : filteredStories.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {stories.length === 0
                  ? "No stories yet. Create your first story!"
                  : "No stories match your filters."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredStories.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                isSelected={selectedIds.has(story.id)}
                onToggleSelect={() => toggleSelection(story.id)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
*/
