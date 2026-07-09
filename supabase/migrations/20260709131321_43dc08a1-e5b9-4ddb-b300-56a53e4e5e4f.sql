
-- 1a. Backfill from workspaces.
UPDATE public.posts p SET organization_id = w.organization_id FROM public.workspaces w
  WHERE p.workspace_id = w.id AND p.organization_id IS NULL AND w.organization_id IS NOT NULL;
UPDATE public.stories s SET organization_id = w.organization_id FROM public.workspaces w
  WHERE s.workspace_id = w.id AND s.organization_id IS NULL AND w.organization_id IS NOT NULL;
UPDATE public.media_assets m SET organization_id = w.organization_id FROM public.workspaces w
  WHERE m.workspace_id = w.id AND m.organization_id IS NULL AND w.organization_id IS NOT NULL;
UPDATE public.content_templates c SET organization_id = w.organization_id FROM public.workspaces w
  WHERE c.workspace_id = w.id AND c.organization_id IS NULL AND w.organization_id IS NOT NULL;
UPDATE public.content_reviews c SET organization_id = w.organization_id FROM public.workspaces w
  WHERE c.workspace_id = w.id AND c.organization_id IS NULL AND w.organization_id IS NOT NULL;
UPDATE public.platform_integrations p SET organization_id = w.organization_id FROM public.workspaces w
  WHERE p.workspace_id = w.id AND p.organization_id IS NULL AND w.organization_id IS NOT NULL;
UPDATE public.publish_jobs j SET organization_id = w.organization_id FROM public.workspaces w
  WHERE j.workspace_id = w.id AND j.organization_id IS NULL AND w.organization_id IS NOT NULL;
UPDATE public.analytics_platform_activity_snapshots a SET organization_id = w.organization_id FROM public.workspaces w
  WHERE a.workspace_id = w.id AND a.organization_id IS NULL AND w.organization_id IS NOT NULL;
UPDATE public.notifications n SET organization_id = w.organization_id FROM public.workspaces w
  WHERE n.workspace_id = w.id AND n.organization_id IS NULL AND w.organization_id IS NOT NULL;
UPDATE public.audit_logs a SET organization_id = w.organization_id FROM public.workspaces w
  WHERE a.workspace_id = w.id AND a.organization_id IS NULL AND w.organization_id IS NOT NULL;
UPDATE public.usage_logs u SET organization_id = w.organization_id FROM public.workspaces w
  WHERE u.workspace_id = w.id AND u.organization_id IS NULL AND w.organization_id IS NOT NULL;

-- 1b. Legacy fallback: use owning user's active org (or first membership).
CREATE TEMP VIEW _user_org AS
  SELECT p.id AS user_id, COALESCE(p.active_organization_id, (
    SELECT organization_id FROM public.organization_members m
    WHERE m.user_id = p.id AND m.status='active' ORDER BY m.created_at LIMIT 1
  )) AS org_id
  FROM public.profiles p;

UPDATE public.stories s SET organization_id = uo.org_id FROM _user_org uo
  WHERE uo.user_id = s.user_id AND s.organization_id IS NULL AND uo.org_id IS NOT NULL;
UPDATE public.posts po SET organization_id = uo.org_id FROM _user_org uo
  WHERE uo.user_id = po.user_id AND po.organization_id IS NULL AND uo.org_id IS NOT NULL;
UPDATE public.platform_integrations pi SET organization_id = uo.org_id FROM _user_org uo
  WHERE uo.user_id = pi.user_id AND pi.organization_id IS NULL AND uo.org_id IS NOT NULL;
UPDATE public.content_templates c SET organization_id = uo.org_id FROM _user_org uo
  WHERE uo.user_id = c.created_by AND c.organization_id IS NULL AND uo.org_id IS NOT NULL;
UPDATE public.media_assets m SET organization_id = uo.org_id FROM _user_org uo
  WHERE uo.user_id = m.user_id AND m.organization_id IS NULL AND uo.org_id IS NOT NULL;

-- publish_jobs: derive from the linked post/story
UPDATE public.publish_jobs j SET organization_id = po.organization_id FROM public.posts po
  WHERE j.content_type='post' AND j.content_id = po.id AND j.organization_id IS NULL AND po.organization_id IS NOT NULL;
UPDATE public.publish_jobs j SET organization_id = st.organization_id FROM public.stories st
  WHERE j.content_type='story' AND j.content_id = st.id AND j.organization_id IS NULL AND st.organization_id IS NOT NULL;

DROP VIEW _user_org;

-- 1c. Delete truly orphaned rows.
DELETE FROM public.stories WHERE organization_id IS NULL;
DELETE FROM public.posts WHERE organization_id IS NULL;
DELETE FROM public.media_assets WHERE organization_id IS NULL;
DELETE FROM public.content_templates WHERE organization_id IS NULL;
DELETE FROM public.content_reviews WHERE organization_id IS NULL;
DELETE FROM public.platform_integrations WHERE organization_id IS NULL;
DELETE FROM public.publish_jobs WHERE organization_id IS NULL;
DELETE FROM public.analytics_platform_activity_snapshots WHERE organization_id IS NULL;

