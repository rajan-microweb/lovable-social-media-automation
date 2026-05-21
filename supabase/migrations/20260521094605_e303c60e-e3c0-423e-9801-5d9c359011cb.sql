
-- Consolidate user_roles INSERT policies: remove the broad ALL/public policy
-- and rely on a single authenticated-admin INSERT policy.
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- Keep "Only admins can insert roles" (authenticated) and "Admins can view all roles".
-- Add explicit UPDATE/DELETE policies restricted to admins so admins retain management
-- without the over-broad public ALL policy.
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'ADMIN'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'ADMIN'::app_role));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'ADMIN'::app_role));

-- Lock down analytics_platform_activity_snapshots writes. Service-role bypasses RLS,
-- so edge functions still work; signed-in users get no direct write access.
DROP POLICY IF EXISTS "Block client inserts on analytics snapshots" ON public.analytics_platform_activity_snapshots;
CREATE POLICY "Block client inserts on analytics snapshots"
ON public.analytics_platform_activity_snapshots
FOR INSERT
TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "Block client updates on analytics snapshots" ON public.analytics_platform_activity_snapshots;
CREATE POLICY "Block client updates on analytics snapshots"
ON public.analytics_platform_activity_snapshots
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Block client deletes on analytics snapshots" ON public.analytics_platform_activity_snapshots;
CREATE POLICY "Block client deletes on analytics snapshots"
ON public.analytics_platform_activity_snapshots
FOR DELETE
TO authenticated
USING (false);
