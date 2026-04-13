import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Trash2, ImageIcon, VideoIcon, FileText, Tag as TagIcon, Loader2, Upload, 
  LayoutGrid, List as ListIcon, Search, Filter, Calendar, ArrowUpDown, File, Download, 
  Copy, MoreHorizontal, CheckCircle2, X as CloseIcon, Clock, Eye, ExternalLink,
  ChevronRight, ArrowUp
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

type MediaContentType = "image" | "video" | "pdf";

type MediaAsset = {
  filePath: string;
  fileName: string;
  fileUrl: string;
  contentType: MediaContentType;
  tags: string[];
  size?: number;
  createdAt: string;
};

const STORAGE_BUCKET = "post-media";

const MEDIA_FOLDERS: Array<{ folder: string; contentType: MediaContentType }> = [
  { folder: "images", contentType: "image" },
  { folder: "carousel", contentType: "image" },
  { folder: "ai-images", contentType: "image" },
  { folder: "videos", contentType: "video" },
  { folder: "ai-videos", contentType: "video" },
  { folder: "pdfs", contentType: "pdf" },
];

export default function Library() {
  const { user, workspaceId } = useAuth();

  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [query, setQuery] = useState("");

  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [savingTags, setSavingTags] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<MediaAsset | null>(null);
  
  // UI Preferences
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeTab, setActiveTab] = useState<"all" | MediaContentType>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest");
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);

  const normalizedQuery = query.trim().toLowerCase();

  const processedAssets = useMemo(() => {
    let result = assets;
    
    if (activeTab !== "all") {
      result = result.filter(a => a.contentType === activeTab);
    }
    
    if (normalizedQuery) {
      result = result.filter(a => {
        const fileMatch = a.fileName.toLowerCase().includes(normalizedQuery);
        const tagMatch = a.tags.some(t => t.toLowerCase().includes(normalizedQuery));
        return fileMatch || tagMatch;
      });
    }
    
    return [...result].sort((a, b) => {
      if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === "name") return a.fileName.localeCompare(b.fileName);
      return 0;
    });
  }, [assets, activeTab, normalizedQuery, sortBy]);
    
  const formatSize = (bytes?: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Link copied to clipboard");
  };

  const loadAssets = async () => {
    if (!user || !workspaceId) return;

    setLoading(true);
    try {
      const discovered: MediaAsset[] = [];

      for (const { folder, contentType } of MEDIA_FOLDERS) {
        const basePath = `${user.id}/${folder}`;
        const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(basePath);
        if (error) {
          // Folder may not exist for new users; ignore storage listing errors.
          continue;
        }
        if (!data) continue;

        for (const entry of data as any[]) {
          // entry includes name, id, updated_at, created_at, last_accessed_at, metadata
          if (!entry?.name) continue;

          const filePath = `${user.id}/${folder}/${entry.name}`;
          const {
            data: { publicUrl },
          } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

          discovered.push({
            filePath,
            fileName: entry.name,
            fileUrl: publicUrl,
            contentType,
            tags: [],
            size: entry.metadata?.size,
            createdAt: entry.created_at || entry.updated_at || new Date().toISOString(),
          });
        }
      }

      // Attach persisted tags from DB.
      const filePaths = discovered.map((d) => d.filePath);
      let tagsByFilePath: Record<string, string[]> = {};

      if (filePaths.length > 0) {
        const { data: rows } = await (supabase
          // Table is newer than the checked-in generated types, so cast to avoid TS friction.
          .from("media_assets" as any)
          .select("file_path,tags")
          .eq("workspace_id", workspaceId)
          .in("file_path", filePaths)) as any;

        if (rows) {
          tagsByFilePath = rows.reduce((acc: Record<string, string[]>, row: any) => {
            acc[row.file_path] = Array.isArray(row.tags) ? row.tags : [];
            return acc;
          }, {});
        }
      }

      setAssets(
        discovered
          .map((d) => ({ ...d, tags: tagsByFilePath[d.filePath] || [] }))
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssets().catch((e) => {
      console.error(e);
      toast.error("Failed to load media library");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, workspaceId]);

  const startEditTags = (asset: MediaAsset) => {
    setEditingTagsFor(asset.filePath);
    setTagDraft((asset.tags || []).join(", "));
  };

  const saveTags = async (asset: MediaAsset) => {
    if (!user || !workspaceId) return;

    setSavingTags(true);
    try {
      const nextTags = tagDraft
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 30);

      const { error } = await (supabase as any)
        .from("media_assets" as any)
        .upsert(
          {
            workspace_id: workspaceId,
            user_id: user.id,
            file_path: asset.filePath,
            file_url: asset.fileUrl,
            content_type: asset.contentType,
            tags: nextTags,
          },
          { onConflict: "workspace_id,file_path" }
        );

      if (error) throw error;

      setAssets((prev) =>
        prev.map((a) => (a.filePath === asset.filePath ? { ...a, tags: nextTags } : a))
      );
      setEditingTagsFor(null);
      toast.success("Tags updated");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to update tags");
    } finally {
      setSavingTags(false);
    }
  };

  const deleteAsset = async (asset: MediaAsset) => {
    if (!user || !workspaceId) return;

    try {
      setLoading(true);

      const { error: fnError } = await supabase.functions.invoke("delete-media", {
        body: {
          file_path: asset.filePath,
        },
      });
      if (fnError) throw fnError;

      const { error: dbError } = await (supabase as any)
        .from("media_assets" as any)
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("file_path", asset.filePath);
      if (dbError) throw dbError;

      setAssets((prev) => prev.filter((a) => a.filePath !== asset.filePath));
      toast.success("Asset deleted");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to delete asset");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!user || !workspaceId || selectedPaths.length === 0) return;
    
    setLoading(true);
    try {
      let successCount = 0;
      for (const filePath of selectedPaths) {
        try {
          // 1. Storage via Edge Function
          const { error: fnError } = await supabase.functions.invoke("delete-media", {
            body: { file_path: filePath },
          });
          if (fnError) continue;

          // 2. DB Metadata
          await (supabase as any)
            .from("media_assets" as any)
            .delete()
            .eq("workspace_id", workspaceId)
            .eq("file_path", filePath);
          
          successCount++;
        } catch (e) {
          console.error(`Failed to delete ${filePath}:`, e);
        }
      }
      
      setAssets(prev => prev.filter(a => !selectedPaths.includes(a.filePath)));
      setSelectedPaths([]);
      toast.success(`Successfully deleted ${successCount} assets`);
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to perform bulk delete");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!user || !workspaceId) return;

    const mime = file.type;
    const fileNameLower = file.name.toLowerCase();

    let folder = "";
    let contentType: MediaContentType | null = null;

    if (mime.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp)$/i.test(fileNameLower)) {
      folder = "images";
      contentType = "image";
    } else if (mime.startsWith("video/") || /\.(mp4|mov|webm|mkv)$/i.test(fileNameLower)) {
      folder = "videos";
      contentType = "video";
    } else if (mime === "application/pdf" || fileNameLower.endsWith(".pdf")) {
      folder = "pdfs";
      contentType = "pdf";
    } else {
      toast.error("Unsupported file type. Upload image/video/PDF.");
      return;
    }

    const ext = fileNameLower.includes(".") ? fileNameLower.split(".").pop() : "file";
    const safeExt = ext || "file";
    const filePath = `${user.id}/${folder}/${crypto.randomUUID()}-${Date.now()}.${safeExt}`;

    try {
      setLoading(true);

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, file, {
          contentType: mime || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

      // Persist tags metadata so the asset appears with an editable tag list.
      const { error: dbError } = await (supabase as any)
        .from("media_assets" as any)
        .insert({
          workspace_id: workspaceId,
          user_id: user.id,
          file_path: filePath,
          file_url: publicUrl,
          content_type: contentType,
          tags: [],
        });
      if (dbError) throw dbError;

      setAssets((prev) => [
        ...prev,
        {
          filePath,
          fileName: file.name,
          fileUrl: publicUrl,
          contentType: contentType!,
          tags: [],
        },
      ]);

      toast.success("Uploaded to library");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to upload asset");
    } finally {
      setLoading(false);
    }
  };

  if (!user || !workspaceId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">Initializing Library</h1>
            <p className="text-muted-foreground">Please wait while we connect to your workspace...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const toggleSelection = (path: string) => {
    setSelectedPaths(prev => 
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const selectAll = () => {
    if (processedAssets.length > 0 && selectedPaths.length === processedAssets.length) {
      setSelectedPaths([]);
    } else {
      setSelectedPaths(processedAssets.map(a => a.filePath));
    }
  };

  return (
    <DashboardLayout>
      <TooltipProvider>
        <div className="space-y-6">
          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-4xl font-extrabold tracking-tight">Media Library</h1>
              <p className="text-lg text-muted-foreground flex items-center gap-2">
                <File className="h-5 w-5" />
                {assets.length} items stored in your secure vault
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="relative group">
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*,application/pdf"
                  className="hidden"
                  id="library-upload-input"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    files.forEach(file => void handleUpload(file));
                    e.target.value = "";
                  }}
                  disabled={loading}
                />
                <Button 
                  asChild
                  disabled={loading}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transition-all active:scale-95 gap-2 px-6"
                >
                  <label htmlFor="library-upload-input" className="cursor-pointer">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    <span>Upload Assets</span>
                  </label>
                </Button>
              </div>
            </div>
          </div>

          {/* Type Navigation Tabs */}
          <Tabs defaultValue="all" value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b pb-4">
              <TabsList className="bg-muted/50 p-1">
                <TabsTrigger value="all" className="gap-2 px-6">
                  <LayoutGrid className="h-4 w-4" /> All
                </TabsTrigger>
                <TabsTrigger value="image" className="gap-2 px-6">
                  <ImageIcon size={16} /> Images
                </TabsTrigger>
                <TabsTrigger value="video" className="gap-2 px-6">
                  <VideoIcon size={16} /> Videos
                </TabsTrigger>
                <TabsTrigger value="pdf" className="gap-2 px-6">
                  <FileText size={16} /> Docs
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Filter by name or tags..." 
                    className="pl-10 bg-muted/30 border-none focus-visible:ring-1 focus-visible:ring-primary/50"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>

                <div className="flex items-center bg-muted/30 rounded-md p-1">
                  <Button 
                    variant={viewMode === "grid" ? "secondary" : "ghost"} 
                    size="sm" 
                    className="h-8 px-3"
                    onClick={() => setViewMode("grid")}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant={viewMode === "list" ? "secondary" : "ghost"} 
                    size="sm" 
                    className="h-8 px-3"
                    onClick={() => setViewMode("list")}
                  >
                    <ListIcon className="h-4 w-4" />
                  </Button>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-10 gap-2">
                      <ArrowUpDown className="h-4 w-4" />
                      Sort: {sortBy === "newest" ? "Newest" : sortBy === "oldest" ? "Oldest" : "Name"}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setSortBy("newest")} className="gap-2">
                      <Clock className="h-4 w-4" /> Newest First
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy("oldest")} className="gap-2">
                      <Clock className="h-4 w-4" /> Oldest First
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy("name")} className="gap-2">
                      <ArrowUpDown className="h-4 w-4" /> Name A-Z
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Bulk Actions Bar */}
            {selectedPaths.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-lg animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-4 pl-2">
                  <Checkbox 
                    checked={selectedPaths.length === processedAssets.length}
                    onCheckedChange={selectAll}
                    className="data-[state=checked]:bg-primary"
                  />
                  <span className="text-sm font-semibold">{selectedPaths.length} items selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPaths([])}>Cancel</Button>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="gap-2"
                    onClick={handleBulkDelete}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Delete Selected
                  </Button>
                </div>
              </div>
            )}

            <TabsContent value={activeTab} className="mt-6 outline-none">
              {processedAssets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 bg-muted/10 rounded-3xl border-2 border-dashed border-muted">
                  <div className="w-20 h-20 rounded-full bg-muted/40 flex items-center justify-center mb-4">
                    <File className="h-10 w-10 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-xl font-bold">No assets found</h3>
                  <p className="text-muted-foreground max-w-sm text-center mt-2">
                    {query || activeTab !== "all" 
                      ? "Try adjusting your filters or search query to find what you're looking for." 
                      : "Start by uploading your first image, video or document to your workspace library."}
                  </p>
                  {(query || activeTab !== "all") && (
                    <Button variant="link" onClick={() => { setQuery(""); setActiveTab("all"); }}>
                      Clear all filters
                    </Button>
                  )}
                </div>
              ) : viewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {processedAssets.map((asset) => (
                    <div 
                      key={asset.filePath} 
                      className={cn(
                        "group relative bg-card rounded-2xl border transition-all duration-300 hover:shadow-2xl overflow-hidden",
                        selectedPaths.includes(asset.filePath) ? "ring-2 ring-primary border-primary bg-primary/5" : "hover:-translate-y-1"
                      )}
                    >
                      {/* Selection Overlay */}
                      <div className={cn(
                        "absolute top-3 left-3 z-20 transition-opacity",
                        selectedPaths.includes(asset.filePath) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}>
                        <Checkbox 
                          checked={selectedPaths.includes(asset.filePath)}
                          onCheckedChange={() => toggleSelection(asset.filePath)}
                          className="bg-background/80 backdrop-blur-sm data-[state=checked]:bg-primary"
                        />
                      </div>

                      {/* Preview Area */}
                      <div 
                        className="aspect-square relative flex items-center justify-center bg-muted/30 cursor-pointer overflow-hidden"
                        onClick={() => setPreviewAsset(asset)}
                      >
                        {asset.contentType === "image" && (
                          <img src={asset.fileUrl} alt={asset.fileName} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        )}
                        {asset.contentType === "video" && (
                          <>
                            <video src={asset.fileUrl} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                                <VideoIcon className="h-6 w-6 text-white fill-white" />
                              </div>
                            </div>
                          </>
                        )}
                        {asset.contentType === "pdf" && (
                          <div className="flex flex-col items-center gap-3">
                            <FileText className="h-12 w-12 text-rose-500" />
                            <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">PDF</span>
                          </div>
                        )}

                        {/* Hover Quick Actions */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-2 scale-95 group-hover:scale-100">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="secondary" size="icon" className="h-9 w-9 rounded-full" onClick={(e) => { e.stopPropagation(); copyToClipboard(asset.fileUrl); }}>
                                <Copy className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Copy URL</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="secondary" size="icon" className="h-9 w-9 rounded-full" onClick={(e) => { e.stopPropagation(); window.open(asset.fileUrl, "_blank"); }}>
                                <Download className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="destructive" size="icon" className="h-9 w-9 rounded-full" onClick={(e) => { e.stopPropagation(); setAssetToDelete(asset); }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="p-3 bg-gradient-to-b from-card to-muted/20">
                        <div className="flex items-center justify-between gap-2">
                          <p 
                            className="text-sm font-semibold truncate cursor-pointer hover:text-primary transition-colors"
                            onClick={() => setPreviewAsset(asset)}
                          >
                            {asset.fileName}
                          </p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full opacity-60 hover:opacity-100">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Asset Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => setPreviewAsset(asset)} className="gap-2">
                                <Eye className="h-4 w-4" /> View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => startEditTags(asset)} className="gap-2">
                                <TagIcon className="h-4 w-4" /> Edit Tags
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => setAssetToDelete(asset)}>
                                <Trash2 className="h-4 w-4" /> Delete Permanently
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px] h-4 px-1 rounded-sm border-muted-foreground/30 capitalize">
                            {asset.contentType}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground font-mono uppercase">
                            {formatSize(asset.size)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border rounded-2xl bg-card overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="p-4 w-10">
                          <Checkbox 
                            checked={selectedPaths.length === processedAssets.length && processedAssets.length > 0}
                            onCheckedChange={selectAll}
                          />
                        </th>
                        <th className="p-4 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">Asset</th>
                        <th className="p-4 font-semibold text-muted-foreground uppercase tracking-wider text-[11px] hidden md:table-cell">Details</th>
                        <th className="p-4 font-semibold text-muted-foreground uppercase tracking-wider text-[11px] hidden lg:table-cell">Date Added</th>
                        <th className="p-4 font-semibold text-muted-foreground uppercase tracking-wider text-[11px] text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {processedAssets.map((asset) => (
                        <tr 
                          key={asset.filePath} 
                          className={cn(
                            "group hover:bg-muted/30 transition-colors",
                            selectedPaths.includes(asset.filePath) && "bg-primary/5"
                          )}
                        >
                          <td className="p-4">
                            <Checkbox 
                              checked={selectedPaths.includes(asset.filePath)}
                              onCheckedChange={() => toggleSelection(asset.filePath)}
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden cursor-pointer shrink-0"
                                onClick={() => setPreviewAsset(asset)}
                              >
                                {asset.contentType === "image" ? (
                                  <img src={asset.fileUrl} className="w-full h-full object-cover" />
                                ) : asset.contentType === "video" ? (
                                  <VideoIcon className="h-5 w-5 text-muted-foreground font-bold" />
                                ) : (
                                  <FileText className="h-5 w-5 text-muted-foreground" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold truncate max-w-[200px]">{asset.fileName}</p>
                                <div className="flex gap-2 items-center flex-wrap">
                                  {asset.tags.slice(0, 3).map(t => (
                                    <span key={t} className="text-[10px] text-primary hover:underline cursor-pointer">#{t}</span>
                                  ))}
                                  {editingTagsFor !== asset.filePath && (
                                    <button 
                                      className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5"
                                      onClick={() => startEditTags(asset)}
                                    >
                                      <TagIcon size={8} /> Add
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 hidden md:table-cell">
                            <div className="flex flex-col gap-1">
                              <Badge variant="outline" className="w-fit text-[10px] capitalize bg-muted/40 font-normal">
                                {asset.contentType}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground font-mono">{formatSize(asset.size)}</span>
                            </div>
                          </td>
                          <td className="p-4 hidden lg:table-cell text-muted-foreground text-xs whitespace-nowrap">
                            {format(new Date(asset.createdAt), "MMM d, yyyy · p")}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(asset.fileUrl)}>
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copy URL</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewAsset(asset)}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Quick View</TooltipContent>
                              </Tooltip>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => startEditTags(asset)} className="gap-2 font-medium">
                                    <TagIcon className="h-4 w-4" /> Manage Tags
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => window.open(asset.fileUrl, "_blank")} className="gap-2">
                                    <ExternalLink className="h-4 w-4" /> Open Original
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive focus:text-destructive gap-2" onClick={() => setAssetToDelete(asset)}>
                                    <Trash2 className="h-4 w-4" /> Remove
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </TooltipProvider>

      {/* Tags Mini Modal */}
      <Dialog open={!!editingTagsFor} onOpenChange={(open) => !open && setEditingTagsFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TagIcon className="h-5 w-5 text-primary" />
              Manage Tags
            </DialogTitle>
            <DialogDescription>
              Assign descriptive tags to help you search and organize your assets.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tags-input">Tags (comma separated)</Label>
              <Input
                id="tags-input"
                autoFocus
                value={tagDraft}
                disabled={savingTags}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder="e.g. promotional, marketing, summer2024"
                className="bg-muted/30"
              />
              <p className="text-[11px] text-muted-foreground italic">
                Press Save or hit Enter to apply changes.
              </p>
            </div>
            
            <div className="flex flex-wrap gap-1.5 min-h-[40px] p-2 rounded-lg bg-muted/20 border">
              {tagDraft.split(",").filter(Boolean).map((t, i) => (
                <Badge key={i} variant="secondary" className="gap-1 border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-colors">
                  #{t.trim()}
                </Badge>
              ))}
              {!tagDraft && <span className="text-[11px] text-muted-foreground self-center px-1">No tags drafted...</span>}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="ghost" onClick={() => setEditingTagsFor(null)}>Cancel</Button>
            <Button 
              className="px-8 shadow-md"
              disabled={savingTags} 
              onClick={() => {
                const asset = assets.find(a => a.filePath === editingTagsFor);
                if (asset) void saveTags(asset);
              }}
            >
              {savingTags ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick View / Detail Dialog */}
      <Dialog open={!!previewAsset} onOpenChange={(open) => !open && setPreviewAsset(null)}>
        <DialogContent className="sm:max-w-4xl p-0 overflow-hidden bg-card/95 backdrop-blur-md border-none shadow-2xl">
          <div className="flex flex-col lg:flex-row h-full">
            {/* Visual Preview */}
            <div className="lg:w-2/3 bg-black flex items-center justify-center p-2 min-h-[300px] lg:min-h-[500px] relative">
              <div className="absolute top-4 left-4 z-20">
                <Badge variant="outline" className="bg-black/50 text-white border-white/20 capitalize backdrop-blur-md px-3 py-1">
                  {previewAsset?.contentType}
                </Badge>
              </div>
              <Button 
                variant="outline" 
                size="icon" 
                className="absolute top-4 right-4 bg-white/10 border-white/20 text-white hover:bg-white/20 rounded-full h-10 w-10 z-20"
                onClick={() => setPreviewAsset(null)}
              >
                <CloseIcon size={18} />
              </Button>

              {previewAsset?.contentType === "image" && (
                <img src={previewAsset.fileUrl} className="max-w-full max-h-[85vh] object-contain shadow-2xl" />
              )}
              {previewAsset?.contentType === "video" && (
                <video src={previewAsset.fileUrl} controls autoPlay className="max-w-full max-h-[85vh]" />
              )}
              {previewAsset?.contentType === "pdf" && (
                <div className="flex flex-col items-center gap-6 text-white text-center">
                  <div className="w-24 h-24 rounded-3xl bg-white/10 flex items-center justify-center border border-white/20">
                    <FileText size={48} className="text-rose-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold uppercase tracking-widest">Document Preview</h2>
                    <p className="text-white/60 mt-2">Browser doesn't support interactive PDF previews for secure links.</p>
                  </div>
                  <Button asChild variant="secondary" className="mt-4 gap-2 px-8">
                    <a href={previewAsset.fileUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={18} /> View Document
                    </a>
                  </Button>
                </div>
              )}
            </div>

            {/* Info Panel */}
            <div className="lg:w-1/3 p-8 flex flex-col justify-between bg-card">
              <div className="space-y-8">
                <div>
                  <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Asset Name</h3>
                  <h2 className="text-2xl font-black leading-tight break-all">{previewAsset?.fileName}</h2>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1 flex items-center gap-1">
                      <Clock size={10} /> Created At
                    </h3>
                    <p className="text-sm font-medium">
                      {previewAsset?.createdAt ? format(new Date(previewAsset.createdAt), "MMM d, y") : "N/A"}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1 flex items-center gap-1">
                      <ArrowUp size={10} /> File Size
                    </h3>
                    <p className="text-sm font-medium font-mono">{formatSize(previewAsset?.size)}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-3 flex items-center gap-1">
                    <TagIcon size={10} /> Organized Tags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {previewAsset?.tags.map(t => (
                      <Badge key={t} variant="secondary" className="px-3 py-1 bg-primary/5 text-primary border-primary/20">
                        #{t}
                      </Badge>
                    ))}
                    {previewAsset?.tags.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No tags assigned to this asset.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-10 mt-auto border-t">
                <Button className="w-full gap-2 shadow-lg h-12 text-md" onClick={() => previewAsset && copyToClipboard(previewAsset.fileUrl)}>
                  <Copy size={18} /> Copy Resource Link
                </Button>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" className="gap-2 h-11" onClick={() => previewAsset && window.open(previewAsset.fileUrl, "_blank")}>
                    <Download size={16} /> Download
                  </Button>
                  <Button variant="ghost" className="text-destructive hover:bg-destructive/10 gap-2 h-11" onClick={() => { setPreviewAsset(null); setAssetToDelete(previewAsset); }}>
                    <Trash2 size={16} /> Delete
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!assetToDelete} onOpenChange={(open) => !open && setAssetToDelete(null)}>
        <AlertDialogContent className="rounded-2xl border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-black">Hold on! Delete this?</AlertDialogTitle>
            <AlertDialogDescription className="text-[15px] leading-relaxed">
              You are about to permanently remove <span className="font-bold text-foreground">"{assetToDelete?.fileName}"</span> from your cloud storage. This action is irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 gap-2">
            <AlertDialogCancel className="rounded-xl border-2">Keep Asset</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl px-8 shadow-xl shadow-destructive/20 font-bold"
              onClick={() => assetToDelete && deleteAsset(assetToDelete)}
            >
              Confirm Wipe
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

