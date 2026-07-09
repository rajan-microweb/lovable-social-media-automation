
-- Auto-add creator as OWNER member on organization insert
CREATE OR REPLACE FUNCTION public.add_owner_as_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (NEW.id, NEW.owner_id, 'OWNER'::public.org_role, 'active')
  ON CONFLICT (organization_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_owner_as_member ON public.organizations;
CREATE TRIGGER trg_add_owner_as_member
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.add_owner_as_member();

-- Also allow owner_id to select their org directly (belt & suspenders for RETURNING)
DROP POLICY IF EXISTS org_select ON public.organizations;
CREATE POLICY org_select ON public.organizations
FOR SELECT
USING (owner_id = auth.uid() OR public.is_org_member(auth.uid(), id));
