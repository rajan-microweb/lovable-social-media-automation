import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useTemplateMutations, useTemplates } from "@/hooks/useTemplates";
import type { ContentTemplate, TemplateKind, TemplateSort } from "@/lib/api/templates";
import { Copy, Edit, MoreVertical, Plus, Search, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const postTypes = ["onlyText", "image", "carousel", "video", "shorts", "article", "pdf"];
const storyTypes = ["image", "video"];
const defaultPostPlatforms = ["facebook", "instagram", "linkedin", "youtube"];
const defaultStoryPlatforms = ["facebook", "instagram"];

const templateSchema = z
  .object({
    template_name: z.string().trim().min(2, "Template name is required."),
    kind: z.enum(["post", "story"]),
    type_of_post: z.string().optional(),
    type_of_story: z.string().optional(),
    overrides: z.record(z.string(), z.any()),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "post" && !value.type_of_post) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Type of post is required.", path: ["type_of_post"] });
    }
    if (value.kind === "story" && !value.type_of_story) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Type of story is required.", path: ["type_of_story"] });
    }
  });

function useDebouncedValue<T>(value: T, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs, value]);
  return debounced;
}

function buildSeedOverrides(kind: TemplateKind) {
  if (kind === "post") {
    return {
      platforms: defaultPostPlatforms,
      postTitle: "",
      postDescription: "",
      textContent: "",
      imageUrl: "",
      videoUrl: "",
      pdfUrl: "",
      carouselImages: [],
      youtubeTitle: "",
      youtubeDescription: "",
      instagramTags: "",
      facebookTags: "",
    };
  }
  return {
    platforms: defaultStoryPlatforms,
    text: "",
    imageUrl: "",
    videoUrl: "",
  };
}

function normalizeOverrides(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, any>;
  } catch {
    return null;
  }
}

