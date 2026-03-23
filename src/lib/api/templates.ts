import { supabase } from "@/integrations/supabase/client";

export type TemplateKind = "post" | "story";
export type TemplateSort = "updated_desc" | "name_asc";

export type ContentTemplate = {
  id: string;
  workspace_id: string | null;
  kind: TemplateKind;
  type_of_post: string | null;
  type_of_story: string | null;
  template_name: string;
  overrides: Record<string, any>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ListTemplatesParams = {
  workspaceId: string;
  kind?: TemplateKind;
  includeGlobal?: boolean;
  search?: string;
  subtype?: string;
  sort?: TemplateSort;
  page?: number;
  pageSize?: number;
};

type SaveTemplatePayload = {
  workspaceId: string;
  kind: TemplateKind;
  template_name: string;
  type_of_post?: string | null;
  type_of_story?: string | null;
  overrides: Record<string, any>;
  category?: string | null;
  visibility?: "workspace" | "team" | "public";
  owner_type?: "user" | "team";
  team_id?: string | null;
};

function withFutureMeta(payload: SaveTemplatePayload): Record<string, any> {
  const baseOverrides = payload.overrides || {};
  const meta = {
    category: payload.category || null,
    visibility: payload.visibility || "workspace",
    owner_type: payload.owner_type || "user",
    team_id: payload.team_id || null,
  };

  return {
    ...baseOverrides,
    _meta: {
      ...(baseOverrides._meta || {}),
      ...meta,
    },
  };
}

export async function listTemplates({
  workspaceId,
  kind,
  includeGlobal = true,
  search = "",
  subtype = "all",
  sort = "updated_desc",
  page = 0,
  pageSize = 24,
}: ListTemplatesParams): Promise<{ items: ContentTemplate[]; total: number }> {
  let query = (supabase as any)
    .from("content_templates" as any)
    .select("*", { count: "exact" });

  if (kind) {
    query = query.eq("kind", kind);
  }

  if (includeGlobal) {
    query = query.or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`);
  } else {
    query = query.eq("workspace_id", workspaceId);
  }

  const trimmedSearch = search.trim();
  if (trimmedSearch) {
    query = query.ilike("template_name", `%${trimmedSearch}%`);
  }

  if (subtype !== "all") {
    if (kind === "post") {
      query = query.eq("type_of_post", subtype);
    } else if (kind === "story") {
      query = query.eq("type_of_story", subtype);
    }
  }

  if (sort === "name_asc") {
    query = query.order("template_name", { ascending: true });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) throw error;
  return { items: (data || []) as ContentTemplate[], total: count || 0 };
}

export async function createTemplate(payload: SaveTemplatePayload): Promise<ContentTemplate> {
  const { data, error } = await (supabase as any)
    .from("content_templates" as any)
    .insert({
      workspace_id: payload.workspaceId,
      kind: payload.kind,
      template_name: payload.template_name,
      type_of_post: payload.kind === "post" ? payload.type_of_post || null : null,
      type_of_story: payload.kind === "story" ? payload.type_of_story || null : null,
      overrides: withFutureMeta(payload),
      created_by: (await supabase.auth.getUser()).data.user?.id || null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as ContentTemplate;
}

export async function updateTemplate(
  templateId: string,
  payload: SaveTemplatePayload
): Promise<ContentTemplate> {
  const { data, error } = await (supabase as any)
    .from("content_templates" as any)
    .update({
      kind: payload.kind,
      template_name: payload.template_name,
      type_of_post: payload.kind === "post" ? payload.type_of_post || null : null,
      type_of_story: payload.kind === "story" ? payload.type_of_story || null : null,
      overrides: withFutureMeta(payload),
    })
    .eq("id", templateId)
    .eq("workspace_id", payload.workspaceId)
    .select("*")
    .single();

  if (error) throw error;
  return data as ContentTemplate;
}

export async function deleteTemplate(templateId: string, workspaceId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("content_templates" as any)
    .delete()
    .eq("id", templateId)
    .eq("workspace_id", workspaceId);

  if (error) throw error;
}

export async function duplicateTemplate(
  template: ContentTemplate,
  workspaceId: string
): Promise<ContentTemplate> {
  const { data, error } = await (supabase as any)
    .from("content_templates" as any)
    .insert({
      workspace_id: workspaceId,
      kind: template.kind,
      type_of_post: template.type_of_post,
      type_of_story: template.type_of_story,
      template_name: `Copy of ${template.template_name}`,
      overrides: template.overrides || {},
      created_by: (await supabase.auth.getUser()).data.user?.id || null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as ContentTemplate;
}
