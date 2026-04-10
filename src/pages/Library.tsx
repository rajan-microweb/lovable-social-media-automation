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
import { Trash2, Image as ImageIcon, Video as VideoIcon, FileText, Tag as TagIcon, Loader2, Upload } from "lucide-react";

type MediaContentType = "image" | "video" | "pdf";

type MediaAsset = {
  filePath: string;
  fileName: string;
  fileUrl: string;
  contentType: MediaContentType;
  tags: string[];
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

  const normalizedQuery = query.trim().toLowerCase();

  const filteredAssets = useMemo(() => {
    if (!normalizedQuery) return assets;
    return assets.filter((a) => {
      const fileMatch = a.fileName.toLowerCase().includes(normalizedQuery);
      const tagMatch = a.tags.some((t) => t.toLowerCase().includes(normalizedQuery));
      return fileMatch || tagMatch;
    });
  }, [assets, normalizedQuery]);

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

        for (const entry of data as Array<{ name: string }>) {
          // `list()` at a prefix returns objects for the current "directory".
          // If the storage backend returns nested names, skip them.
          if (!entry?.name || entry.name.includes("/")) continue;

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
          .sort((a, b) => a.fileName.localeCompare(b.fileName))
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
    const confirmed = window.confirm(`Delete "${asset.fileName}" from your library?`);
    if (!confirmed) return;

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
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Library</h1>
            <p className="text-muted-foreground">Sign in to manage your media assets.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold">Library</h1>
            <p className="text-muted-foreground">Search, tag, and manage your uploaded assets.</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="librarySearch">Search</Label>
                <Input
                  id="librarySearch"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by filename or tag..."
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="libraryUpload">Upload asset</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="libraryUpload"
                    type="file"
                    accept="image/*,video/*,application/pdf"
                    disabled={loading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUpload(file);
                      // allow re-selecting same file
                      e.currentTarget.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      // no-op: file input triggers upload via onChange
                    }}
                    disabled
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Stored under your user prefix in Supabase Storage.</p>
              </div>

              <div className="space-y-2">
                <Label>Summary</Label>
                <div className="text-sm text-muted-foreground">
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                    </span>
                  ) : (
                    <>
                      {filteredAssets.length} asset{filteredAssets.length !== 1 ? "s" : ""} shown
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {filteredAssets.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-muted-foreground">
              No assets found. Upload something above, then tag it here.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAssets.map((asset) => (
              <Card key={asset.filePath}>
                <CardContent className="p-3 space-y-3">
                  <div className="relative w-full overflow-hidden rounded-md bg-muted">
                    {asset.contentType === "image" && (
                      <img
                        src={asset.fileUrl}
                        alt={asset.fileName}
                        className="w-full h-40 object-cover"
                      />
                    )}
                    {asset.contentType === "video" && (
                      <video src={asset.fileUrl} className="w-full h-40 object-cover" controls={false} muted />
                    )}
                    {asset.contentType === "pdf" && (
                      <div className="h-40 flex flex-col items-center justify-center gap-2">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">PDF</p>
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <Badge variant="outline" className="bg-background/70">
                        {asset.contentType}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{asset.fileName}</p>
                      <p className="text-xs text-muted-foreground truncate">{asset.filePath}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={loading}
                      onClick={() => void deleteAsset(asset)}
                      aria-label="Delete asset"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {asset.tags.slice(0, 6).map((t) => (
                      <Badge key={t} variant="secondary">
                        #{t}
                      </Badge>
                    ))}
                    {asset.tags.length > 6 && (
                      <Badge variant="outline">+{asset.tags.length - 6}</Badge>
                    )}
                    {asset.tags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet</span>}
                  </div>

                  {editingTagsFor === asset.filePath ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <TagIcon className="h-4 w-4" />
                          Edit tags
                        </div>
                      </div>

                      <Input
                        value={tagDraft}
                        disabled={savingTags}
                        onChange={(e) => setTagDraft(e.target.value)}
                        placeholder="comma-separated tags (e.g. blog, linkedin)"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={savingTags}
                          onClick={() => void saveTags(asset)}
                        >
                          {savingTags ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                            </span>
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={savingTags}
                          onClick={() => {
                            setEditingTagsFor(null);
                            setTagDraft("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() => startEditTags(asset)}
                      className="w-full"
                    >
                      <TagIcon className="h-4 w-4 mr-2" />
                      Edit tags
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

