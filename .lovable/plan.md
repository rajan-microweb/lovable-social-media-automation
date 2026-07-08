
# Multi-Tenant SaaS Transformation Plan

Greenfield migration (no existing users to preserve). Two-level hierarchy: **Organizations → Workspaces**. Billing schema now; provider wired later. All 15 deliverables covered across phased implementation.

---

## 1. Current Architecture Analysis

**Frontend:** React 18 + Vite + shadcn/tailwind. Routes in `src/App.tsx`, protected via `ProtectedRoute` + `AuthContext`. Pages under `src/pages/`, data access in `src/lib/api/`.

**Backend:** Lovable Cloud (Supabase). ~50 edge functions under `supabase/functions/` (proxies, publish worker, bulk ops, media, integrations). Client uses generated types from `src/integrations/supabase/`.

**Auth:** Supabase email/password + password reset. `handle_new_user` trigger seeds `profiles` + assigns `CLIENT` role in `user_roles`. `AuthContext` sets `workspaceId = user.id`, ensures a "Personal Workspace" via `ensurePersonalWorkspace`. Admin check reads `workspace_members` for role=ADMIN scoped to `workspace_id = user.id`.

**Authz:** Two systems in play — global `user_roles` (`app_role` enum, `has_role()` SECURITY DEFINER) and workspace-scoped `workspace_members`. Inconsistent usage.

**Schema (existing tenant-bearing tables):** `posts`, `stories`, `content_approvals`, `content_change_requests`, `content_templates`, `media_assets`, `platform_integrations`, `publish_jobs`, `analytics_platform_activity_snapshots`, `profiles`, `user_roles`, `workspaces`, `workspace_members`. Most carry `workspace_id`; `platform_integrations` is per-user by design.

**Storage:** Single public bucket `post-media`, paths `{userId}/...`.

**Jobs/AI:** `publish-queued-jobs` worker + n8n webhooks; OpenAI/LinkedIn/Twitter/Meta/YouTube proxies with encrypted `platform_integrations.credentials`. Usage tracked in `metadata`.

**Single-tenant assumptions (must change):**
- `workspaceId = user.id` in `AuthContext` (hardcoded personal workspace).
- `platform_integrations` scoped by user, not workspace.
- Storage paths keyed by `userId`, not org/workspace.
- Admin check uses global `user_roles` in some places, workspace membership in others.
- n8n webhook payloads carry `user_id`, not `workspace_id`/`org_id`.
- No org concept anywhere; workspaces are 1:1 with users.
- Media/AI/usage counters not aggregated per tenant.
- No invitations, plans, quotas, audit trail.

---

## 2. Target Multi-Tenant Architecture

```text
auth.users
   │
   ├─ profiles (1:1)
   │
organizations ── organization_members (users ↔ orgs, org_role)
   │              organization_invitations
   │              organization_settings, subscriptions, plans, usage_logs, audit_logs, api_keys, webhooks
   │
   └─ workspaces ── workspace_members (users ↔ ws, ws_role)
                    workspace_settings
                    │
                    └─ posts, stories, templates, media_assets,
                       platform_integrations, publish_jobs,
                       content_approvals, content_change_requests,
                       analytics_*, notifications, activity_logs
```

- **Org** = billing + team boundary; owns subscription, invoices, plan, members, API keys.
- **Workspace** = content boundary (brand/client/project); every content resource lives here.
- Every row carries **both** `organization_id` and `workspace_id` for efficient RLS + reporting.
- Active org/workspace held in JWT app_metadata + client context; switcher writes to both.

---

## 3. Database Redesign

**New tables** (all with `GRANT` + RLS + policies via `has_org_role`/`has_workspace_role` SECURITY DEFINER helpers):

- `organizations` (name, slug, logo_url, timezone, country, brand_colors jsonb, owner_id)
- `organization_members` (org_id, user_id, role: OWNER/ADMIN/MANAGER/EDITOR/VIEWER, status)
- `organization_invitations` (org_id, email, role, token, expires_at, invited_by, accepted_at)
- `organization_roles` + `role_permissions` (custom roles per org)
- `permissions` (canonical permission catalog: posts.create, posts.publish, billing.manage, ai.use, …)
- `plans` (code, name, limits jsonb: users, workspaces, storage_mb, posts_per_month, ai_credits, features jsonb)
- `subscriptions` (org_id, plan_id, status, current_period_end, provider, provider_ref)
- `usage_logs` (org_id, workspace_id, metric, quantity, occurred_at)
- `audit_logs` (org_id, workspace_id, user_id, action, resource_type, resource_id, ip, ua, meta jsonb)
- `notifications` (org_id, workspace_id, user_id, type, payload, read_at)
- `api_keys` (org_id, name, hashed_key, scopes, last_used_at, revoked_at)
- `webhooks` (org_id, url, secret, events[], active)
- `custom_fields` (org_id, resource_type, key, schema)
- `organization_settings`, `workspace_settings`

