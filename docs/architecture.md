# Architecture Notes

This project is a React + TypeScript app built with Vite and shadcn-ui. It uses Supabase for authentication and data storage, and a small typed “data access layer” for common queries.

## High-level structure

- `src/pages/`
  - Route entry points (`Dashboard`, `Posts`, `Calendar`, etc).
  - Views should keep UI logic, while Supabase query/mutation logic lives in `src/lib/api/`.
- `src/components/`
  - Reusable UI and domain components (post cards, filters, calendar event modal, sidebar, etc).
- `src/contexts/`
  - App state providers. The auth flow is implemented in `src/contexts/AuthContext.tsx`.
- `src/integrations/supabase/`
  - Supabase client and generated types.
  - Client entry is `src/integrations/supabase/client.ts`.
- `src/lib/api/`
  - Typed wrappers around Supabase reads/writes used by pages.
  - Examples:
    - `src/lib/api/posts.ts`
    - `src/lib/api/calendar.ts`
- `src/lib/posts/`
  - Pure helpers for filtering/sorting that are unit-testable.
  - Example: `src/lib/posts/applyPostFiltersAndSorting.ts`
- `src/types/`
  - Shared domain types (posts/stories/calendar events) used across pages/components.
- `src/constants/`
  - Shared constants (platform/status values).

## Routing + auth

Routes are defined in `src/App.tsx`. Protected pages are wrapped by `src/components/ProtectedRoute.tsx`, which uses `useAuth()` from `src/contexts/AuthContext.tsx`.

## Data flow (Supabase)

### Posts

- Page: `src/pages/Posts.tsx`
  - Fetches posts using `fetchPostsForUser()` from `src/lib/api/posts.ts`.
  - Filters/sorts locally (client-side) via `applyPostFiltersAndSorting()` from `src/lib/posts/applyPostFiltersAndSorting.ts`.
  - Bulk actions call Supabase Edge Functions:
    - `bulk-delete-posts`
    - `bulk-update-posts`
  - Single delete is confirmed in `src/components/posts/PostCard.tsx`.

### Calendar

- Page: `src/pages/Calendar.tsx`
  - Computes a visible range based on `view` (`month`, `week`, `day`).
  - Fetches scheduled items only inside that range via `fetchScheduledCalendarEventsForUserInRange()` from `src/lib/api/calendar.ts`.
  - Calendar loading is protected against stale async responses using a request id guard (`fetchRequestIdRef`).
  - Clicking an event opens `src/components/calendar/EventDetailModal.tsx`.

## Shared values: platforms + statuses

String values for platform names and statuses are centralized in:

- `src/types/social.ts` (source of truth for valid values)
- `src/constants/social.ts` (re-exports for convenience)

UI components use these instead of hard-coded strings where practical to reduce typo risk.

## Testing

Test runner:

- `vitest` configured in `vitest.config.ts`
- Setup file: `src/test/setup.ts`

Tests currently live in:

- `src/lib/posts/*.test.ts`
- `src/pages/*.test.tsx`
- `src/test/smoke/*.test.tsx`

## When adding features

1. Prefer adding/expanding a helper in `src/lib/` for any data transformation logic.
2. Prefer typed Supabase functions in `src/lib/api/` for reads/writes.
3. Keep UI event handlers in `src/pages/`/`src/components/`.
4. Reuse `src/types/` and `src/constants/` for shared domain values.

