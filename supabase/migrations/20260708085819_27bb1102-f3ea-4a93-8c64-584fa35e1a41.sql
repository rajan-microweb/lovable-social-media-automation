
-- ============================================================================
-- PHASE A: Multi-tenant Foundation
-- ============================================================================

-- ---------- Enums ----------
DO $$ BEGIN
  CREATE TYPE public.org_role AS ENUM ('OWNER','ADMIN','MANAGER','EDITOR','VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.member_status AS ENUM ('active','invited','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('trialing','active','past_due','canceled','paused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Utility: updated_at trigger fn (idempotent, already exists but ensure) ----------
CREATE OR REPLACE FUNCTION public.tenant_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  timezone text NOT NULL DEFAULT 'UTC',
  country text,
  brand_colors jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_organizations_owner ON public.organizations(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_role NOT NULL DEFAULT 'VIEWER',
  status public.member_status NOT NULL DEFAULT 'active',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org ON public.organization_members(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;

CREATE TABLE public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.org_role NOT NULL DEFAULT 'EDITOR',
  token text NOT NULL UNIQUE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_org_invite_pending
  ON public.organization_invitations (organization_id, lower(email))
  WHERE accepted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invitations TO authenticated;
GRANT ALL ON public.organization_invitations TO service_role;

-- ============================================================================
-- PERMISSIONS & CUSTOM ROLES
-- ============================================================================
CREATE TABLE public.permissions (
  key text PRIMARY KEY,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO authenticated, anon;
GRANT ALL ON public.permissions TO service_role;

CREATE TABLE public.organization_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_built_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_roles TO authenticated;
GRANT ALL ON public.organization_roles TO service_role;

CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.org_role,                              -- built-in role, if applicable
  custom_role_id uuid REFERENCES public.organization_roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role IS NOT NULL) <> (custom_role_id IS NOT NULL))
);
CREATE INDEX idx_role_perms_org ON public.role_permissions(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

-- ============================================================================
-- PLANS & SUBSCRIPTIONS
-- ============================================================================
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_monthly_cents integer NOT NULL DEFAULT 0,
  price_yearly_cents integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO authenticated, anon;
GRANT ALL ON public.plans TO service_role;

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  status public.subscription_status NOT NULL DEFAULT 'active',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  cancel_at timestamptz,
  provider text,           -- 'stripe' | 'paddle' | null
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

-- ============================================================================
-- OBSERVABILITY: usage / audit / notifications
-- ============================================================================
CREATE TABLE public.usage_logs (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metric text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_org_metric_time ON public.usage_logs(organization_id, metric, occurred_at DESC);
GRANT SELECT ON public.usage_logs TO authenticated;
GRANT ALL ON public.usage_logs TO service_role;

CREATE TABLE public.audit_logs (
  id bigserial PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  ip inet,
  user_agent text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_org_time ON public.audit_logs(organization_id, created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user_unread ON public.notifications(user_id, read_at, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- ============================================================================
-- API KEYS, WEBHOOKS, CUSTOM FIELDS, SETTINGS, USER CONTEXT
-- ============================================================================
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  hashed_key text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

CREATE TABLE public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks TO authenticated;
GRANT ALL ON public.webhooks TO service_role;

CREATE TABLE public.custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  key text NOT NULL,
  schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, resource_type, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_fields TO authenticated;
GRANT ALL ON public.custom_fields TO service_role;

CREATE TABLE public.organization_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_settings TO authenticated;
GRANT ALL ON public.organization_settings TO service_role;

CREATE TABLE public.workspace_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_settings TO authenticated;
GRANT ALL ON public.workspace_settings TO service_role;

CREATE TABLE public.user_context (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  active_workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_context TO authenticated;
GRANT ALL ON public.user_context TO service_role;

-- ============================================================================
-- EXTEND workspaces & content tables with organization_id
-- ============================================================================
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_workspaces_org ON public.workspaces(organization_id);

ALTER TABLE public.posts                            ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.stories                          ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.content_approvals                ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.content_change_requests          ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.content_templates                ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.media_assets                     ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.platform_integrations            ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.platform_integrations            ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.publish_jobs                     ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.analytics_platform_activity_snapshots ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_posts_org_created           ON public.posts(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_org_created         ON public.stories(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_org            ON public.media_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_templates_org               ON public.content_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_org            ON public.publish_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_plat_integrations_workspace ON public.platform_integrations(workspace_id);

-- ============================================================================
-- SECURITY DEFINER HELPERS (no recursion)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_org_member(_user uuid, _org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user AND organization_id = _org AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user uuid, _org uuid, _min public.org_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = _user AND m.organization_id = _org AND m.status = 'active'
      AND CASE m.role
            WHEN 'OWNER'   THEN 5
            WHEN 'ADMIN'   THEN 4
            WHEN 'MANAGER' THEN 3
            WHEN 'EDITOR'  THEN 2
            WHEN 'VIEWER'  THEN 1
          END
          >=
          CASE _min
            WHEN 'OWNER'   THEN 5
            WHEN 'ADMIN'   THEN 4
            WHEN 'MANAGER' THEN 3
            WHEN 'EDITOR'  THEN 2
            WHEN 'VIEWER'  THEN 1
          END
  );
$$;

CREATE OR REPLACE FUNCTION public.workspace_org(_workspace uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT organization_id FROM public.workspaces WHERE id = _workspace;
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_access(_user uuid, _workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_org_member(_user, public.workspace_org(_workspace));
$$;

CREATE OR REPLACE FUNCTION public.has_org_permission(_user uuid, _org uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    JOIN public.role_permissions rp
      ON rp.organization_id = m.organization_id
     AND (rp.role = m.role)
    WHERE m.user_id = _user
      AND m.organization_id = _org
      AND m.status = 'active'
      AND rp.permission_key = _perm
  )
  OR public.has_org_role(_user, _org, 'OWNER'::public.org_role);
$$;

-- ============================================================================
-- RLS
-- ============================================================================

-- organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), id));
CREATE POLICY org_insert ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY org_update ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_org_role(auth.uid(), id, 'ADMIN'))
  WITH CHECK (public.has_org_role(auth.uid(), id, 'ADMIN'));
CREATE POLICY org_delete ON public.organizations FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), id, 'OWNER'));

-- organization_members
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY om_select ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY om_insert ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    -- Owner bootstraps their own membership when creating an org,
    -- or an admin adds a new member.
    (user_id = auth.uid() AND role = 'OWNER')
    OR public.has_org_role(auth.uid(), organization_id, 'ADMIN')
  );
CREATE POLICY om_update ON public.organization_members FOR UPDATE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'ADMIN'))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'ADMIN'));
CREATE POLICY om_delete ON public.organization_members FOR DELETE TO authenticated
  USING (
    public.has_org_role(auth.uid(), organization_id, 'ADMIN')
    OR user_id = auth.uid()  -- allow self-leave
  );