**Rework existing tables:**

- `workspaces`: add `organization_id`, `slug`, `logo_url`, `is_default`.
- `workspace_members`: keep, standardize roles enum.
- Add `organization_id` (denormalized) to: `posts`, `stories`, `content_approvals`, `content_change_requests`, `content_templates`, `media_assets`, `platform_integrations`, `publish_jobs`, `analytics_*`. Backfill via trigger on insert from `workspace_id`.
- `platform_integrations`: move from per-user to per-workspace (`workspace_id NOT NULL`, `created_by user_id`).
- `profiles`: drop admin-implication; profile is pure user metadata.
- Global `user_roles` + `has_role()`: **retire** for app logic; keep only for platform-level super-admin (Lovable operator). All app authz becomes org/workspace-scoped.

**Indexes:** `(workspace_id, created_at desc)`, `(organization_id, created_at desc)`, `(workspace_id, status, scheduled_at)`, `(organization_id, user_id)` on members, unique `(org_id, lower(email))` on invitations.

**Triggers:**
- `set_org_id_from_workspace()` before insert on tenant tables.
- `updated_at` triggers unified.
- `handle_new_user`: only creates `profiles`; no default org (user creates in onboarding) or, for invitations, adds to existing org.

**RLS pattern (universal):**
```sql
using (public.has_workspace_access(auth.uid(), workspace_id))
with check (public.has_workspace_permission(auth.uid(), workspace_id, 'posts.create'))
```
SECURITY DEFINER helpers avoid recursion. Each table gets granular policies per action tied to permission strings.

---

## 4. Authentication & Authorization

**Auth flows:**
- Sign up → onboarding wizard (create org) OR accept invite token → auto-join org.
- Email verification enforced before first billing action.
- Forgot password (already present) preserved.
- Session: rely on Supabase JWT; store `active_org_id` + `active_workspace_id` in `profiles` (or a `user_context` table) — updated by switcher.
- Optional SSO/SCIM/SAML on Enterprise plan (schema hooks only for now).

**RBAC:**
- Built-in org roles: OWNER, ADMIN, MANAGER, EDITOR, VIEWER.
- Workspace roles: ADMIN, EDITOR, VIEWER (org roles inherit downwards).
- Permission catalog stored in `permissions`; `role_permissions` links roles → permissions; custom roles per org supported.
- `has_org_role`, `has_workspace_role`, `has_org_permission`, `has_workspace_permission` SECURITY DEFINER functions used by RLS + edge functions.
- Every edge function calls a shared `requirePermission(req, permission, {workspaceId})` helper.

---

## 5. Tenant Isolation Strategy

- RLS on **every** tenant table using helper functions above.
- Edge functions never trust client-supplied `organization_id` / `workspace_id`; they derive from the caller's JWT + active context + membership check.
- Storage: reorganize to `orgs/{orgId}/workspaces/{workspaceId}/{resource}/{...}`. Storage RLS policies enforce prefix match via helper.
- Search/analytics queries always scoped to `workspace_id` (and joined on org for cross-workspace reports).
- Exports/imports zipped per workspace; ownership check on job creation and download.
- n8n webhooks: sanitize payloads to `{org_id, workspace_id, resource_id}`; no cross-tenant identifiers.
- Rate limits keyed by org.

---

## 6. Middleware / Edge Function Layer

New shared helper `supabase/functions/_shared/tenantContext.ts`:
- `getCaller(req)` — validate JWT, return user.
- `resolveContext(req, user)` — read `X-Org-Id` + `X-Workspace-Id` headers, verify membership, load plan + limits.
- `requirePermission(ctx, permission)`.
- `enforceQuota(ctx, metric, quantity)` — checks `plans.limits` vs `usage_logs`, throws 402 when exceeded.
- `writeAudit(ctx, action, resource)`.

All existing functions refactored to route through it.

