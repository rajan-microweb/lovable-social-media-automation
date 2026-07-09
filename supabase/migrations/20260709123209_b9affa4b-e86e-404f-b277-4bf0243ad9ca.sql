
DROP POLICY IF EXISTS "Users can manage personal workspace" ON public.workspaces;

CREATE POLICY ws_select ON public.workspaces
  FOR SELECT USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));

CREATE POLICY ws_insert ON public.workspaces
  FOR INSERT WITH CHECK (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, 'ADMIN'::public.org_role));

CREATE POLICY ws_update ON public.workspaces
  FOR UPDATE USING (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, 'ADMIN'::public.org_role))
  WITH CHECK (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, 'ADMIN'::public.org_role));

CREATE POLICY ws_delete ON public.workspaces
  FOR DELETE USING (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, 'OWNER'::public.org_role));
