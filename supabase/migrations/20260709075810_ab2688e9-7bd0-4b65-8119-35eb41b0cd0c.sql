
-- platform_integrations: add tenant columns
ALTER TABLE public.platform_integrations
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill workspace_id from user's personal workspace (workspace.id = user.id assumption)
UPDATE public.platform_integrations pi
SET workspace_id = w.id,
    organization_id = w.organization_id
FROM public.workspaces w
WHERE pi.workspace_id IS NULL
  AND w.id = pi.user_id;

CREATE INDEX IF NOT EXISTS idx_platform_integrations_workspace
  ON public.platform_integrations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_platform_integrations_org
  ON public.platform_integrations(organization_id);

-- media_assets: ensure tenant columns exist
ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.media_assets ma
SET organization_id = w.organization_id
FROM public.workspaces w
WHERE ma.organization_id IS NULL
  AND ma.workspace_id = w.id;

CREATE INDEX IF NOT EXISTS idx_media_assets_org
  ON public.media_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_workspace_created
  ON public.media_assets(workspace_id, created_at DESC);