-- 2. Drop workspace-based RLS policies.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
    WHERE schemaname='public' AND (qual::text ILIKE '%workspace%' OR with_check::text ILIKE '%workspace%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "content_reviews_select" ON public.content_reviews;
DROP POLICY IF EXISTS "content_reviews_update" ON public.content_reviews;
DROP POLICY IF EXISTS "content_reviews_delete" ON public.content_reviews;
DROP POLICY IF EXISTS "content_reviews_insert" ON public.content_reviews;

-- 3. Drop workspace-based triggers.
DROP TRIGGER IF EXISTS trg_set_org_analytics_platform_activity_snapshots ON public.analytics_platform_activity_snapshots;
DROP TRIGGER IF EXISTS trg_set_org_content_templates ON public.content_templates;
DROP TRIGGER IF EXISTS trg_set_org_media_assets ON public.media_assets;
DROP TRIGGER IF EXISTS trg_set_org_platform_integrations ON public.platform_integrations;
DROP TRIGGER IF EXISTS trg_set_org_posts ON public.posts;
DROP TRIGGER IF EXISTS trg_set_org_publish_jobs ON public.publish_jobs;
DROP TRIGGER IF EXISTS trg_set_org_stories ON public.stories;

-- 4. Update sync trigger functions.
CREATE OR REPLACE FUNCTION public.sync_content_approvals_from_posts()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.status = 'pending_approval' THEN
    INSERT INTO public.content_reviews (organization_id, kind, content_type, content_id, status, requested_by)
    VALUES (NEW.organization_id, 'approval', 'post', NEW.id, 'pending', NEW.user_id)
    ON CONFLICT (kind, content_type, content_id) DO UPDATE
      SET organization_id = EXCLUDED.organization_id, status='pending',
          requested_by = EXCLUDED.requested_by, reviewed_by=NULL, reviewed_at=NULL, note=NULL;
  ELSE
    DELETE FROM public.content_reviews WHERE kind='approval' AND content_type='post' AND content_id = NEW.id;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.sync_content_approvals_from_stories()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.status = 'pending_approval' THEN
    INSERT INTO public.content_reviews (organization_id, kind, content_type, content_id, status, requested_by)
    VALUES (NEW.organization_id, 'approval', 'story', NEW.id, 'pending', NEW.user_id)
    ON CONFLICT (kind, content_type, content_id) DO UPDATE
      SET organization_id = EXCLUDED.organization_id, status='pending',
          requested_by = EXCLUDED.requested_by, reviewed_by=NULL, reviewed_at=NULL, note=NULL;
  ELSE
    DELETE FROM public.content_reviews WHERE kind='approval' AND content_type='story' AND content_id = NEW.id;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.sync_publish_jobs_from_posts()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.status='scheduled' AND NEW.scheduled_at IS NOT NULL THEN
    INSERT INTO public.publish_jobs (organization_id, content_type, content_id, state, run_at, retry_count, last_error)
    VALUES (NEW.organization_id, 'post', NEW.id, 'queued', NEW.scheduled_at, 0, NULL)
    ON CONFLICT (content_type, content_id) DO UPDATE
      SET organization_id = EXCLUDED.organization_id, state='queued', run_at = EXCLUDED.run_at, retry_count=0, last_error=NULL;
  ELSIF NEW.status IN ('published','failed') THEN
    RETURN NEW;
  ELSE
    DELETE FROM public.publish_jobs WHERE content_type='post' AND content_id = NEW.id;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.sync_publish_jobs_from_stories()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.status='scheduled' AND NEW.scheduled_at IS NOT NULL THEN
    INSERT INTO public.publish_jobs (organization_id, content_type, content_id, state, run_at, retry_count, last_error)
    VALUES (NEW.organization_id, 'story', NEW.id, 'queued', NEW.scheduled_at, 0, NULL)
    ON CONFLICT (content_type, content_id) DO UPDATE
      SET organization_id = EXCLUDED.organization_id, state='queued', run_at = EXCLUDED.run_at, retry_count=0, last_error=NULL;
  ELSIF NEW.status IN ('published','failed') THEN
    RETURN NEW;
  ELSE
    DELETE FROM public.publish_jobs WHERE content_type='story' AND content_id = NEW.id;
  END IF;
  RETURN NEW;
END; $function$;

-- 5. Drop workspace_id columns.
ALTER TABLE public.analytics_platform_activity_snapshots DROP COLUMN IF EXISTS workspace_id CASCADE;
ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS workspace_id CASCADE;
ALTER TABLE public.content_reviews DROP COLUMN IF EXISTS workspace_id CASCADE;
ALTER TABLE public.content_templates DROP COLUMN IF EXISTS workspace_id CASCADE;
ALTER TABLE public.media_assets DROP COLUMN IF EXISTS workspace_id CASCADE;
ALTER TABLE public.notifications DROP COLUMN IF EXISTS workspace_id CASCADE;
ALTER TABLE public.platform_integrations DROP COLUMN IF EXISTS workspace_id CASCADE;
ALTER TABLE public.posts DROP COLUMN IF EXISTS workspace_id CASCADE;
ALTER TABLE public.publish_jobs DROP COLUMN IF EXISTS workspace_id CASCADE;
ALTER TABLE public.stories DROP COLUMN IF EXISTS workspace_id CASCADE;
ALTER TABLE public.usage_logs DROP COLUMN IF EXISTS workspace_id CASCADE;

-- 6. NOT NULL.
ALTER TABLE public.posts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.stories ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.media_assets ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.content_templates ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.content_reviews ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.platform_integrations ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.publish_jobs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.analytics_platform_activity_snapshots ALTER COLUMN organization_id SET NOT NULL;

-- 7. FKs.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'posts','stories','media_assets','content_templates','content_reviews',
    'platform_integrations','publish_jobs','analytics_platform_activity_snapshots',
    'notifications','audit_logs','usage_logs'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid
      WHERE rel.relname = t AND c.contype='f'
        AND pg_get_constraintdef(c.oid) ILIKE '%organization_id%REFERENCES organizations%'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE',
        t, t || '_organization_id_fkey');
    END IF;
  END LOOP;
