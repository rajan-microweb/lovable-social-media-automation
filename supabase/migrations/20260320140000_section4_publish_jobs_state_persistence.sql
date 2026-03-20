-- Publer-like Section 4: persist publish_jobs for published/failed content
-- so Queue + Calendar can surface retry/failure/published states.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_publish_jobs_from_posts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When content is actively scheduled, ensure there is exactly one queued job.
  IF NEW.status = 'scheduled' AND NEW.scheduled_at IS NOT NULL THEN
    INSERT INTO public.publish_jobs (
      workspace_id,
      content_type,
      content_id,
      state,
      run_at,
      retry_count,
      last_error
    )
    VALUES (
      NEW.workspace_id,
      'post',
      NEW.id,
      'queued',
      NEW.scheduled_at,
      0,
      NULL
    )
    ON CONFLICT (content_type, content_id) DO UPDATE
      SET workspace_id = EXCLUDED.workspace_id,
          state = 'queued',
          run_at = EXCLUDED.run_at,
          retry_count = 0,
          last_error = NULL;

  -- When content becomes published/failed, keep the job row.
  -- The publishing worker owns state transitions and retry metadata.
  ELSIF NEW.status IN ('published', 'failed') THEN
    RETURN NEW;

  -- For drafts/cancellations/pending approval, remove queued/publishing jobs.
  ELSE
    DELETE FROM public.publish_jobs
    WHERE content_type = 'post'
      AND content_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_publish_jobs_from_stories()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'scheduled' AND NEW.scheduled_at IS NOT NULL THEN
    INSERT INTO public.publish_jobs (
      workspace_id,
      content_type,
      content_id,
      state,
      run_at,
      retry_count,
      last_error
    )
    VALUES (
      NEW.workspace_id,
      'story',
      NEW.id,
      'queued',
      NEW.scheduled_at,
      0,
      NULL
    )
    ON CONFLICT (content_type, content_id) DO UPDATE
      SET workspace_id = EXCLUDED.workspace_id,
          state = 'queued',
          run_at = EXCLUDED.run_at,
          retry_count = 0,
          last_error = NULL;

  ELSIF NEW.status IN ('published', 'failed') THEN
    RETURN NEW;

  ELSE
    DELETE FROM public.publish_jobs
    WHERE content_type = 'story'
      AND content_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

