-- Publer-like Section 2: workspaces, approvals, publishing queue
-- Implements:
--  - workspaces/workspace_members + workspace-scoped RLS
--  - posts/stories.workspace_id + status support (pending_approval, failed)
--  - content_approvals + publish_jobs models
--  - triggers to keep publish_jobs/content_approvals in sync with posts/stories status

BEGIN;

-- -----------------------------
-- 1) Workspaces + membership
-- -----------------------------

CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- workspace role reuses app_role to avoid adding a new enum
-- "ADMIN" is treated as OWNER for now.
CREATE TABLE IF NOT EXISTS public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'ADMIN',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Personal workspace access (for now, active workspace = personal workspace = auth.uid())
DROP POLICY IF EXISTS "Users can manage personal workspace" ON public.workspaces;
CREATE POLICY "Users can manage personal workspace"
  ON public.workspaces
  FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can manage personal workspace membership" ON public.workspace_members;
CREATE POLICY "Users can manage personal workspace membership"
  ON public.workspace_members
  FOR ALL
  USING (workspace_id = auth.uid() AND user_id = auth.uid())
  WITH CHECK (workspace_id = auth.uid() AND user_id = auth.uid());

-- -----------------------------
-- 2) Add workspace_id to content
-- -----------------------------

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS workspace_id uuid;

-- Create personal workspaces for existing users with content, using workspace_id = user_id
INSERT INTO public.workspaces (id, name)
SELECT DISTINCT u.user_id, 'Personal Workspace'
FROM (
  SELECT user_id FROM public.posts
  UNION
  SELECT user_id FROM public.stories
) u
ON CONFLICT (id) DO NOTHING;

-- Create membership for those personal workspaces
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT DISTINCT u.user_id, u.user_id, 'ADMIN'::public.app_role
FROM (
  SELECT user_id FROM public.posts
  UNION
  SELECT user_id FROM public.stories
) u
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Backfill content rows (workspace_id = user_id)
UPDATE public.posts
SET workspace_id = user_id
WHERE workspace_id IS NULL;

UPDATE public.stories
SET workspace_id = user_id
WHERE workspace_id IS NULL;

ALTER TABLE public.posts
  ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.stories
  ALTER COLUMN workspace_id SET NOT NULL;

-- Add FK constraints
ALTER TABLE public.posts
  ADD CONSTRAINT posts_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.stories
  ADD CONSTRAINT stories_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- -----------------------------
-- 3) Update posts/stories RLS
-- -----------------------------

-- Drop existing user_id-based RLS policies (defense in depth)
DROP POLICY IF EXISTS "Users can view own posts" ON public.posts;
DROP POLICY IF EXISTS "Admins can view all posts" ON public.posts;
DROP POLICY IF EXISTS "Users can create own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can update own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON public.posts;

DROP POLICY IF EXISTS "Users can view own stories" ON public.stories;
DROP POLICY IF EXISTS "Users can create own stories" ON public.stories;
DROP POLICY IF EXISTS "Users can update own stories" ON public.stories;
DROP POLICY IF EXISTS "Users can delete own stories" ON public.stories;
DROP POLICY IF EXISTS "Admins can view all stories" ON public.stories;

-- Workspace-scoped policies
CREATE POLICY "Workspace users can view posts"
  ON public.posts
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = posts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace users can create posts"
  ON public.posts
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = posts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace users can update posts"
  ON public.posts
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = posts.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = posts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace users can delete posts"
  ON public.posts
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = posts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace users can view stories"
  ON public.stories
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = stories.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace users can create stories"
  ON public.stories
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = stories.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace users can update stories"
  ON public.stories
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = stories.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = stories.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace users can delete stories"
  ON public.stories
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = stories.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- -----------------------------
-- 4) Status model alignment
-- -----------------------------