END $$;

-- 8. Indexes.
CREATE INDEX IF NOT EXISTS posts_organization_id_idx ON public.posts(organization_id);
CREATE INDEX IF NOT EXISTS stories_organization_id_idx ON public.stories(organization_id);
CREATE INDEX IF NOT EXISTS media_assets_organization_id_idx ON public.media_assets(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_reviews_org_status_idx ON public.content_reviews(organization_id, status);
CREATE INDEX IF NOT EXISTS platform_integrations_organization_id_idx ON public.platform_integrations(organization_id);
CREATE INDEX IF NOT EXISTS analytics_snapshots_org_published_idx ON public.analytics_platform_activity_snapshots(organization_id, published_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_organization_id_file_path_key ON public.media_assets(organization_id, file_path);
CREATE UNIQUE INDEX IF NOT EXISTS analytics_snapshots_org_user_content_key
  ON public.analytics_platform_activity_snapshots(organization_id, user_id, platform, account_id, platform_content_id);

-- 9. Drop workspace-only tables/helpers.
DROP TABLE IF EXISTS public.workspace_members CASCADE;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS active_workspace_id CASCADE;
DROP TABLE IF EXISTS public.workspaces CASCADE;
DROP FUNCTION IF EXISTS public.workspace_org(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_workspace_access(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.set_org_from_workspace() CASCADE;

-- 10. tenant_settings scope check.
ALTER TABLE public.tenant_settings DROP CONSTRAINT IF EXISTS tenant_settings_scope_check;
ALTER TABLE public.tenant_settings ADD CONSTRAINT tenant_settings_scope_check CHECK (scope = 'org');

-- 11. Org-scoped RLS policies.
CREATE POLICY posts_select ON public.posts FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY posts_insert ON public.posts FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), organization_id) AND user_id = auth.uid());
CREATE POLICY posts_update ON public.posts FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), organization_id)) WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY posts_delete ON public.posts FOR DELETE TO authenticated USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY stories_select ON public.stories FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY stories_insert ON public.stories FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), organization_id) AND user_id = auth.uid());
CREATE POLICY stories_update ON public.stories FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), organization_id)) WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY stories_delete ON public.stories FOR DELETE TO authenticated USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY media_assets_select ON public.media_assets FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY media_assets_insert ON public.media_assets FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY media_assets_update ON public.media_assets FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY media_assets_delete ON public.media_assets FOR DELETE TO authenticated USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY content_templates_select ON public.content_templates FOR SELECT TO authenticated USING (organization_id IS NULL OR public.is_org_member(auth.uid(), organization_id));
CREATE POLICY content_templates_insert ON public.content_templates FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY content_templates_update ON public.content_templates FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY content_templates_delete ON public.content_templates FOR DELETE TO authenticated USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY content_reviews_select ON public.content_reviews FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY content_reviews_insert ON public.content_reviews FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY content_reviews_update ON public.content_reviews FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY content_reviews_delete ON public.content_reviews FOR DELETE TO authenticated USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY platform_integrations_select ON public.platform_integrations FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY platform_integrations_insert ON public.platform_integrations FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY platform_integrations_update ON public.platform_integrations FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY platform_integrations_delete ON public.platform_integrations FOR DELETE TO authenticated USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY publish_jobs_select ON public.publish_jobs FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY publish_jobs_insert ON public.publish_jobs FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY publish_jobs_update ON public.publish_jobs FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY publish_jobs_delete ON public.publish_jobs FOR DELETE TO authenticated USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY analytics_snapshots_select ON public.analytics_platform_activity_snapshots FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY analytics_snapshots_insert ON public.analytics_platform_activity_snapshots FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY analytics_snapshots_update ON public.analytics_platform_activity_snapshots FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY analytics_snapshots_delete ON public.analytics_platform_activity_snapshots FOR DELETE TO authenticated USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), organization_id));
