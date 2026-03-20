import { describe, it, expect } from "vitest";
import { applyPostFiltersAndSorting } from "./applyPostFiltersAndSorting";
import { SOCIAL_STATUS_DRAFT, SOCIAL_STATUS_PUBLISHED } from "@/types/social";

import type { DateRange } from "react-day-picker";

import type { SortField, SortOrder } from "@/components/posts/SortDropdown";
import type { Post } from "@/types/post";

const makePost = (
  overrides: Partial<
    Pick<
      Post,
      | "id"
      | "title"
      | "description"
      | "text"
      | "status"
      | "scheduled_at"
      | "platforms"
      | "created_at"
      | "type_of_post"
    >
  > = {}
): Post => {
  return {
    id: "p-1",
    title: "Hello World",
    description: "Some description",
    text: "Post body",
    status: SOCIAL_STATUS_DRAFT,
    scheduled_at: null,
    platforms: null,
    account_type: null,
    type_of_post: null,
    image: null,
    video: null,
    pdf: null,
    url: null,
    tags: null,
    created_at: new Date(2026, 0, 1, 10, 0, 0).toISOString(),
    ...overrides,
  };
};

const mkRange = (from: Date, to?: Date): DateRange => ({ from, to });

describe("applyPostFiltersAndSorting", () => {
  it("filters by searchTerm across title/text/description", () => {
    const posts = [
      makePost({ id: "a", title: "Alpha", text: "beta", description: null }),
      makePost({ id: "b", title: "Gamma", text: null, description: "Contains delta" }),
    ];

    const out = applyPostFiltersAndSorting(posts, {
      searchTerm: "delta",
      statusFilter: null,
      platformFilter: [],
      dateRange: undefined,
      sortBy: "created_at" as SortField,
      sortOrder: "desc" as SortOrder,
    });

    expect(out.map((p) => p.id)).toEqual(["b"]);
  });

  it("filters by status", () => {
    const posts = [
      makePost({ id: "a", status: SOCIAL_STATUS_PUBLISHED }),
      makePost({ id: "b", status: SOCIAL_STATUS_DRAFT }),
    ];

    const out = applyPostFiltersAndSorting(posts, {
      searchTerm: "",
      statusFilter: SOCIAL_STATUS_PUBLISHED,
      platformFilter: [],
      dateRange: undefined,
      sortBy: "created_at" as SortField,
      sortOrder: "desc" as SortOrder,
    });

    expect(out.map((p) => p.id)).toEqual(["a"]);
  });

  it("filters by platform", () => {
    const posts = [
      makePost({ id: "a", platforms: ["linkedin"] }),
      makePost({ id: "b", platforms: ["twitter"] }),
    ];

    const out = applyPostFiltersAndSorting(posts, {
      searchTerm: "",
      statusFilter: null,
      platformFilter: ["linkedin"],
      dateRange: undefined,
      sortBy: "created_at" as SortField,
      sortOrder: "desc" as SortOrder,
    });

    expect(out.map((p) => p.id)).toEqual(["a"]);
  });

  it("filters by date range inclusively through end-of-day", () => {
    const from = new Date(2026, 2, 1, 0, 0, 0, 0); // Mar 1 local 00:00
    const to = new Date(2026, 2, 2, 23, 59, 59, 999); // Mar 2 local end

    const posts = [
      makePost({ id: "a", created_at: new Date(from.getTime()).toISOString() }),
      makePost({ id: "b", created_at: new Date(to.getTime()).toISOString() }),
      makePost({ id: "c", created_at: new Date(to.getTime() + 1).toISOString() }),
    ];

    const out = applyPostFiltersAndSorting(posts, {
      searchTerm: "",
      statusFilter: null,
      platformFilter: [],
      dateRange: mkRange(from, to),
      sortBy: "created_at" as SortField,
      sortOrder: "desc" as SortOrder,
    });

    expect(out.map((p) => p.id)).toEqual(["b", "a"]); // desc by created_at
  });

  it("sorts created_at and handles scheduled_at nulls", () => {
    const baseA = new Date(2026, 0, 2, 10, 0, 0).toISOString();
    const baseB = new Date(2026, 0, 1, 10, 0, 0).toISOString();
    const posts = [
      makePost({ id: "a", created_at: baseA, scheduled_at: null }),
      makePost({ id: "b", created_at: baseB, scheduled_at: new Date(2026, 0, 3, 10, 0, 0).toISOString() }),
    ];

    const out = applyPostFiltersAndSorting(posts, {
      searchTerm: "",
      statusFilter: null,
      platformFilter: [],
      dateRange: undefined,
      sortBy: "scheduled_at" as SortField,
      sortOrder: "asc" as SortOrder,
    });

    // scheduled_at null should come last in asc
    expect(out.map((p) => p.id)).toEqual(["b", "a"]);
  });
});

