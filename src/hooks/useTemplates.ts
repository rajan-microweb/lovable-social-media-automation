import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  listTemplates,
  type ContentTemplate,
  type TemplateKind,
  type TemplateSort,
  updateTemplate,
} from "@/lib/api/templates";

type UseTemplatesParams = {
  orgId?: string;
  kind?: TemplateKind;
  includeGlobal?: boolean;
  search?: string;
  subtype?: string;
  sort?: TemplateSort;
  page?: number;
  pageSize?: number;
};

export function useTemplates(params: UseTemplatesParams) {
  return useQuery({
    queryKey: ["templates", params],
    queryFn: async () => {
      if (!params.orgId) {
        return { items: [], total: 0 };
      }
      return listTemplates({
        orgId: params.orgId,
        kind: params.kind,
        includeGlobal: params.includeGlobal,
        search: params.search,
        subtype: params.subtype,
        sort: params.sort,
        page: params.page,
        pageSize: params.pageSize,
      });
    },
    enabled: Boolean(params.orgId),
    staleTime: 1000 * 60 * 3,
  });
}

type SavePayload = {
  id?: string;
  orgId: string;
  kind: TemplateKind;
  template_name: string;
  type_of_post?: string | null;
  type_of_story?: string | null;
  overrides: Record<string, any>;
};

export function useTemplateMutations(orgId?: string) {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["templates"] });
  };

  const saveTemplate = useMutation({
    mutationFn: async (payload: SavePayload) => {
      if (payload.id) {
        return updateTemplate(payload.id, payload);
      }
      return createTemplate(payload);
    },
    onSuccess: invalidate,
  });

  const removeTemplate = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      if (!orgId) throw new Error("Workspace not available.");
      return deleteTemplate(id, orgId);
    },
    onSuccess: invalidate,
  });

  const cloneTemplate = useMutation({
    mutationFn: async ({ template }: { template: ContentTemplate }) => {
      if (!orgId) throw new Error("Workspace not available.");
      return duplicateTemplate(template, orgId);
    },
    onSuccess: invalidate,
  });

  return { saveTemplate, removeTemplate, cloneTemplate };
}
