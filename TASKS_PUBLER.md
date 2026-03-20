# Publer-like Transformation Tasks (Prompt-Ready)

This file is a backlog of changes to make this app behave like a typical Publer-style social media management tool.

## Before you start (scope alignment)

1. When you say “like Publer”, which parts are required for your MVP?
   - Calendar planning + scheduling
   - Approval workflow
   - Publishing queue
   - Analytics/insights
   - Team workspaces
   - Media library/content templates
   - Social inbox/replies (comments/DMs)
2. Do you want a single unified “Content” entity (posts + stories) like Publer, or keep them separate but with shared UI?
3. Which platforms are in MVP (LinkedIn/Facebook/Instagram/Twitter/YouTube)?

Use the prompts below as a guided plan.

---

## 1) Information Architecture & Navigation (Publer layout)

### [x] 1.1 - Add Publer-style top-level pages
**Prompt:**
"Add new routes/pages to match Publer navigation: `Calendar`, `Queue` (publishing queue), `Library` (media/assets), `Analytics`, `Approvals` (if enabled), and `Settings/Integrations`. Update `src/App.tsx` and any sidebar/navigation components so links work and are protected by auth."

### [x] 1.2 - Create a unified “Content” experience
**Prompt:**
"Refactor `src/pages/Posts.tsx` and `src/pages/Stories.tsx` into a shared “Content” page/component that can render both posts and stories with a consistent filter/sort/search UI and shared bulk actions. Preserve existing URLs if needed, but internally unify the logic."

---

## 2) Data Model Enhancements (make it Publer-grade)

### [x] 2.1 - Introduce workspace/team ownership
**Prompt:**
"Extend the data model to support workspaces and memberships (e.g. `workspaces`, `workspace_members`). Update auth/authorization checks so all queries (posts/stories/calendar/analytics) are scoped to the active workspace, not just `user_id`."

### [x] 2.2 - Add approval workflow tables (optional MVP)
**Prompt:**
"If approvals are required, create tables for approvals/audit (e.g. `content_approvals`, `content_change_requests`). Update content status transitions to include `pending_approval` and wire UI in Calendar/Content detail modals."

### [x] 2.3 - Add a publishing queue model
**Prompt:**
"Create a queue representation for scheduled publishing (e.g. `publish_jobs`) with states like `queued`, `publishing`, `published`, `failed`, `retrying`. Ensure the queue can be rendered as a `Queue` page."

---

## 3) Calendar UX (Publer calendar feels)

### [x] 3.1 - Drag-and-drop rescheduling
**Prompt:**
"Implement drag-and-drop in `src/pages/Calendar.tsx` so events can be moved between days/times. On drop, call an API/Edge Function that updates scheduled times and keeps UI consistent."

### [x] 3.2 - Multi-day/week/day consistent selection
**Prompt:**
"Ensure all calendar views (month/week/day) provide consistent click/keyboard selection and allow editing the same event detail modal. Verify with component tests for each view."

### [x] 3.3 - Recurring schedules (Publer-like)
**Prompt:**
"Add recurrence rules to scheduled content (weekly/monthly, etc.). Generate upcoming occurrences in the calendar and enqueue publishing jobs accordingly."

---

## 4) Publishing & Status Pipeline (queue + retries)

### [x] 4.1 - Centralize status transitions
**Prompt:**
"Define a single authoritative state machine for content status (draft -> scheduled -> queued -> publishing -> published/failed). Replace scattered status handling in UI (Calendar chips, Posts/Stories cards, Badges) with shared constants and a helper that maps status to UI styling."

### [x] 4.2 - Implement scheduled publishing worker
**Prompt:**
"Add a backend worker/cron-like mechanism to periodically scan for queued jobs and publish at the correct time. Reuse existing Edge Functions where possible (e.g. `update-post`, `update-story`, `bulk-update-posts`, `check-expiring-tokens`, platform token refresh)."

### [x] 4.3 - Retry with backoff
**Prompt:**
"When publishing fails, record error details and retry based on configurable backoff rules. Ensure UI surfaces retry counts/state in `Queue` and the Calendar event detail modal."

---

## 5) Analytics & Insights (Publer dashboard)

### [x] 5.1 - Create an Analytics page
**Prompt:**
"Add a new `Analytics` page that aggregates results per platform and time window (daily/weekly/monthly). Use existing platform-activity Edge Functions (e.g. `get-platform-activity`) as the data source."

### [x] 5.2 - Analytics snapshots + caching
**Prompt:**
"Store analytics snapshots (per content item and per platform) so the UI doesn’t depend on live fetching each time. Add cache invalidation/update scheduling."

### [x] 5.3 - Visualizations and filters
**Prompt:**
"Implement charts and filters (platform, date range, content type, status) and ensure they’re responsive. Use consistent chart components."

---

## 6) Media Library & Content Templates

### [x] 6.1 - Media Library page
**Prompt:**
"Create a `Library` page showing uploaded assets (images/videos/pdfs) with search, tags, and delete actions. Reuse existing media functions (e.g. `delete-media`, upload flows)."

### [x] 6.2 - Content templates
**Prompt:**
"Add templates (e.g. “LinkedIn text post with CTA”, “YouTube short caption style”) that prefill composer fields and media requirements. Store templates in Supabase and wire them into `CreatePost` / `CreateStory` flows."

---

## 7) Team Collaboration (Publer-like)

### [x] 7.1 - Invitations & membership UI
**Prompt:**
"Implement invite flow for workspace members and a UI under Settings/Users to manage roles. Update `src/pages/AdminUsers.tsx` to align with workspace membership instead of global user roles."

### [x] 7.2 - Activity feed
**Prompt:**
"Add an activity feed for content changes (created/edited/scheduled/published) visible in content detail pages and/or dashboard."

---

## 8) Codebase refactors (so it stays maintainable)

### [x] 8.1 - Normalize “content” vs “post/story”
**Prompt:**
"Introduce a unified domain model for calendar/rendering (e.g. `ContentItem` with a discriminant `kind: post|story`). Refactor `Calendar`, `EventDetailModal`, and content cards to depend on the unified model."

### [x] 8.2 - Expand the typed data access layer
**Prompt:**
"Create/extend functions under `src/lib/api/*` and `src/lib/content/*` so UI pages don’t implement ad-hoc Supabase queries. Add typed helpers for queue/approvals/analytics."

---

## 9) Testing & QA

### [x] 9.1 - E2E smoke for core flows
**Prompt:**
"Add end-to-end or component tests that verify the core Publer flows: create content -> schedule -> appears on calendar -> queue shows it -> published/failed changes status -> analytics updates."

### [x] 9.2 - Load testing / performance
**Prompt:**
"If analytics and calendar are heavy, add performance guards (query range filtering, virtualization where safe, memoization) and verify via tests/benchmarks."

---

## 10) Migration plan (incremental delivery)

### [x] 10.1 - MVP: Calendar scheduling + queue + retries
**Prompt:**
"Deliver MVP in this order: (1) queue model + worker, (2) status pipeline + UI surfacing, (3) Calendar/Queue pages wiring, (4) analytics stub that shows “not available yet”."

### [x] 10.2 - Phase 2: Approvals + team workspaces
**Prompt:**
"Add approvals and workspace membership after MVP without breaking existing single-user flows."

