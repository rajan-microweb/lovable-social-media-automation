
DROP POLICY IF EXISTS "Block client inserts on analytics snapshots" ON public.analytics_platform_activity_snapshots;
DROP POLICY IF EXISTS "Block client updates on analytics snapshots" ON public.analytics_platform_activity_snapshots;
DROP POLICY IF EXISTS "Block client deletes on analytics snapshots" ON public.analytics_platform_activity_snapshots;

CREATE POLICY "Block client inserts on analytics snapshots"
ON public.analytics_platform_activity_snapshots
AS RESTRICTIVE
FOR INSERT
TO public
WITH CHECK (false);

CREATE POLICY "Block client updates on analytics snapshots"
ON public.analytics_platform_activity_snapshots
AS RESTRICTIVE
FOR UPDATE
TO public
USING (false)
WITH CHECK (false);

CREATE POLICY "Block client deletes on analytics snapshots"
ON public.analytics_platform_activity_snapshots
AS RESTRICTIVE
FOR DELETE
TO public
USING (false);
