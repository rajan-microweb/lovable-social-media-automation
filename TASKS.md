# Project Change Tasks (Prompt-Ready)

Use these prompts one-by-one to implement improvements in this project.  
Each prompt is written to be copied directly into an AI coding agent.

## 1) Calendar Data and Performance (Completed)

### [x] Task 1.1 - Query only visible date range
**Prompt:**  
"Update `src/pages/Calendar.tsx` so `fetchEvents()` only requests posts/stories inside the current visible range (`month`, `week`, `day`) instead of loading all scheduled rows. Use `visibleRange.start` and `visibleRange.end`, add proper Supabase range filters on `scheduled_at`, and keep existing UI behavior unchanged."

### [x] Task 1.2 - Add cancellation/race protection for async fetch
**Prompt:**  
"Refactor `src/pages/Calendar.tsx` data loading to prevent stale responses from overwriting state when users quickly change views/dates. Add request cancellation or response guards in `useEffect` and ensure `loading` state is accurate."

### [x] Task 1.3 - Avoid repeated `parseISO` work
**Prompt:**  
"Optimize `src/pages/Calendar.tsx` by precomputing parsed event dates once (e.g., normalized event model in memory) so `parseISO` is not repeatedly called in render loops for day/week/month views."

### [x] Task 1.4 - Make week start locale-aware
**Prompt:**  
"Update all `startOfWeek`/`endOfWeek` usage in `src/pages/Calendar.tsx` to use a consistent `weekStartsOn` strategy (configurable or locale-aware), and keep headers/grid alignment correct."

### [x] Task 1.5 - Add lightweight event virtualization/clipping in week/day views
**Prompt:**  
"Improve rendering performance in `src/pages/Calendar.tsx` for dense schedules by reducing DOM load in week/day views (e.g., clipping, memoized subcomponents, or efficient grouping). Preserve current visual design."

## 2) Posts Page Correctness and UX (Completed)

### [x] Task 2.1 - Fix date filtering boundaries
**Prompt:**  
"Fix date range filtering in `src/pages/Posts.tsx` so selected `to` dates are inclusive through end-of-day in local time. Prevent off-by-one issues when filtering by `created_at`."

### [x] Task 2.2 - Improve sort behavior for date fields
**Prompt:**  
"Refactor sorting in `src/pages/Posts.tsx` so `created_at` and `scheduled_at` are sorted as dates (not string locale compare), while keeping `title` and `status` text sorting intact."

### [x] Task 2.3 - Keep selection state valid after filtering
**Prompt:**  
"Update `src/pages/Posts.tsx` selection logic so hidden/filtered-out posts are handled safely for bulk actions. Add behavior to either preserve explicitly or auto-prune invalid selections with clear UX feedback."

### [x] Task 2.4 - Add empty-state actions
**Prompt:**  
"Improve empty states in `src/pages/Posts.tsx` by adding actionable CTAs (clear filters/create post) depending on whether there are zero posts or zero filtered results."

### [x] Task 2.5 - Add optimistic UI for bulk actions
**Prompt:**  
"Implement optimistic UI updates for bulk delete/status/schedule actions in `src/pages/Posts.tsx`, with rollback on failure and clean toast messaging."

## 3) Shared Types and Data Layer (Completed)

### [x] Task 3.1 - Centralize domain types
**Prompt:**  
"Create shared TypeScript domain types for posts/stories/calendar events under `src/types/` and replace duplicated inline interfaces in pages/components where possible."

### [x] Task 3.2 - Create typed data access helpers
**Prompt:**  
"Add a small data layer (`src/lib/api` or similar) for posts/stories Supabase queries to avoid query duplication across pages. Keep behavior the same, but move query logic out of view components."

### [x] Task 3.3 - Normalize platform/status values
**Prompt:**  
"Introduce constants/enums for platform names and statuses used in posts/stories/calendar. Replace ad-hoc string usage with shared constants to reduce typo risk."

## 4) Reliability and Error Handling (Completed)

### [x] Task 4.1 - Standardize toast/error handling
**Prompt:**  
"Unify error handling across pages that use both `sonner` and custom `toast` hooks. Pick a single pattern and refactor `Calendar` and `Posts` to consistent success/error messaging."

### [x] Task 4.2 - Add retry support for transient fetch failures
**Prompt:**  
"Add retry UX in `Calendar` and `Posts` load states (retry button + safe re-fetch), including clear messages when Supabase requests fail."

### [x] Task 4.3 - Protect destructive actions with confirmation
**Prompt:**  
"Ensure delete actions (single and bulk) are confirmed before execution and accessible via keyboard. Reuse existing UI dialog primitives."

## 5) Tooling and Build Configuration (Completed)

### [x] Task 5.1 - Environment-based dev port
**Prompt:**  
"Refactor `vite.config.ts` to read `PORT` from env with fallback to current default (`2003`), keeping host behavior intact and preserving development plugin setup."

### [x] Task 5.2 - Add bundle visibility script
**Prompt:**  
"Add a bundle analysis workflow for Vite (script + plugin integration) so we can inspect build output size. Keep existing `build` command working."

### [x] Task 5.3 - Tighten linting and format consistency
**Prompt:**  
"Review current ESLint setup and add missing rules that catch risky React hook/state patterns seen in this codebase, without introducing noisy rules."

## 6) Testing Coverage (Completed)

### [x] Task 6.1 - Add unit tests for Posts filtering/sorting
**Prompt:**  
"Set up test coverage for `Posts` filtering/sorting logic (search, status, platform, date range, sort field/order). Extract pure helpers where needed to make tests straightforward."

### [x] Task 6.2 - Add integration test for Calendar event loading
**Prompt:**  
"Add an integration-style test (or component test) for `Calendar` to validate that posts and stories are merged correctly, shown per day, and filtered by visible range."

### [x] Task 6.3 - Add smoke tests for key routes
**Prompt:**  
"Add a minimal smoke test suite covering auth-guarded routes (`Dashboard`, `Posts`, `Calendar`) and verify pages render critical controls."

## 7) Accessibility and Polish (Completed)

### [x] Task 7.1 - Keyboard and screen reader pass
**Prompt:**  
"Audit `Calendar` and `Posts` for accessibility: keyboard navigation, button labels, icon-only controls, and ARIA announcements for loading/error states. Implement fixes with minimal UI disruption."

### [x] Task 7.2 - Responsive overflow cleanup
**Prompt:**  
"Improve small-screen behavior in `Calendar` month/week/day layouts and `Posts` toolbar/filter area to avoid horizontal clipping and stacked control collisions."

### [x] Task 7.3 - Consistent loading/skeleton UI
**Prompt:**  
"Replace plain loading text with consistent skeleton/spinner patterns aligned with existing shadcn design across `Posts` and `Calendar`."

## 8) Documentation Tasks

### [x] Task 8.1 - Add developer architecture notes
**Prompt:**  
"Create `docs/architecture.md` explaining page structure, Supabase data flow, shared UI patterns, and where to add new features safely."

### [x] Task 8.2 - Add contributor setup and conventions
**Prompt:**  
"Expand `README.md` with local setup, environment variables, scripts, coding conventions, and a quick troubleshooting section for common Supabase/Vite issues."