Frontend equivalent: `TenantProvider` wraps auth, injects `orgId`/`workspaceId` headers on every `supabase.functions.invoke` and query builder call.

---

## 7. Frontend Changes

- New global **TenantProvider** replacing hardcoded `workspaceId = user.id`.
- **OrgSwitcher** + **WorkspaceSwitcher** in `Navbar` (combobox with search + "Create new").
- New pages:
  - `/onboarding` — 10-step wizard (org, logo, tz, country, colors, socials, invite, plan, review, finish).
  - `/settings/organization` — general, branding, danger zone.
  - `/settings/members` — list, invite, revoke, change role.
  - `/settings/invitations` — pending invites.
  - `/settings/roles` — built-in + custom roles editor.
  - `/settings/permissions` — grid mapping roles → permissions.
  - `/settings/billing` — plan card, upgrade, invoices.
  - `/settings/subscription` — plan comparison.
  - `/settings/usage` — quotas + progress bars.
  - `/settings/api-keys` — create/revoke with scopes.
  - `/settings/webhooks` — CRUD.
  - `/settings/audit-logs` — searchable table.
  - `/settings/notifications` — preferences.
  - `/settings/workspaces` — CRUD, per-workspace branding.
  - `/invitations/:token` — accept invite landing page.
- Existing pages (Dashboard, Posts, Stories, Calendar, Templates, Library, Accounts, Analytics, Approvals, History, Profile, AdminUsers) refactored to read from TenantProvider.
- Feature-gate hook `useFeature('ai.advanced')` reads plan features; hides/disables UI.
- Empty states + "requires plan" upsell components.

---

## 8. Onboarding Wizard

10 steps as specified. Persists between steps in `organizations` (draft state) + `organization_settings`. Step 7 launches existing platform connect dialogs against the new workspace. Step 8 sends `organization_invitations`. Step 9 sets `subscriptions.plan_id` (free by default). Redirects to Dashboard on finish.

---

## 9. Subscription & Feature Gating

- Seeded plans: Free, Starter, Professional, Business, Enterprise with `limits` and `features` jsonb.
- Feature keys: `ai`, `ai.advanced`, `automation`, `analytics.advanced`, `white_label`, `api`, `unlimited_templates`, `custom_domain`, `priority_support`.
- Gating enforced in both UI (`useFeature`) and edge functions (`requireFeature`).
- Quota enforcement via `enforceQuota` on: post creation, story creation, media upload bytes, AI credit consumption, workspace count, member count.
- No provider wired now; `subscriptions.provider` + `provider_ref` columns ready. Manual admin toggle via super-admin.

---

## 10. Storage Reorganization

- New bucket `tenant-media` (public read via signed patterns TBD; probably private with signed URLs). Migration: leave `post-media` alone (greenfield — empty). New uploads write to `orgs/{orgId}/workspaces/{workspaceId}/...`.
- Storage RLS uses `has_workspace_access(auth.uid(), (regexp_match(name, '^orgs/[^/]+/workspaces/([^/]+)/')[1])::uuid)`.
- `upload-ai-media` edge function updated to compute the new path.

---

## 11. Notifications, Audit Logs, Analytics

- `notifications` fed by triggers on `posts`, `publish_jobs`, `organization_invitations`, `subscriptions`, etc. Realtime channel per workspace.
- `audit_logs` written by every mutating edge function via `writeAudit`.
- Analytics page rewritten to aggregate per workspace (default) with an "All workspaces" org view for admins.

---

## 12. Security

- RLS on every table, no exceptions.
- All edge functions: JWT verification in code, permission checks, Zod input validation, rate limiting (per org + per IP), CORS locked.
- API keys hashed with argon2; scopes checked per request.
- Webhook signatures HMAC-SHA256.
- Storage private + signed URLs (public bucket removed for new resources).
- Audit log immutable (no update/delete policies).
- Secrets remain in Supabase secrets manager.
- CSRF: token bound to same-origin; XSS: keep React auto-escape + sanitize rich text.

---

## 13. Performance & Scalability

- Composite indexes as listed above; partial indexes on active jobs.
- Cursor pagination on posts/stories/media/audit lists.
- Materialized view for analytics per (workspace_id, day) refreshed hourly.
- Realtime subscriptions scoped by workspace filter.
- Edge function cold-start reduction via shared helper module.
- Roadmap hooks: read replicas, multi-region (RLS-compatible), sharding by org_id, background job queue (Cloud tasks/Inngest) if publish worker outgrows current design.
- Future: white-label custom domains, marketplace/plugins, public API + webhooks (already scaffolded), AI agents, SSO/SCIM.

