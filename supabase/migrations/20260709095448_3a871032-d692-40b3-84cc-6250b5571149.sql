
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;

UPDATE public.profiles p
SET active_organization_id = uc.active_organization_id,
    active_workspace_id = uc.active_workspace_id
FROM public.user_context uc
WHERE uc.user_id = p.id;

DROP TABLE IF EXISTS public.user_context CASCADE;
