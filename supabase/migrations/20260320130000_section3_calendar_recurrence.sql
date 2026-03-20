-- Section 3: Recurring schedules for scheduled content
BEGIN;

-- Posts recurrence metadata
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS recurrence_frequency text NOT NULL DEFAULT 'none'
  CHECK (recurrence_frequency IN ('none', 'weekly', 'monthly'));

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS recurrence_until timestamptz;

-- Stories recurrence metadata
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS recurrence_frequency text NOT NULL DEFAULT 'none'
  CHECK (recurrence_frequency IN ('none', 'weekly', 'monthly'));

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS recurrence_until timestamptz;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS posts_recurrence_frequency_idx ON public.posts(recurrence_frequency);
CREATE INDEX IF NOT EXISTS posts_recurrence_until_idx ON public.posts(recurrence_until);
CREATE INDEX IF NOT EXISTS stories_recurrence_frequency_idx ON public.stories(recurrence_frequency);
CREATE INDEX IF NOT EXISTS stories_recurrence_until_idx ON public.stories(recurrence_until);

COMMIT;

