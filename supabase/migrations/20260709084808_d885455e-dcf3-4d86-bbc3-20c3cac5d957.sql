
-- ============ content_reviews ============
CREATE TABLE public.content_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('approval','change_request')),
  content_type text NOT NULL CHECK (content_type IN ('post','story')),
  content_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','resolved')),
  requested_by uuid NOT NULL,
  reviewed_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  note text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, content_type, content_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_reviews TO authenticated;
GRANT ALL ON public.content_reviews TO service_role;

ALTER TABLE public.content_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_reviews_select ON public.content_reviews
  FOR SELECT USING (public.has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY content_reviews_insert ON public.content_reviews
  FOR INSERT WITH CHECK (public.has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY content_reviews_update ON public.content_reviews
  FOR UPDATE USING (public.has_workspace_access(auth.uid(), workspace_id))
  WITH CHECK (public.has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY content_reviews_delete ON public.content_reviews
  FOR DELETE USING (public.has_workspace_access(auth.uid(), workspace_id));

CREATE INDEX idx_content_reviews_ws_status ON public.content_reviews(workspace_id, status);
CREATE INDEX idx_content_reviews_content ON public.content_reviews(content_type, content_id);

CREATE TRIGGER trg_content_reviews_touch
  BEFORE UPDATE ON public.content_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tenant_touch_updated_at();

-- Backfill from content_approvals
INSERT INTO public.content_reviews (
  organization_id, workspace_id, kind, content_type, content_id, status,
  requested_by, reviewed_by, requested_at, reviewed_at, note, created_at, updated_at
)
SELECT organization_id, workspace_id, 'approval', content_type, content_id, approval_status,
       requested_by, reviewed_by, requested_at, reviewed_at, note, created_at, updated_at
FROM public.content_approvals
ON CONFLICT (kind, content_type, content_id) DO NOTHING;

-- Backfill from content_change_requests
INSERT INTO public.content_reviews (
  organization_id, workspace_id, kind, content_type, content_id, status,
  requested_by, reviewed_by, requested_at, reviewed_at, details, created_at, updated_at
)
SELECT organization_id, workspace_id, 'change_request', content_type, content_id, request_status,
       requested_by, reviewed_by, requested_at, reviewed_at, details, created_at, updated_at
FROM public.content_change_requests
ON CONFLICT (kind, content_type, content_id) DO NOTHING;

-- Rewrite the sync triggers to write into content_reviews
CREATE OR REPLACE FUNCTION public.sync_content_approvals_from_posts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'pending_approval' THEN
    INSERT INTO public.content_reviews (
      workspace_id, kind, content_type, content_id, status, requested_by
    ) VALUES (
      NEW.workspace_id, 'approval', 'post', NEW.id, 'pending', NEW.user_id
    )
    ON CONFLICT (kind, content_type, content_id) DO UPDATE
      SET workspace_id = EXCLUDED.workspace_id,
          status = 'pending',
          requested_by = EXCLUDED.requested_by,
          reviewed_by = NULL,
          reviewed_at = NULL,
          note = NULL;
  ELSE
    DELETE FROM public.content_reviews
    WHERE kind = 'approval' AND content_type = 'post' AND content_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_content_approvals_from_stories()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'pending_approval' THEN
    INSERT INTO public.content_reviews (
      workspace_id, kind, content_type, content_id, status, requested_by
    ) VALUES (
      NEW.workspace_id, 'approval', 'story', NEW.id, 'pending', NEW.user_id
    )
    ON CONFLICT (kind, content_type, content_id) DO UPDATE
      SET workspace_id = EXCLUDED.workspace_id,
          status = 'pending',
          requested_by = EXCLUDED.requested_by,
          reviewed_by = NULL,
          reviewed_at = NULL,
          note = NULL;
  ELSE
    DELETE FROM public.content_reviews
    WHERE kind = 'approval' AND content_type = 'story' AND content_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TABLE public.content_approvals CASCADE;
DROP TABLE public.content_change_requests CASCADE;

-- ============ tenant_settings ============
CREATE TABLE public.tenant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('org','workspace')),
  scope_id uuid NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_settings TO authenticated;
GRANT ALL ON public.tenant_settings TO service_role;

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_settings_select ON public.tenant_settings
  FOR SELECT USING (
    (scope = 'org'       AND public.is_org_member(auth.uid(), scope_id)) OR
    (scope = 'workspace' AND public.has_workspace_access(auth.uid(), scope_id))
  );

CREATE POLICY tenant_settings_write ON public.tenant_settings
  FOR ALL USING (
    (scope = 'org'       AND public.has_org_role(auth.uid(), scope_id, 'ADMIN'::public.org_role)) OR
    (scope = 'workspace' AND public.has_workspace_access(auth.uid(), scope_id))
  ) WITH CHECK (
    (scope = 'org'       AND public.has_org_role(auth.uid(), scope_id, 'ADMIN'::public.org_role)) OR
    (scope = 'workspace' AND public.has_workspace_access(auth.uid(), scope_id))
  );

CREATE TRIGGER trg_tenant_settings_touch
  BEFORE UPDATE ON public.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION public.tenant_touch_updated_at();

INSERT INTO public.tenant_settings (scope, scope_id, settings, created_at, updated_at)
SELECT 'org', organization_id, settings, created_at, updated_at
FROM public.organization_settings
ON CONFLICT (scope, scope_id) DO NOTHING;

INSERT INTO public.tenant_settings (scope, scope_id, settings, created_at, updated_at)
SELECT 'workspace', workspace_id, settings, created_at, updated_at
FROM public.workspace_settings
ON CONFLICT (scope, scope_id) DO NOTHING;

DROP TABLE public.organization_settings CASCADE;
DROP TABLE public.workspace_settings CASCADE;
