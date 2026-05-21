
-- 1) Remove platform_integrations from realtime publication to prevent credential broadcast
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'platform_integrations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.platform_integrations';
  END IF;
END $$;

-- 2) Explicit INSERT policy for user_roles: only admins may insert
DROP POLICY IF EXISTS "Only admins can insert roles" ON public.user_roles;
CREATE POLICY "Only admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'ADMIN'::app_role));

-- 3) Restrict content_templates anonymous reads: require authentication even for NULL workspace rows
DROP POLICY IF EXISTS "Workspace users can view content_templates" ON public.content_templates;
CREATE POLICY "Workspace users can view content_templates"
ON public.content_templates
FOR SELECT
TO authenticated
USING (
  (workspace_id IS NULL)
  OR public.has_role(auth.uid(), 'ADMIN'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = content_templates.workspace_id
      AND wm.user_id = auth.uid()
  )
);

-- 4) Pin search_path on remaining functions that lack it
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.sync_content_approvals_from_posts() SET search_path = public;
ALTER FUNCTION public.sync_content_approvals_from_stories() SET search_path = public;
ALTER FUNCTION public.sync_publish_jobs_from_posts() SET search_path = public;
ALTER FUNCTION public.sync_publish_jobs_from_stories() SET search_path = public;