-- organization_invitations
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY oi_select ON public.organization_invitations FOR SELECT TO authenticated
  USING (
    public.has_org_role(auth.uid(), organization_id, 'MANAGER')
    OR lower(email) = lower((auth.jwt() ->> 'email'))
  );
CREATE POLICY oi_insert ON public.organization_invitations FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'MANAGER'));
CREATE POLICY oi_update ON public.organization_invitations FOR UPDATE TO authenticated
  USING (
    public.has_org_role(auth.uid(), organization_id, 'MANAGER')
    OR lower(email) = lower((auth.jwt() ->> 'email'))
  )
  WITH CHECK (
    public.has_org_role(auth.uid(), organization_id, 'MANAGER')
    OR lower(email) = lower((auth.jwt() ->> 'email'))
  );
CREATE POLICY oi_delete ON public.organization_invitations FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'MANAGER'));

-- organization_roles / role_permissions
ALTER TABLE public.organization_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY or_select ON public.organization_roles FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY or_write ON public.organization_roles FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'ADMIN'))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'ADMIN'));

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY rp_select ON public.role_permissions FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY rp_write ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'ADMIN'))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'ADMIN'));

-- permissions (public catalog)
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY perm_select ON public.permissions FOR SELECT TO anon, authenticated USING (true);

