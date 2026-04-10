-- Add url and published_at columns to posts and stories for history tracking
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Add comment explaining the columns
COMMENT ON COLUMN public.posts.url IS 'The live URL of the published post on the social platform';
COMMENT ON COLUMN public.posts.published_at IS 'The timestamp when the post was successfully published';
COMMENT ON COLUMN public.stories.url IS 'The live URL of the published story on the social platform';
COMMENT ON COLUMN public.stories.published_at IS 'The timestamp when the story was successfully published';
