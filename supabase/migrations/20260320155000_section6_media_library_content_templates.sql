-- Publer-like Section 6: Media Library + Content Templates
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared trigger helper used across multiple tables.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------
-- 1) Media assets metadata (tags)
-- -----------------------------
CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_url text NOT NULL,
  content_type text NOT NULL, -- image | video | pdf
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, file_path)
);

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- Workspace-scoped access
DROP POLICY IF EXISTS "Workspace users can view media_assets" ON public.media_assets;
CREATE POLICY "Workspace users can view media_assets"
  ON public.media_assets
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = media_assets.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace users can insert media_assets" ON public.media_assets;
CREATE POLICY "Workspace users can insert media_assets"
  ON public.media_assets
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = media_assets.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace users can update media_assets" ON public.media_assets;
CREATE POLICY "Workspace users can update media_assets"
  ON public.media_assets
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = media_assets.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = media_assets.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace users can delete media_assets" ON public.media_assets;
CREATE POLICY "Workspace users can delete media_assets"
  ON public.media_assets
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = media_assets.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS set_media_assets_updated_at ON public.media_assets;
CREATE TRIGGER set_media_assets_updated_at
BEFORE UPDATE ON public.media_assets
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------
-- 2) Content templates
-- -----------------------------
CREATE TABLE IF NOT EXISTS public.content_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('post', 'story')),
  type_of_post text NULL,
  type_of_story text NULL,
  template_name text NOT NULL,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.content_templates ENABLE ROW LEVEL SECURITY;

-- Global templates (workspace_id IS NULL) are readable by any workspace member
DROP POLICY IF EXISTS "Workspace users can view content_templates" ON public.content_templates;
CREATE POLICY "Workspace users can view content_templates"
  ON public.content_templates
  FOR SELECT
  USING (
    workspace_id IS NULL
    OR public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = content_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace users can insert content_templates" ON public.content_templates;
CREATE POLICY "Workspace users can insert content_templates"
  ON public.content_templates
  FOR INSERT
  WITH CHECK (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = content_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace users can update content_templates" ON public.content_templates;
CREATE POLICY "Workspace users can update content_templates"
  ON public.content_templates
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = content_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = content_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workspace users can delete content_templates" ON public.content_templates;
CREATE POLICY "Workspace users can delete content_templates"
  ON public.content_templates
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = content_templates.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS set_content_templates_updated_at ON public.content_templates;
CREATE TRIGGER set_content_templates_updated_at
BEFORE UPDATE ON public.content_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------
-- 3) Seed a couple of global templates
-- -----------------------------
-- NOTE: workspace_id = NULL makes them global, readable by all workspace members.
INSERT INTO public.content_templates (kind, type_of_post, type_of_story, template_name, overrides, created_by)
VALUES
  (
    'post',
    'onlyText',
    NULL,
    'LinkedIn text post with CTA',
    '{
      "platforms": ["linkedin"],
      "postTitle": "Quick question for you",
      "postDescription": "Short and actionable",
      "textContent": "What is one small change you can make this week to improve results?\\n\\nIf you want a simple checklist, comment \"CHECKLIST\" and I will share it."
    }',
    NULL
  ),
  (
    'post',
    'video',
    NULL,
    'YouTube caption style (video)',
    '{
      "platforms": ["youtube"],
      "postTitle": "New video: the 3-step workflow",
      "postDescription": "A quick breakdown you can apply today",
      "textContent": "In this video, I’ll show a 3-step workflow that makes content planning easier and more consistent.\\n\\nWant the template? Like + subscribe and I will share the sheet.",
      "youtubeTitle": "The 3-step workflow to plan content faster",
      "youtubeDescription": "In this video: steps, examples, and a simple way to repeat weekly. Comment if you want the template."
    }',
    NULL
  )
ON CONFLICT DO NOTHING;

COMMIT;