-- plans (public catalog)
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_select ON public.plans FOR SELECT TO anon, authenticated USING (is_active = true);

-- subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sub_select ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY sub_write ON public.subscriptions FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'ADMIN'))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'ADMIN'));

-- usage_logs / audit_logs (read-only via RLS; server-side writes via service_role)
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_select ON public.usage_logs FOR SELECT TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'MANAGER'));

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_select ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'ADMIN'));

-- notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_select ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY notif_update ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY notif_delete ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- api_keys / webhooks / custom_fields
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY ak_read ON public.api_keys FOR SELECT TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'ADMIN'));
CREATE POLICY ak_write ON public.api_keys FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'ADMIN'))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'ADMIN'));

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY wh_read ON public.webhooks FOR SELECT TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'ADMIN'));
CREATE POLICY wh_write ON public.webhooks FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'ADMIN'))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'ADMIN'));

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY cf_read ON public.custom_fields FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY cf_write ON public.custom_fields FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'ADMIN'))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'ADMIN'));

-- settings
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY os_read ON public.organization_settings FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY os_write ON public.organization_settings FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'ADMIN'))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'ADMIN'));

ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws_read ON public.workspace_settings FOR SELECT TO authenticated
  USING (public.has_workspace_access(auth.uid(), workspace_id));
CREATE POLICY ws_write ON public.workspace_settings FOR ALL TO authenticated
  USING (public.has_workspace_access(auth.uid(), workspace_id))
  WITH CHECK (public.has_workspace_access(auth.uid(), workspace_id));

-- user_context (private to the user)
ALTER TABLE public.user_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY uc_all ON public.user_context FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- Backfill trigger: derive organization_id from workspace_id on insert
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_org_from_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.workspace_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.workspaces WHERE id = NEW.workspace_id;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'posts','stories','content_approvals','content_change_requests',
    'content_templates','media_assets','platform_integrations',
    'publish_jobs','analytics_platform_activity_snapshots'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_org_%I ON public.%I;
       CREATE TRIGGER trg_set_org_%I BEFORE INSERT ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_org_from_workspace();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- updated_at triggers on new tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations','organization_members','organization_invitations',
    'organization_roles','plans','subscriptions','api_keys','webhooks',
    'custom_fields','organization_settings','workspace_settings'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_touch_%I ON public.%I;
       CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.tenant_touch_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- SEED permissions & plans