export default function Templates() {
  const navigate = useNavigate();
  const { workspaceId } = useAuth();

  const [kindTab, setKindTab] = useState<TemplateKind>("post");
  const [search, setSearch] = useState("");
  const [subtype, setSubtype] = useState("all");
  const [sort, setSort] = useState<TemplateSort>("updated_desc");
  const [page, setPage] = useState(0);
  const [allTemplates, setAllTemplates] = useState<ContentTemplate[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContentTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<ContentTemplate | null>(null);

  const [formName, setFormName] = useState("");
  const [formKind, setFormKind] = useState<TemplateKind>("post");
  const [formPostType, setFormPostType] = useState("");
  const [formStoryType, setFormStoryType] = useState("");
  const [platformsCsv, setPlatformsCsv] = useState("");
  const [textContent, setTextContent] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [carouselCsv, setCarouselCsv] = useState("");
  const [rawOverrides, setRawOverrides] = useState("{}");
  const [fieldError, setFieldError] = useState("");

  const debouncedSearch = useDebouncedValue(search, 300);
  const pageSize = 16;

  const { data, isLoading, isFetching, refetch } = useTemplates({
    workspaceId: workspaceId || undefined,
    kind: kindTab,
    includeGlobal: true,
    search: debouncedSearch,
    subtype,
    sort,
    page,
    pageSize,
  });

  const { saveTemplate, removeTemplate, cloneTemplate } = useTemplateMutations(workspaceId || undefined);

  useEffect(() => {
    setPage(0);
    setAllTemplates([]);
  }, [kindTab, debouncedSearch, subtype, sort]);

  useEffect(() => {
    if (!data) return;
    setTotalCount(data.total);
    setAllTemplates((prev) => {
      const merged = page === 0 ? data.items : [...prev, ...data.items];
      const deduped = new Map<string, ContentTemplate>();
      for (const item of merged) {
        deduped.set(item.id, item);
      }
      return Array.from(deduped.values());
    });
  }, [data, page]);

  const hasMore = allTemplates.length < totalCount;
  const stats = useMemo(
    () => ({
      total: totalCount,
      workspaceOnly: allTemplates.filter((t) => t.workspace_id).length,
      global: allTemplates.filter((t) => !t.workspace_id).length,
    }),
    [allTemplates, totalCount]
  );

  const resetForm = (nextKind: TemplateKind = kindTab) => {
    setEditingTemplate(null);
    setFormName("");
    setFormKind(nextKind);
    setFormPostType(nextKind === "post" ? "onlyText" : "");
    setFormStoryType(nextKind === "story" ? "image" : "");
    setPlatformsCsv((nextKind === "post" ? defaultPostPlatforms : defaultStoryPlatforms).join(", "));
    setTextContent("");
    setTitle("");
    setDescription("");
    setImageUrl("");
    setVideoUrl("");
    setPdfUrl("");
    setCarouselCsv("");
    setRawOverrides(JSON.stringify(buildSeedOverrides(nextKind), null, 2));
    setFieldError("");
  };

  const openCreateModal = () => {
    resetForm(kindTab);
    setIsEditorOpen(true);
  };

  const openEditModal = (template: ContentTemplate) => {
    setEditingTemplate(template);
    setFormName(template.template_name);
    setFormKind(template.kind);
    setFormPostType(template.type_of_post || "");
    setFormStoryType(template.type_of_story || "");
    const overrides = template.overrides || {};
    setPlatformsCsv(Array.isArray(overrides.platforms) ? overrides.platforms.join(", ") : "");
    setTextContent(String(overrides.textContent ?? overrides.text ?? ""));
    setTitle(String(overrides.postTitle ?? ""));
    setDescription(String(overrides.postDescription ?? ""));
    setImageUrl(String(overrides.imageUrl ?? overrides.image_url ?? ""));
    setVideoUrl(String(overrides.videoUrl ?? overrides.video_url ?? ""));
    setPdfUrl(String(overrides.pdfUrl ?? ""));
    const carousel = Array.isArray(overrides.carouselImages)
      ? overrides.carouselImages
      : Array.isArray(overrides.carousel_images)
        ? overrides.carousel_images
        : [];
    setCarouselCsv(carousel.join(", "));
    setRawOverrides(JSON.stringify(overrides || {}, null, 2));
    setFieldError("");
    setIsEditorOpen(true);
  };

  const previewOverrides = useMemo(() => {
    const fromRaw = normalizeOverrides(rawOverrides);
    if (fromRaw !== null) return fromRaw;
    const fromFields = {
      platforms: platformsCsv
        .split(",")
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean),
      textContent,
      text: textContent,
      postTitle: title,
      postDescription: description,
      imageUrl,
      videoUrl,
      pdfUrl,
      carouselImages: carouselCsv
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean),
    };
    return fromFields;
  }, [carouselCsv, description, imageUrl, pdfUrl, platformsCsv, rawOverrides, textContent, title, videoUrl]);

  const handleSave = async () => {
    setFieldError("");
    const parsedOverrides = normalizeOverrides(rawOverrides);
    if (parsedOverrides === null) {
      setFieldError("Overrides JSON is invalid. Fix formatting before saving.");
      return;
    }

    const parsed = templateSchema.safeParse({
      template_name: formName,
      kind: formKind,
      type_of_post: formKind === "post" ? formPostType : undefined,
      type_of_story: formKind === "story" ? formStoryType : undefined,
      overrides: parsedOverrides,
    });
    if (!parsed.success) {
      setFieldError(parsed.error.errors[0]?.message || "Validation failed.");
      return;
    }

    if (!workspaceId) {
      toast.error("Workspace not ready.");
      return;
    }

    try {
      await saveTemplate.mutateAsync({
        id: editingTemplate?.id,
        workspaceId,
        kind: parsed.data.kind,
        template_name: parsed.data.template_name,
        type_of_post: parsed.data.type_of_post || null,
        type_of_story: parsed.data.type_of_story || null,
        overrides: parsed.data.overrides,
      });
      toast.success(editingTemplate ? "Template updated" : "Template created");
      setIsEditorOpen(false);
      setEditingTemplate(null);
      setPage(0);
      setAllTemplates([]);
      await refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save template");
    }
  };

  const handleDuplicate = async (template: ContentTemplate) => {
    try {
      await cloneTemplate.mutateAsync({ template });
      toast.success("Template duplicated");
    } catch (error: any) {
      toast.error(error?.message || "Failed to duplicate template");
    }
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;
    try {
      await removeTemplate.mutateAsync({ id: templateToDelete.id });
      toast.success("Template deleted");
      setTemplateToDelete(null);
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete template");
    }
  };

  const subtypeOptions = kindTab === "post" ? postTypes : storyTypes;
  const renderType = (template: ContentTemplate) => template.type_of_post || template.type_of_story || "-";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Templates</h1>
            <p className="text-muted-foreground">Create and manage reusable structures for faster post and story creation.</p>
          </div>
          <Button onClick={openCreateModal}>
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Total Templates</p>
              <p className="text-2xl font-semibold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Workspace Templates</p>
              <p className="text-2xl font-semibold">{stats.workspaceOnly}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Global Templates</p>
              <p className="text-2xl font-semibold">{stats.global}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={kindTab} onValueChange={(v) => setKindTab(v as TemplateKind)}>
          <TabsList>
            <TabsTrigger value="post">Post Templates</TabsTrigger>
            <TabsTrigger value="story">Story Templates</TabsTrigger>
          </TabsList>

          <TabsContent value={kindTab}>
            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="relative md:col-span-2">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                      placeholder="Search templates..."
                    />
                  </div>
                  <Select value={subtype} onValueChange={setSubtype}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by subtype" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All subtypes</SelectItem>
                      {subtypeOptions.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sort} onValueChange={(v) => setSort(v as TemplateSort)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="updated_desc">Last updated</SelectItem>
                      <SelectItem value="name_asc">Name A-Z</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {isLoading && page === 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
                {[0, 1, 2].map((index) => (
                  <Card key={index}>
                    <CardContent className="pt-6">
                      <div className="h-28 animate-pulse rounded bg-muted" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : allTemplates.length === 0 ? (
              <Card className="mt-4">
                <CardContent className="pt-6 text-center">
                  <p className="text-sm text-muted-foreground">No templates found. Create your first template to speed up publishing.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mt-4">
                {allTemplates.map((template) => {
                  const overrides = template.overrides || {};
                  const previewText = String(overrides.textContent ?? overrides.text ?? "").trim();
                  const previewImage = String(overrides.imageUrl ?? overrides.image_url ?? "");
                  return (
                    <Card key={template.id} className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                      <CardHeader className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="truncate text-base">{template.template_name}</CardTitle>
                            <p className="text-xs text-muted-foreground mt-1">{new Date(template.updated_at).toLocaleString()}</p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditModal(template)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(template)}>
                                <Copy className="mr-2 h-4 w-4" />
                                Duplicate
                              </DropdownMenuItem>
                              {template.workspace_id ? (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setTemplateToDelete(template)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem disabled>Global template (read-only)</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{template.kind}</Badge>
                          <Badge variant="outline">{renderType(template)}</Badge>
                          <Badge variant={template.workspace_id ? "default" : "outline"}>
                            {template.workspace_id ? "workspace" : "global"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="rounded-lg border bg-muted/40 p-3 min-h-28">
                          {previewImage ? (
                            <img
                              src={previewImage}
                              alt={`${template.template_name} preview`}
                              loading="lazy"
                              className="h-20 w-full rounded object-cover"
                            />
                          ) : previewText ? (
                            <p className="line-clamp-4 text-sm text-muted-foreground">{previewText}</p>
                          ) : (
                            <p className="text-sm text-muted-foreground">No preview content available.</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() =>
                              navigate(template.kind === "post" ? "/posts/create" : "/stories/create", {
                                state: { templateIdToApply: template.id },
                              })
                            }
                          >
                            Use template
                          </Button>
                          <Button variant="outline" onClick={() => openEditModal(template)}>
                            Edit
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex justify-center">
              {hasMore ? (
                <Button variant="outline" disabled={isFetching} onClick={() => setPage((prev) => prev + 1)}>
                  {isFetching ? "Loading..." : "Load More"}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">All templates loaded.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
            <DialogDescription>Build reusable structures and preview before saving.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. LinkedIn launch post" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Template Type</Label>
                  <Select
                    value={formKind}
                    onValueChange={(v) => {
                      const next = v as TemplateKind;
                      setFormKind(next);
                      setFormPostType(next === "post" ? "onlyText" : "");
                      setFormStoryType(next === "story" ? "image" : "");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="post">Post</SelectItem>
                      <SelectItem value="story">Story</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subtype</Label>
                  {formKind === "post" ? (
                    <Select value={formPostType} onValueChange={setFormPostType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {postTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={formStoryType} onValueChange={setFormStoryType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {storyTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Platforms (comma separated)</Label>
                <Input
                  value={platformsCsv}
                  onChange={(e) => setPlatformsCsv(e.target.value)}
                  placeholder="facebook, instagram, linkedin"
                />
              </div>
              <div className="space-y-2">
                <Label>Primary Text</Label>
                <Textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} rows={4} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Image URL</Label>
                  <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Video URL</Label>
                  <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
                </div>
              </div>
              {formKind === "post" && (
                <>
                  <div className="space-y-2">
                    <Label>PDF URL</Label>
                    <Input value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Carousel Images (comma separated URLs)</Label>
                    <Textarea value={carouselCsv} onChange={(e) => setCarouselCsv(e.target.value)} rows={2} />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label>Overrides JSON</Label>
                <Textarea value={rawOverrides} onChange={(e) => setRawOverrides(e.target.value)} rows={10} className="font-mono text-xs" />
              </div>
              {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Live Preview</p>
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{formKind}</Badge>
                  <Badge variant="outline">{formKind === "post" ? formPostType || "-" : formStoryType || "-"}</Badge>
                </div>
                <p className="text-lg font-semibold">{formName || "Untitled template"}</p>
                {previewOverrides.postTitle ? <p className="font-medium">{String(previewOverrides.postTitle)}</p> : null}
                {previewOverrides.postDescription ? (
                  <p className="text-sm text-muted-foreground">{String(previewOverrides.postDescription)}</p>
                ) : null}
                {previewOverrides.textContent || previewOverrides.text ? (
                  <p className="text-sm">{String(previewOverrides.textContent || previewOverrides.text)}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No text content configured.</p>
                )}
                {previewOverrides.imageUrl ? (
                  <img src={String(previewOverrides.imageUrl)} alt="Preview" loading="lazy" className="max-h-52 w-full rounded object-cover" />
                ) : null}
                {previewOverrides.videoUrl ? (
                  <video src={String(previewOverrides.videoUrl)} controls className="max-h-52 w-full rounded" />
                ) : null}
                {Array.isArray(previewOverrides.carouselImages) && previewOverrides.carouselImages.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {previewOverrides.carouselImages.slice(0, 6).map((url: string, idx: number) => (
                      <img key={`${url}-${idx}`} src={url} alt={`carousel ${idx + 1}`} loading="lazy" className="h-20 w-full rounded object-cover" />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveTemplate.isPending}>
              {saveTemplate.isPending ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(templateToDelete)} onOpenChange={(open) => !open && setTemplateToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The template will be removed from your workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
