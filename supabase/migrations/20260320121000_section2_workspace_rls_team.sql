-- Follow-up for Section 2: allow workspace members to update content
-- and allow approval rows to be created by any workspace member.

BEGIN;

-- Posts: update policy - remove auth.uid() = user_id restriction in WITH CHECK
DROP POLICY IF EXISTS "Workspace users can update posts" ON public.posts;
CREATE POLICY "Workspace users can update posts"
  ON public.posts
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = posts.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = posts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Stories: update policy - remove auth.uid() = user_id restriction in WITH CHECK
DROP POLICY IF EXISTS "Workspace users can update stories" ON public.stories;
CREATE POLICY "Workspace users can update stories"
  ON public.stories
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = stories.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = stories.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Approvals: insertion/upsert should be allowed by any workspace member
DROP POLICY IF EXISTS "Workspace users can upsert approvals" ON public.content_approvals;
CREATE POLICY "Workspace users can upsert approvals"
  ON public.content_approvals
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = content_approvals.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Change requests: insertion/upsert should be allowed by any workspace member
DROP POLICY IF EXISTS "Workspace users can upsert change requests" ON public.content_change_requests;
CREATE POLICY "Workspace users can upsert change requests"
  ON public.content_change_requests
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = content_change_requests.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

COMMIT;