-- Extend posts.status allowed values to include failures + pending approvals.
-- Initial schema used a limited CHECK constraint on posts.status.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.posts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND pg_get_constraintdef(oid) ILIKE '%draft%'
  LOOP
    EXECUTE format('ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_status_check
  CHECK (status IN ('draft', 'scheduled', 'published', 'failed', 'pending_approval'));

-- Add stories.status check for consistency (stories initially had no explicit CHECK).
ALTER TABLE public.stories
  ADD CONSTRAINT stories_status_check
  CHECK (status IN ('draft', 'scheduled', 'published', 'failed', 'pending_approval'));

-- Helpful indexes
CREATE INDEX IF NOT EXISTS posts_workspace_id_idx ON public.posts(workspace_id);
CREATE INDEX IF NOT EXISTS stories_workspace_id_idx ON public.stories(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx ON public.workspace_members(user_id);

-- -----------------------------
-- 5) Approvals + audit tables
-- -----------------------------

CREATE TABLE IF NOT EXISTS public.content_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('post', 'story')),
  content_id uuid NOT NULL,
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_type, content_id)
);

ALTER TABLE public.content_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace users can view approvals" ON public.content_approvals;
CREATE POLICY "Workspace users can view approvals"
  ON public.content_approvals
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = content_approvals.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace users can upsert approvals" ON public.content_approvals;
CREATE POLICY "Workspace users can upsert approvals"
  ON public.content_approvals
  FOR INSERT
  WITH CHECK (
    auth.uid() = requested_by
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = content_approvals.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace users can update approvals" ON public.content_approvals;
CREATE POLICY "Workspace users can update approvals"
  ON public.content_approvals
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = content_approvals.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace users can delete approvals" ON public.content_approvals;
CREATE POLICY "Workspace users can delete approvals"
  ON public.content_approvals
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = content_approvals.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Audit table placeholder for future request tracking
CREATE TABLE IF NOT EXISTS public.content_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('post', 'story')),
  content_id uuid NOT NULL,
  request_status text NOT NULL DEFAULT 'pending' CHECK (request_status IN ('pending', 'approved', 'rejected')),
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_type, content_id)
);

ALTER TABLE public.content_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace users can view change requests" ON public.content_change_requests;
CREATE POLICY "Workspace users can view change requests"
  ON public.content_change_requests
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = content_change_requests.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace users can upsert change requests" ON public.content_change_requests;
CREATE POLICY "Workspace users can upsert change requests"
  ON public.content_change_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() = requested_by
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = content_change_requests.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace users can update change requests" ON public.content_change_requests;
CREATE POLICY "Workspace users can update change requests"
  ON public.content_change_requests
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = content_change_requests.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace users can delete change requests" ON public.content_change_requests;
CREATE POLICY "Workspace users can delete change requests"
  ON public.content_change_requests
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = content_change_requests.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Keep updated_at fresh on approvals tables
DROP TRIGGER IF EXISTS update_content_approvals_updated_at ON public.content_approvals;
CREATE TRIGGER update_content_approvals_updated_at
  BEFORE UPDATE ON public.content_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_content_change_requests_updated_at ON public.content_change_requests;
CREATE TRIGGER update_content_change_requests_updated_at
  BEFORE UPDATE ON public.content_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -----------------------------
-- 6) Publishing queue table
-- -----------------------------

CREATE TABLE IF NOT EXISTS public.publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('post', 'story')),
  content_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'publishing', 'published', 'failed', 'retrying')),
  run_at timestamptz NOT NULL,
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- one active job per content item; rescheduling updates it
  UNIQUE (content_type, content_id)
);

ALTER TABLE public.publish_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace users can view publish_jobs" ON public.publish_jobs;
CREATE POLICY "Workspace users can view publish_jobs"
  ON public.publish_jobs
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = publish_jobs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace users can insert publish_jobs" ON public.publish_jobs;
CREATE POLICY "Workspace users can insert publish_jobs"
  ON public.publish_jobs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = publish_jobs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace users can update publish_jobs" ON public.publish_jobs;
CREATE POLICY "Workspace users can update publish_jobs"
  ON public.publish_jobs
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = publish_jobs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace users can delete publish_jobs" ON public.publish_jobs;
CREATE POLICY "Workspace users can delete publish_jobs"
  ON public.publish_jobs
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = publish_jobs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS update_publish_jobs_updated_at ON public.publish_jobs;
CREATE TRIGGER update_publish_jobs_updated_at
  BEFORE UPDATE ON public.publish_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -----------------------------