---

## 14. Migration Plan (greenfield)

Since no existing users need preservation:
1. Ship schema + RLS as a single migration branch (staged in dev DB, tested).
2. Drop obsolete constructs: `ensurePersonalWorkspace`, global `has_role` app usage, `user_roles` for app logic.
3. Reseed plans/permissions catalog.
4. Regenerate types after each migration.
5. Backward compat: old edge functions removed only after new ones ship (feature-flag switchover).
6. Rollback: each phase in its own migration file; keep a "revert" migration in the same PR.
7. Validation: RLS test suite (see Testing).

**Testing plan:**
- Vitest RLS unit tests (per-role matrix per table).
- Playwright end-to-end covering: signup → onboarding → invite → accept → switch org → create post → publish → billing → audit visibility.
- Load test posts + media list at 10k rows/workspace.
- Cross-tenant leak fuzz: attempt every table read/write with mismatched context.

---

## 15. Risks & Mitigation

| Risk | Mitigation |
|---|---|
| RLS regressions leak data | Automated RLS test suite required to pass before merge |
| Edge function refactor breaks publishing | Feature-flag new tenant context; run old/new in parallel one phase |
| Storage path change orphans files | Greenfield; new paths only |
| Quota checks slow down hot paths | Cache plan+usage in memory per function invocation |
| n8n workflows still send `user_id` | Update webhook contract in same phase as edge function refactor |
| Custom roles complexity | Ship built-in roles first; custom roles as phase 6 |

---

## Implementation Phases (priority order)

**Phase A — Foundation (schema + auth core)**
- Migrations: organizations, org_members, invitations, plans, subscriptions, permissions, role_permissions, audit_logs, usage_logs, notifications, api_keys, webhooks.
- Add `organization_id` to existing tenant tables + backfill triggers.
- SECURITY DEFINER helpers + rewrite all RLS.
- Retire global `user_roles` from app logic.

**Phase B — Context plumbing**
- `_shared/tenantContext.ts` in edge functions.
- Frontend `TenantProvider`, org/workspace switchers, header injection.
- Refactor existing edge functions to new helper (bulk-*, delete-*, update-*, publish-queued-jobs, proxies).

**Phase C — Onboarding & Invitations**
- Onboarding wizard, invite flow, accept-invite page.
- Members/Invitations settings pages.

**Phase D — RBAC UI**
- Roles + Permissions pages, custom roles.
- Wire `useFeature` + `usePermission` throughout UI.

**Phase E — Billing scaffolding**
- Plans seed, Subscription/Billing/Usage pages, feature gating enforcement, quota enforcement in hot paths. No provider.

**Phase F — Isolation of integrations & storage**
- Move `platform_integrations` to workspace scope.
- New storage layout + `upload-ai-media` refactor.
- n8n webhook payload contract updated.

**Phase G — Observability**
- Audit logs page, notifications center, analytics rework per workspace, activity feed.

**Phase H — Platform surface**
- API keys, webhooks, custom fields.
- Public API endpoints (read-only first).

**Phase I — Scalability hooks**
- Materialized analytics view, cursor pagination everywhere, rate limits, prep for SSO/SCIM, custom domains.

Each phase ends with: green Vitest RLS suite + Playwright smoke + type regen + no runtime errors in preview.

---

## Estimated Impact on Existing Modules

| Module | Impact |
|---|---|
| Dashboard | Rewrite metric queries to workspace scope |
| Posts / Stories / Calendar | Add workspace filter, permission checks, quota on create |
| Templates / Library | Add workspace scope; org-level "shared" toggle later |
| Media | New storage paths + upload function |
| Accounts (integrations) | Rescope to workspace; migration for existing = N/A (greenfield) |
| AI proxies | Attribute usage to org; enforce ai credit quota |
| Analytics / History | Rewrite aggregation, add per-workspace filters |
| Approvals / Change Requests | Add workspace + org, permission-gated |
| Admin Users | Split: super-admin (platform) vs org admin (members page) |
| Auth | Add invitation acceptance, org context on session |
| Sidebar/Navbar | Add switchers, plan badge, usage meter |

No existing feature is removed; all become tenant-aware.
