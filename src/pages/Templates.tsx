import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AiPromptModal } from "@/components/AiPromptModal";
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
import { usePlatformAccounts } from "@/hooks/usePlatformAccounts";
import { PlatformAccountSelector } from "@/components/posts/PlatformAccountSelector";
import type { ContentTemplate, TemplateKind, TemplateSort } from "@/lib/api/templates";
import { Copy, Edit, MoreVertical, Plus, Search, Trash2, Facebook, Instagram, Linkedin, Youtube, Twitter, Sparkles, Loader2, LayoutGrid, List as ListIcon, Edit2, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const postTypes = ["onlyText", "image", "carousel", "video", "shorts", "article", "pdf"];
const storyTypes = ["image", "video"];
const defaultPostPlatforms = ["facebook", "instagram", "linkedin", "youtube"];
const defaultStoryPlatforms = ["facebook", "instagram"];

const PLATFORM_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  facebook: { icon: Facebook, color: "text-[#1877F3]", label: "Facebook" },
  instagram: { icon: Instagram, color: "text-[#E4405F]", label: "Instagram" },
  linkedin: { icon: Linkedin, color: "text-[#0A66C2]", label: "LinkedIn" },
  // youtube: { icon: Youtube, color: "text-[#FF0000]", label: "YouTube" },
  // twitter: { icon: Twitter, color: "text-[#1DA1F2]", label: "X/Twitter" },
};

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
  const { user, workspaceId } = useAuth();

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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [formName, setFormName] = useState("");
  const [formKind, setFormKind] = useState<TemplateKind>("post");
  const [formPostType, setFormPostType] = useState("");
  const [formStoryType, setFormStoryType] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [textContent, setTextContent] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [articleDescription, setArticleDescription] = useState("");
  const [articleUrl, setArticleUrl] = useState("");
  const [articleThumbnailUrl, setArticleThumbnailUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [carouselCsv, setCarouselCsv] = useState("");
  const [rawOverrides, setRawOverrides] = useState("{}");
  const [fieldError, setFieldError] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Platform accounts hook
  const { accounts: platformAccounts, loading: loadingPlatformAccounts } = usePlatformAccounts(user?.id, platforms);

  // Platform connection state
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [showConnectionAlert, setShowConnectionAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertPlatform, setAlertPlatform] = useState("");

  // AI Modal state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalField, setAiModalField] = useState<"text" | "image" | "video" | "pdf">("text");
  const [aiModalTarget, setAiModalTarget] = useState<string>("");
  const [openaiConnected, setOpenaiConnected] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);
  const pageSize = 16;

  // Fetch connected platforms to check for OpenAI
  useEffect(() => {
    const fetchConnectedPlatforms = async () => {
      if (!user) return;

      const { data } = await supabase
        .from("platform_integrations")
        .select("platform_name")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (data) {
        const platformNames = data.map((p) => p.platform_name);
        setConnectedPlatforms(platformNames);
        setOpenaiConnected(platformNames.some((p) => p.toLowerCase() === "openai"));
      }
    };
    void fetchConnectedPlatforms();
  }, [user]);

  // Handle platform changes with connection alert
  const handlePlatformChange = (platform: string, checked: boolean) => {
    const isConnected = connectedPlatforms.some((p) => p.toLowerCase() === platform.toLowerCase());

    if (checked && !isConnected) {
      setAlertMessage(`Please connect your ${platform} account first to select this platform.`);
      setAlertPlatform(platform);
      setShowConnectionAlert(true);
      return;
    }

    if (checked) {
      setPlatforms([...platforms, platform.toLowerCase()]);
    } else {
      setPlatforms(platforms.filter((p) => p !== platform.toLowerCase()));
    }
  };

  const handleAccountToggle = (accountId: string) => {
    if (selectedAccountIds.includes(accountId)) {
      setSelectedAccountIds(selectedAccountIds.filter((id) => id !== accountId));
    } else {
      setSelectedAccountIds([...selectedAccountIds, accountId]);
    }
  };

  /* 
  // Temporarily disabled auto-reset to avoid losing data during mount/load
  useEffect(() => {
    if (loadingPlatformAccounts) return;
    const validAccountIds = selectedAccountIds.filter((id) => platformAccounts.some((account) => account.id === id));
    if (validAccountIds.length !== selectedAccountIds.length) {
      setSelectedAccountIds(validAccountIds);
    }
  }, [platforms, platformAccounts, loadingPlatformAccounts]);
  */

  // Sync fields to rawOverrides whenever they change
  useEffect(() => {
    const current = normalizeOverrides(rawOverrides) || {};
    const next = {
      ...current,
      platforms,
      selectedAccountIds,
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

    // Avoid infinite loop by comparing if content actually changed
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      setRawOverrides(JSON.stringify(next, null, 2));
    }
  }, [platforms, selectedAccountIds, textContent, title, description, articleTitle, articleDescription, articleUrl, articleThumbnailUrl, imageUrl, videoUrl, pdfUrl, carouselCsv]);

  const { data, isLoading, isFetching, refetch } = useTemplates({
    workspaceId: workspaceId || undefined,
    kind: kindTab,
    includeGlobal: false,
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
    setAllTemplates(data.items);
  }, [data, page]);

  const totalPages = Math.ceil(totalCount / pageSize);

  const hasMore = allTemplates.length < totalCount;
  const stats = useMemo(
    () => ({
      total: totalCount,
      workspaceOnly: allTemplates.filter((t) => t.workspace_id).length,
    }),
    [allTemplates, totalCount]
  );

  const resetForm = (nextKind: TemplateKind = kindTab) => {
    setEditingTemplate(null);
    setFormName("");
    setFormKind(nextKind);
    setFormPostType(nextKind === "post" ? "onlyText" : "");
    setFormStoryType(nextKind === "story" ? "image" : "");
    setPlatforms(nextKind === "post" ? defaultPostPlatforms : defaultStoryPlatforms);
    setSelectedAccountIds([]);
    setTextContent("");
    setTitle("");
    setDescription("");
    setArticleTitle("");
    setArticleDescription("");
    setArticleUrl("");
    setArticleThumbnailUrl("");
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
    setPlatforms(Array.isArray(overrides.platforms) ? overrides.platforms : []);
    setSelectedAccountIds(Array.isArray(overrides.selectedAccountIds) ? overrides.selectedAccountIds : []);
    setTextContent(String(overrides.textContent ?? overrides.text ?? ""));
    setTitle(String(overrides.postTitle ?? ""));
    setDescription(String(overrides.postDescription ?? ""));
    setArticleTitle(String(overrides.articleTitle ?? ""));
    setArticleDescription(String(overrides.articleDescription ?? ""));
    setArticleUrl(String(overrides.articleUrl ?? ""));
    setArticleThumbnailUrl(String(overrides.articleThumbnailUrl ?? ""));
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
      platforms: platforms,
      selectedAccountIds: selectedAccountIds,
      textContent,
      text: textContent,
      postTitle: title,
      postDescription: description,
      articleTitle,
      articleDescription,
      articleUrl,
      articleThumbnailUrl,
      imageUrl,
      videoUrl,
      pdfUrl,
      carouselImages: carouselCsv
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean),
    };
    return fromFields;
  }, [carouselCsv, description, imageUrl, pdfUrl, platforms, selectedAccountIds, rawOverrides, textContent, title, videoUrl, articleTitle, articleDescription, articleUrl, articleThumbnailUrl]);

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

  const uploadFile = async (file: File, folder: string): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const filePath = `${user?.id}/templates/${fileName}`;

    const { error: uploadError } = await supabase.storage.from("post-media").upload(filePath, file);
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from("post-media").getPublicUrl(filePath);
    return publicUrl;
  };

  const handleMediaFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const url = await uploadFile(file, "templates");
      if (formPostType === "pdf") setPdfUrl(url);
      else if (formPostType === "video" || formPostType === "shorts" || formStoryType === "video") setVideoUrl(url);
      else if (formPostType === "article") setArticleThumbnailUrl(url);
      else setImageUrl(url);
      toast.success("File uploaded and linked to template");
    } catch (err) {
      toast.error("Failed to upload file");
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const openAiModal = (field: "text" | "image" | "video" | "pdf", target: string) => {
    if (!openaiConnected) {
      toast.error("Please connect OpenAI in Accounts page first.");
      return;
    }
    setAiModalField(field);
    setAiModalTarget(target);
    setAiModalOpen(true);
  };

  const handleAiGenerate = async (content: string) => {
    if (aiModalTarget === "textContent") {
      setTextContent(content);
    } else if (aiModalTarget === "postTitle") {
      setTitle(content);
    } else if (aiModalTarget === "postDescription") {
      setDescription(content);
    } else if (aiModalTarget === "articleTitle") {
      setArticleTitle(content);
    } else if (aiModalTarget === "articleDescription") {
      setArticleDescription(content);
    } else if (aiModalTarget === "media") {
      if (formPostType === "image" || formStoryType === "image") setImageUrl(content);
      else if (formPostType === "video" || formPostType === "shorts" || formStoryType === "video") setVideoUrl(content);
      else if (formPostType === "pdf") setPdfUrl(content);
      else if (formPostType === "article") setArticleThumbnailUrl(content);
      toast.success("AI-generated content applied");
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
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-muted/40 p-1 rounded-xl border border-border/50 mr-2">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                className={`h-8 w-8 rounded-lg transition-all ${viewMode === "grid" ? "shadow-sm bg-background" : "opacity-40"}`}
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                className={`h-8 w-8 rounded-lg transition-all ${viewMode === "list" ? "shadow-sm bg-background" : "opacity-40"}`}
                onClick={() => setViewMode("list")}
              >
                <ListIcon className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={openCreateModal}>
              <Plus className="mr-2 h-4 w-4" />
              Create Template
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Total Templates</p>
              <p className="text-2xl font-semibold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Active Templates</p>
              <p className="text-2xl font-semibold">{stats.workspaceOnly}</p>
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
            ) : viewMode === "list" ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-border/40 bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border/40 bg-muted/5">
                        <th className="font-semibold h-10 px-4 text-[10px] uppercase tracking-widest text-muted-foreground/40">Template Name</th>
                        <th className="font-semibold h-10 px-4 text-[10px] uppercase tracking-widest text-muted-foreground/40 text-center">Subtype</th>
                        <th className="font-semibold h-10 px-4 text-[10px] uppercase tracking-widest text-muted-foreground/40 text-center">Platforms</th>
                        <th className="font-semibold h-10 px-4 text-[10px] uppercase tracking-widest text-muted-foreground/40 text-right">Last Updated</th>
                        <th className="font-semibold h-10 px-4 text-[10px] uppercase tracking-widest text-muted-foreground/40 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {allTemplates.map((template) => {
                        const overrides = template.overrides || {};
                        const platformsArr = Array.isArray(overrides.platforms) ? overrides.platforms : [];
                        
                        return (
                          <tr key={template.id} className="group hover:bg-muted/5 transition-colors">
                            <td className="py-4 px-4">
                              <div className="flex flex-col">
                                <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                                  {template.template_name}
                                </span>
                                <span className="text-[10px] text-muted-foreground opacity-60">ID: {template.id.slice(-8)}</span>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-center">
                               <Badge variant="secondary" className="text-[10px] h-5 font-bold uppercase px-2 bg-muted/50 border-transparent">
                                 {renderType(template)}
                               </Badge>
                            </td>
                            <td className="py-4 px-4">
                               <div className="flex items-center justify-center gap-1">
                                  {platformsArr.map((p: string) => {
                                    const cfg = PLATFORM_CONFIG[p];
                                    if (!cfg) return null;
                                    const Icon = cfg.icon;
                                    return <Icon key={p} className={`h-3 w-3 ${cfg.color}`} />;
                                  })}
                               </div>
                            </td>
                            <td className="py-4 px-4 text-right">
                               <span className="font-medium text-xs text-muted-foreground">
                                 {new Date(template.updated_at).toLocaleDateString()}
                               </span>
                            </td>
                            <td className="py-4 px-4 text-right">
                               <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditModal(template)}>
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-8 w-8 text-primary" 
                                    onClick={() => navigate(template.kind === "post" ? "/posts/create" : "/stories/create", { state: { templateIdToApply: template.id } })}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreVertical className="h-3.5 w-3.5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleDuplicate(template)}>
                                        <Copy className="mr-2 h-4 w-4" /> Duplicate
                                      </DropdownMenuItem>
                                      <DropdownMenuItem className="text-destructive font-bold" onClick={() => setTemplateToDelete(template)}>
                                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                               </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
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
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setTemplateToDelete(template)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{template.kind}</Badge>
                          <Badge variant="outline">{renderType(template)}</Badge>
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

            {/* Pagination UI */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-8 border-t border-border/10 pt-6">
                <p className="text-xs text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{page * pageSize + 1}</span> to <span className="font-semibold text-foreground">{Math.min((page + 1) * pageSize, totalCount)}</span> of <span className="font-semibold text-foreground">{totalCount}</span> results
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => setPage(prev => Math.max(0, prev - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum = i;
                      if (totalPages > 5 && page > 2) {
                         pageNum = page - 2 + i;
                         if (pageNum + 2 > totalPages) pageNum = totalPages - 5 + i;
                      }
                      if (pageNum < 0) pageNum = i;
                      if (pageNum >= totalPages) return null;
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={page === pageNum ? "secondary" : "ghost"}
                          size="sm"
                          className={`h-8 w-8 rounded-lg font-bold text-xs ${page === pageNum ? 'bg-primary/10 text-primary hover:bg-primary/20' : ''}`}
                          onClick={() => setPage(pageNum)}
                        >
                          {pageNum + 1}
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => setPage(prev => Math.min(totalPages - 1, prev + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

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

              <div className="space-y-4">
                <Label>Platforms</Label>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(PLATFORM_CONFIG).map(([id, cfg]) => {
                    const isSelected = platforms.includes(id);
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handlePlatformChange(id, !isSelected)}
                        className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all hover:bg-muted/50 w-24 ${
                          isSelected ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary" : "border-border/50 opacity-60 grayscale-[0.5]"
                        }`}
                      >
                        <div className={`p-1 ${isSelected ? cfg.color : ""}`}>
                          <Icon className="h-6 w-6" />
                        </div>
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
                          {cfg.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Account selectors */}
                {platforms.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <Label className="text-xs text-muted-foreground">Select Connected Accounts</Label>
                    <div className="space-y-2">
                      {platforms.map((platform) => (
                        <PlatformAccountSelector
                          key={platform}
                          accounts={platformAccounts}
                          selectedAccountIds={selectedAccountIds}
                          onAccountToggle={handleAccountToggle}
                          loading={loadingPlatformAccounts}
                          platform={platform}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {formKind === "post" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Post Title</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => openAiModal("text", "postTitle")} className="h-7 text-xs gap-1">
                        <Sparkles className="h-3 w-3" /> AI
                      </Button>
                    </div>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title of the post..." />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Post Description</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => openAiModal("text", "postDescription")} className="h-7 text-xs gap-1">
                        <Sparkles className="h-3 w-3" /> AI
                      </Button>
                    </div>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Subtitle or extra details..." />
                  </div>
                </div>
              )}

              {/* Conditional Fields based on Type */}
              {formKind === "post" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Text Content</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={() => openAiModal("text", "textContent")} className="h-7 text-xs gap-1">
                      <Sparkles className="h-3 w-3" /> AI Generate
                    </Button>
                  </div>
                  <Textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} rows={4} placeholder="Write your post content..." />
                </div>
              )}

              {formKind === "post" && formPostType === "article" && (
                <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
                  <p className="text-sm font-semibold">Article Details</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Article Title</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => openAiModal("text", "articleTitle")} className="h-7 text-xs gap-1">
                          <Sparkles className="h-3 w-3" /> AI
                        </Button>
                      </div>
                      <Input value={articleTitle} onChange={(e) => setArticleTitle(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Article Description</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => openAiModal("text", "articleDescription")} className="h-7 text-xs gap-1">
                          <Sparkles className="h-3 w-3" /> AI
                        </Button>
                      </div>
                      <Input value={articleDescription} onChange={(e) => setArticleDescription(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Article URL</Label>
                    <Input value={articleUrl} onChange={(e) => setArticleUrl(e.target.value)} placeholder="https://..." />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Article Thumbnail</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => openAiModal("image", "articleThumbnail")} className="h-7 text-xs gap-1">
                        <Sparkles className="h-3 w-3" /> AI
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Input value={articleThumbnailUrl} onChange={(e) => setArticleThumbnailUrl(e.target.value)} placeholder="Image URL..." className="flex-1" />
                      <div className="relative">
                        <Button variant="outline" size="sm" asChild className="h-10">
                          <label className="cursor-pointer">
                            {uploading ? <Loader2 className="animate-spin h-4 w-4" /> : "Upload"}
                            <input type="file" className="hidden" accept="image/*" onChange={handleMediaFileChange} disabled={uploading} />
                          </label>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {(formPostType === "image" || formStoryType === "image") && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Image</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => openAiModal("image", "media")} className="h-7 text-xs gap-1">
                        <Sparkles className="h-3 w-3" /> AI
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Image URL..." className="flex-1" />
                      <div className="relative">
                        <Button variant="outline" size="sm" asChild className="h-10">
                          <label className="cursor-pointer">
                            {uploading ? <Loader2 className="animate-spin h-4 w-4" /> : "Upload"}
                            <input type="file" className="hidden" accept="image/*" onChange={handleMediaFileChange} disabled={uploading} />
                          </label>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                {(["video", "shorts"].includes(formPostType) || formStoryType === "video") && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Video</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => openAiModal("video", "media")} className="h-7 text-xs gap-1">
                        <Sparkles className="h-3 w-3" /> AI
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="Video URL..." className="flex-1" />
                      <div className="relative">
                        <Button variant="outline" size="sm" asChild className="h-10">
                          <label className="cursor-pointer">
                            {uploading ? <Loader2 className="animate-spin h-4 w-4" /> : "Upload"}
                            <input type="file" className="hidden" accept="video/*" onChange={handleMediaFileChange} disabled={uploading} />
                          </label>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {formKind === "post" && (
                <>
                  {formPostType === "pdf" && (
                    <div className="space-y-2">
                      <Label>PDF</Label>
                      <div className="flex gap-2">
                        <Input value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} placeholder="PDF URL..." className="flex-1" />
                        <div className="relative">
                          <Button variant="outline" size="sm" asChild className="h-10">
                            <label className="cursor-pointer">
                              {uploading ? <Loader2 className="animate-spin h-4 w-4" /> : "Upload"}
                              <input type="file" className="hidden" accept=".pdf" onChange={handleMediaFileChange} disabled={uploading} />
                            </label>
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                  {formPostType === "carousel" && (
                    <div className="space-y-2">
                      <Label>Carousel Images (comma separated URLs)</Label>
                      <Textarea value={carouselCsv} onChange={(e) => setCarouselCsv(e.target.value)} rows={2} />
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label>Overrides JSON (Advanced)</Label>
                <Textarea value={rawOverrides} onChange={(e) => setRawOverrides(e.target.value)} rows={6} className="font-mono text-xs opacity-80" />
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
                {formKind === "post" && (
                  previewOverrides.textContent || previewOverrides.text ? (
                    <p className="text-sm">{String(previewOverrides.textContent || previewOverrides.text)}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No text content configured.</p>
                  )
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
            <Button onClick={handleSave} disabled={saveTemplate.isPending || uploading}>
              {saveTemplate.isPending ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConnectionAlert} onOpenChange={setShowConnectionAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Platform Not Connected</AlertDialogTitle>
            <AlertDialogDescription>{alertMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => navigate("/accounts")}>Go to Accounts</AlertDialogAction>
            <AlertDialogAction onClick={() => setShowConnectionAlert(false)}>Cancel</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AiPromptModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onGenerate={handleAiGenerate}
        fieldType={aiModalField}
        context={{
          userId: user?.id,
          platforms: platforms,
          typeOfPost: formKind === "post" ? formPostType : formStoryType,
          existingImageUrl: imageUrl,
          existingVideoUrl: videoUrl,
          existingTextContent: textContent,
        }}
      />

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