-- 7) Triggers: keep approvals/queue in sync
-- -----------------------------

CREATE OR REPLACE FUNCTION public.sync_content_approvals_from_posts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'pending_approval' THEN
    INSERT INTO public.content_approvals (
      workspace_id,
      content_type,
      content_id,
      approval_status,
      requested_by,
      note
    )
    VALUES (
      NEW.workspace_id,
      'post',
      NEW.id,
      'pending',
      NEW.user_id,
      NULL
    )
    ON CONFLICT (content_type, content_id) DO UPDATE
      SET workspace_id = EXCLUDED.workspace_id,
          approval_status = 'pending',
          requested_by = EXCLUDED.requested_by,
          reviewed_by = NULL,
          reviewed_at = NULL,
          note = NULL;
  ELSE
    DELETE FROM public.content_approvals
    WHERE content_type = 'post'
      AND content_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_content_approvals_from_stories()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'pending_approval' THEN
    INSERT INTO public.content_approvals (
      workspace_id,
      content_type,
      content_id,
      approval_status,
      requested_by,
      note
    )
    VALUES (
      NEW.workspace_id,
      'story',
      NEW.id,
      'pending',
      NEW.user_id,
      NULL
    )
    ON CONFLICT (content_type, content_id) DO UPDATE
      SET workspace_id = EXCLUDED.workspace_id,
          approval_status = 'pending',
          requested_by = EXCLUDED.requested_by,
          reviewed_by = NULL,
          reviewed_at = NULL,
          note = NULL;
  ELSE
    DELETE FROM public.content_approvals
    WHERE content_type = 'story'
      AND content_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_content_approvals_posts ON public.posts;
CREATE TRIGGER sync_content_approvals_posts
  AFTER INSERT OR UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_content_approvals_from_posts();

DROP TRIGGER IF EXISTS sync_content_approvals_stories ON public.stories;
CREATE TRIGGER sync_content_approvals_stories
  AFTER INSERT OR UPDATE ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_content_approvals_from_stories();

-- Publish job sync
CREATE OR REPLACE FUNCTION public.sync_publish_jobs_from_posts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'scheduled' AND NEW.scheduled_at IS NOT NULL THEN
    INSERT INTO public.publish_jobs (
      workspace_id,
      content_type,
      content_id,
      state,
      run_at,
      retry_count,
      last_error
    )
    VALUES (
      NEW.workspace_id,
      'post',
      NEW.id,
      'queued',
      NEW.scheduled_at,
      0,
      NULL
    )
    ON CONFLICT (content_type, content_id) DO UPDATE
      SET workspace_id = EXCLUDED.workspace_id,
          state = 'queued',
          run_at = EXCLUDED.run_at,
          retry_count = 0,
          last_error = NULL;
  ELSE
    DELETE FROM public.publish_jobs
    WHERE content_type = 'post'
      AND content_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_publish_jobs_from_stories()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'scheduled' AND NEW.scheduled_at IS NOT NULL THEN
    INSERT INTO public.publish_jobs (
      workspace_id,
      content_type,
      content_id,
      state,
      run_at,
      retry_count,
      last_error
    )
    VALUES (
      NEW.workspace_id,
      'story',
      NEW.id,
      'queued',
      NEW.scheduled_at,
      0,
      NULL
    )
    ON CONFLICT (content_type, content_id) DO UPDATE
      SET workspace_id = EXCLUDED.workspace_id,
          state = 'queued',
          run_at = EXCLUDED.run_at,
          retry_count = 0,
          last_error = NULL;
  ELSE
    DELETE FROM public.publish_jobs
    WHERE content_type = 'story'
      AND content_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_publish_jobs_posts ON public.posts;
CREATE TRIGGER sync_publish_jobs_posts
  AFTER INSERT OR UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_publish_jobs_from_posts();

DROP TRIGGER IF EXISTS sync_publish_jobs_stories ON public.stories;
CREATE TRIGGER sync_publish_jobs_stories
  AFTER INSERT OR UPDATE ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_publish_jobs_from_stories();

COMMIT;

