-- Publer-like Section 5: Analytics snapshots + caching
-- Stores per-content-item platform engagement snapshots so the UI can avoid
-- expensive live platform fetching on every request.

BEGIN;

-- -----------------------------
-- 1) Snapshot table
-- -----------------------------
CREATE TABLE IF NOT EXISTS public.analytics_platform_activity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  platform text NOT NULL,
  account_id text NOT NULL,
  platform_content_id text NOT NULL,

  account_name text,
  content text,
  media_url text,
  permalink text,

  published_at timestamptz NOT NULL,

  engagement_likes bigint,
  engagement_comments bigint,
  engagement_shares bigint,
  engagement_views bigint,

  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- One row per (workspace, source user, platform account, content id)
  UNIQUE (workspace_id, user_id, platform, account_id, platform_content_id)
);

ALTER TABLE public.analytics_platform_activity_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace users can view analytics snapshots" ON public.analytics_platform_activity_snapshots;
CREATE POLICY "Workspace users can view analytics snapshots"
  ON public.analytics_platform_activity_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = analytics_platform_activity_snapshots.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Helpful indexes for time-window queries
CREATE INDEX IF NOT EXISTS analytics_platform_activity_snapshots_workspace_published_idx
  ON public.analytics_platform_activity_snapshots (workspace_id, published_at DESC);

CREATE INDEX IF NOT EXISTS analytics_platform_activity_snapshots_workspace_fetched_idx
  ON public.analytics_platform_activity_snapshots (workspace_id, fetched_at DESC);

COMMIT;

