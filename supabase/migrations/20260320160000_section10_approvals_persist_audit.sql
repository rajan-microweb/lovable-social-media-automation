-- Publer-like Section 10.2: persist approval audit rows
-- Previous trigger behavior deleted `content_approvals` rows whenever the
-- corresponding post/story left `pending_approval`, which prevented:
--   - approval pages from showing reviewed history
--   - admin review actions from persisting `approved/rejected` states
-- We now keep the row and only (re)initialize it when content goes back
-- into `pending_approval`.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_content_approvals_from_posts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'pending_approval' THEN
    INSERT INTO public.content_approvals (
      workspace_id,
      content_type,
      content_id,
      approval_status,
      requested_by,
      note
    )
    VALUES (
      NEW.workspace_id,
      'post',
      NEW.id,
      'pending',
      NEW.user_id,
      NULL
    )
    ON CONFLICT (content_type, content_id) DO UPDATE
      SET workspace_id = EXCLUDED.workspace_id,
          approval_status = 'pending',
          requested_by = EXCLUDED.requested_by,
          reviewed_by = NULL,
          reviewed_at = NULL,
          note = NULL;
  END IF;

  -- Keep approvals rows for audit/history after review.
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_content_approvals_from_stories()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'pending_approval' THEN
    INSERT INTO public.content_approvals (
      workspace_id,
      content_type,
      content_id,
      approval_status,
      requested_by,
      note
    )
    VALUES (
      NEW.workspace_id,
      'story',
      NEW.id,
      'pending',
      NEW.user_id,
      NULL
    )
    ON CONFLICT (content_type, content_id) DO UPDATE
      SET workspace_id = EXCLUDED.workspace_id,
          approval_status = 'pending',
          requested_by = EXCLUDED.requested_by,
          reviewed_by = NULL,
          reviewed_at = NULL,
          note = NULL;
  END IF;

  -- Keep approvals rows for audit/history after review.
  RETURN NEW;
END;
$$;

COMMIT;

