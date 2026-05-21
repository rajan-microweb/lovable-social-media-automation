
DROP POLICY IF EXISTS "Workspace users can upsert approvals" ON public.content_approvals;
CREATE POLICY "Workspace users can upsert approvals"
ON public.content_approvals
FOR INSERT
TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = content_approvals.workspace_id
      AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Workspace users can upsert change requests" ON public.content_change_requests;
CREATE POLICY "Workspace users can upsert change requests"
ON public.content_change_requests
FOR INSERT
TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = content_change_requests.workspace_id
      AND wm.user_id = auth.uid()
  )
);
