-- Remove UPDATE and DELETE policies from posts table
DROP POLICY IF EXISTS "Users can delete own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can update own posts" ON public.posts;

-- Remove UPDATE and DELETE policies from stories table
DROP POLICY IF EXISTS "Users can delete own stories" ON public.stories;
DROP POLICY IF EXISTS "Users can update own stories" ON public.stories;