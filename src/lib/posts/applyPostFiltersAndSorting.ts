import type { DateRange } from "react-day-picker";
import type { SortField, SortOrder } from "@/components/posts/SortDropdown";
import type { Post } from "@/types/post";

type ApplyPostFiltersAndSortingParams = {
  searchTerm: string;
  statusFilter: string | null;
  platformFilter: string[];
  dateRange: DateRange | undefined;
  sortBy: SortField;
  sortOrder: SortOrder;
};

export function applyPostFiltersAndSorting(
  posts: Post[],
  params: ApplyPostFiltersAndSortingParams
): Post[] {
  const {
    searchTerm,
    statusFilter,
    platformFilter,
    dateRange,
    sortBy,
    sortOrder,
  } = params;

  let result = [...posts];

  // Search filter
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    result = result.filter(
      (p) =>
        p.title?.toLowerCase().includes(term) ||
        p.text?.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term)
    );
  }

  // Status filter
  if (statusFilter) {
    result = result.filter((p) => p.status === statusFilter);
  }

  // Platform filter
  if (platformFilter.length > 0) {
    result = result.filter((p) =>
      p.platforms?.some((platform) => platformFilter.includes(platform))
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

    result = result.filter((p) => {
      const postDate = new Date(p.created_at);
      if (toDate) return postDate >= fromDate && postDate <= toDate;
      return postDate >= fromDate;
    });
  }

  // Sorting
  result.sort((a, b) => {
    if (sortBy === "created_at" || sortBy === "scheduled_at") {
      const getSortValue = (post: Post): number | null => {
        const value = sortBy === "created_at" ? post.created_at : post.scheduled_at;
        if (!value) return null;
        return new Date(value).getTime();
      };

      const aVal = getSortValue(a);
      const bVal = getSortValue(b);

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return sortOrder === "asc" ? 1 : -1;
      if (bVal === null) return sortOrder === "asc" ? -1 : 1;

      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    }

    // Text fields
    const aVal = (a[sortBy] || "").toString().toLowerCase();
    const bVal = (b[sortBy] || "").toString().toLowerCase();
    const comparison = aVal.localeCompare(bVal);
    return sortOrder === "asc" ? comparison : -comparison;
  });

  return result;
}