-- ============================================================================
INSERT INTO public.permissions(key, description, category) VALUES
  ('posts.view','View posts','posts'),
  ('posts.create','Create posts','posts'),
  ('posts.edit','Edit posts','posts'),
  ('posts.delete','Delete posts','posts'),
  ('posts.publish','Publish posts','posts'),
  ('stories.view','View stories','stories'),
  ('stories.create','Create stories','stories'),
  ('stories.edit','Edit stories','stories'),
  ('stories.delete','Delete stories','stories'),
  ('stories.publish','Publish stories','stories'),
  ('templates.manage','Manage templates','content'),
  ('media.upload','Upload media','media'),
  ('media.delete','Delete media','media'),
  ('ai.use','Use AI features','ai'),
  ('analytics.view','View analytics','analytics'),
  ('integrations.manage','Manage social integrations','integrations'),
  ('members.manage','Manage organization members','admin'),
  ('roles.manage','Manage roles and permissions','admin'),
  ('billing.manage','Manage billing and subscription','billing'),
  ('settings.manage','Manage organization settings','admin'),
  ('api_keys.manage','Manage API keys','platform'),
  ('webhooks.manage','Manage webhooks','platform'),
  ('audit_logs.view','View audit logs','admin'),
  ('workspaces.manage','Create and manage workspaces','admin')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.plans(code, name, description, price_monthly_cents, price_yearly_cents, sort_order, limits, features) VALUES
 ('free','Free','Get started for free',0,0,1,
  '{"users":2,"workspaces":1,"storage_mb":500,"posts_per_month":30,"ai_credits":50}'::jsonb,
  '{"ai":true,"ai.advanced":false,"automation":false,"analytics.advanced":false,"white_label":false,"api":false,"custom_domain":false,"priority_support":false}'::jsonb),
 ('starter','Starter','For solo creators',1900,19000,2,
  '{"users":3,"workspaces":2,"storage_mb":5000,"posts_per_month":200,"ai_credits":500}'::jsonb,
  '{"ai":true,"ai.advanced":false,"automation":true,"analytics.advanced":false,"white_label":false,"api":false,"custom_domain":false,"priority_support":false}'::jsonb),
 ('professional','Professional','For growing teams',4900,49000,3,
  '{"users":10,"workspaces":5,"storage_mb":25000,"posts_per_month":1000,"ai_credits":5000}'::jsonb,
  '{"ai":true,"ai.advanced":true,"automation":true,"analytics.advanced":true,"white_label":false,"api":true,"custom_domain":false,"priority_support":false}'::jsonb),
 ('business','Business','For agencies and larger teams',9900,99000,4,
  '{"users":25,"workspaces":15,"storage_mb":100000,"posts_per_month":5000,"ai_credits":25000}'::jsonb,
  '{"ai":true,"ai.advanced":true,"automation":true,"analytics.advanced":true,"white_label":true,"api":true,"custom_domain":true,"priority_support":true}'::jsonb),
 ('enterprise','Enterprise','Custom, at scale',0,0,5,
  '{"users":-1,"workspaces":-1,"storage_mb":-1,"posts_per_month":-1,"ai_credits":-1}'::jsonb,
  '{"ai":true,"ai.advanced":true,"automation":true,"analytics.advanced":true,"white_label":true,"api":true,"custom_domain":true,"priority_support":true,"sso":true,"scim":true}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- Seed built-in role → permission mappings for every future org via helper
CREATE OR REPLACE FUNCTION public.seed_org_role_permissions(_org uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- VIEWER
  INSERT INTO public.role_permissions(organization_id, role, permission_key)
  SELECT _org, 'VIEWER'::public.org_role, k FROM (VALUES
    ('posts.view'),('stories.view'),('analytics.view')
  ) v(k)
  ON CONFLICT DO NOTHING;

  -- EDITOR
  INSERT INTO public.role_permissions(organization_id, role, permission_key)
  SELECT _org, 'EDITOR'::public.org_role, k FROM (VALUES
    ('posts.view'),('posts.create'),('posts.edit'),
    ('stories.view'),('stories.create'),('stories.edit'),
    ('media.upload'),('ai.use'),('analytics.view'),('templates.manage')
  ) v(k) ON CONFLICT DO NOTHING;

  -- MANAGER
  INSERT INTO public.role_permissions(organization_id, role, permission_key)
  SELECT _org, 'MANAGER'::public.org_role, k FROM (VALUES
    ('posts.view'),('posts.create'),('posts.edit'),('posts.delete'),('posts.publish'),
    ('stories.view'),('stories.create'),('stories.edit'),('stories.delete'),('stories.publish'),
    ('media.upload'),('media.delete'),('ai.use'),('analytics.view'),
    ('templates.manage'),('integrations.manage')
  ) v(k) ON CONFLICT DO NOTHING;

  -- ADMIN (everything except billing.manage which stays with OWNER by default)
  INSERT INTO public.role_permissions(organization_id, role, permission_key)
  SELECT _org, 'ADMIN'::public.org_role, key FROM public.permissions
  WHERE key <> 'billing.manage'
  ON CONFLICT DO NOTHING;

  -- OWNER inherits everything via has_org_permission (OR clause), no seeding needed.
END $$;

-- ============================================================================
-- Update handle_new_user: only create profile, no default org/role
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name','User'),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
