import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { z } from "zod";
import { AiPromptModal } from "@/components/AiPromptModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePlatformAccounts } from "@/hooks/usePlatformAccounts";
import { PlatformAccountSelector } from "@/components/posts/PlatformAccountSelector";
import { useTemplates } from "@/hooks/useTemplates";

const PLATFORM_MAP: Record<string, string[]> = {
  image: ["Facebook", "Instagram"],
  video: ["Facebook", "Instagram"],
};

const storySchema = z.object({
  type_of_story: z.string().min(1, "Type of story is required"),
  platforms: z.array(z.string()).min(1, "At least one platform is required"),
  account_type: z.string().optional(),
  image: z.string().url().optional().or(z.literal("")),
  video: z.string().url().optional().or(z.literal("")),
  scheduled_at: z.string().optional(),
  status: z.enum(["draft", "scheduled", "pending_approval", "published", "failed"]),
  recurrence_frequency: z.enum(["none", "weekly", "monthly"]).optional(),
  recurrence_until: z.string().optional().nullable(),
});

export default function CreateStory() {
  const { user, workspaceId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const approvalsEnabled = import.meta.env.VITE_ENABLE_APPROVALS === "true";
  const [uploading, setUploading] = useState(false);

  // Content templates (Publer-like quick apply)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [pendingTemplate, setPendingTemplate] = useState<any | null>(null);
  const { data: templatesData, isLoading: templatesLoading, isFetching: templatesFetching } = useTemplates({
    workspaceId: workspaceId || undefined,
    kind: "story",
    includeGlobal: true,
    sort: "updated_desc",
    page: 0,
    pageSize: 100,
  });
  const templates = templatesData?.items || [];

  const [typeOfStory, setTypeOfStory] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [status, setStatus] = useState("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<"none" | "weekly" | "monthly">("none");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);

  const toDateTimeLocalValue = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  useEffect(() => {
    if (scheduledAt) return;
    const prefillScheduledAt = (location.state as { prefillScheduledAt?: string } | null)?.prefillScheduledAt;
    if (!prefillScheduledAt) return;
    const parsed = new Date(prefillScheduledAt);
    if (Number.isNaN(parsed.getTime())) return;
    setScheduledAt(toDateTimeLocalValue(parsed));
    setStatus("scheduled");
  }, [location.state, scheduledAt]);

  // Use the platform accounts hook
  const { accounts: platformAccounts, loading: loadingPlatformAccounts } = usePlatformAccounts(user?.id, platforms);

  // AI Modal state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalField, setAiModalField] = useState<"text" | "image" | "video">("text");
  const [aiModalTarget, setAiModalTarget] = useState<string>("");

  // AI-generated URLs
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  // Platform connection state
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [showConnectionAlert, setShowConnectionAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertPlatform, setAlertPlatform] = useState("");

  // OpenAI connection state
  const [openaiConnected, setOpenaiConnected] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [showOpenAIAlert, setShowOpenAIAlert] = useState(false);

  // Fetch connected platforms on mount
  useEffect(() => {
    const fetchConnectedPlatforms = async () => {
      if (!user) return;

      const { data } = await supabase
        .from("platform_integrations")
        .select("platform_name, credentials")
        .eq("user_id", user.id);

      if (data) {
        const platformNames = data.map((p) => p.platform_name);
        setConnectedPlatforms(platformNames);
        const openaiIntegration = data.find((p) => p.platform_name.toLowerCase() === "openai");
        setOpenaiConnected(!!openaiIntegration);
        if (openaiIntegration?.credentials && typeof openaiIntegration.credentials === "object") {
          setOpenaiApiKey((openaiIntegration.credentials as any).api_key || "");
        }
      }
    };

    fetchConnectedPlatforms();
  }, [user]);

  useEffect(() => {
    const templateIdToApply = (location.state as { templateIdToApply?: string } | null)?.templateIdToApply;
    if (!templateIdToApply || !templates.length || selectedTemplateId) return;
    const target = templates.find((t) => t.id === templateIdToApply);
    if (!target) return;
    handleTemplateSelection(templateIdToApply);
  }, [location.state, selectedTemplateId, templates]);

  useEffect(() => {
    if (pendingTemplate) return;
    if (typeOfStory) {
      const newPlatforms = PLATFORM_MAP[typeOfStory] || [];
      setAvailablePlatforms(newPlatforms);
      setPlatforms([]);
      setSelectedAccountIds([]);
    }
  }, [typeOfStory]);

  // Apply a selected template once `typeOfStory` is set.
  useEffect(() => {
    if (!pendingTemplate) return;
    if (!pendingTemplate.type_of_story) return;
    if (typeOfStory !== pendingTemplate.type_of_story) return;

    const overrides = pendingTemplate.overrides || {};

    setPlatforms(
      Array.isArray(overrides.platforms)
        ? overrides.platforms.map((p: any) => String(p).toLowerCase())
        : []
    );
    setSelectedAccountIds(Array.isArray(overrides.selectedAccountIds) ? overrides.selectedAccountIds : []);
    setImageUrl(overrides.imageUrl ?? overrides.image_url ?? "");
    setVideoUrl(overrides.videoUrl ?? overrides.video_url ?? "");
    setMediaFile(null);

    setPendingTemplate(null);
  }, [pendingTemplate, typeOfStory]);

  const handleTemplateSelection = (templateId: string) => {
    if (templateId === "none") {
      setSelectedTemplateId("");
      setPendingTemplate(null);
      return;
    }

    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) {
      toast.warning("Selected template is no longer available.");
      setSelectedTemplateId("");
      return;
    }

    setSelectedTemplateId(templateId);
    setPendingTemplate(tpl);
    setTypeOfStory(tpl.type_of_story || "");
    toast.success(`Applied template: ${tpl.template_name}`);
  };

  useEffect(() => {
    if (!selectedTemplateId || templatesLoading || templatesFetching) return;
    const exists = templates.some((t) => t.id === selectedTemplateId);
    if (exists) return;
    setSelectedTemplateId("");
    setPendingTemplate(null);
    toast.warning("Previously selected template was removed.");
  }, [selectedTemplateId, templates, templatesFetching, templatesLoading]);

  /* 
  // Reset selected accounts when platforms change
  useEffect(() => {
    const validAccountIds = selectedAccountIds.filter((id) => platformAccounts.some((account) => account.id === id));
    if (validAccountIds.length !== selectedAccountIds.length) {
      setSelectedAccountIds(validAccountIds);
    }
  }, [platforms, platformAccounts]);
  */

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

  const openAiModal = (field: "text" | "image" | "video", target: string) => {
    if (!openaiConnected) {
      setShowOpenAIAlert(true);
      return;
    }
    setAiModalField(field);
    setAiModalTarget(target);
    setAiModalOpen(true);
  };

  const handleAiGenerate = async (content: string) => {
    if (aiModalTarget === "media") {
      if (typeOfStory === "image") {
        setImageUrl(content);
      } else if (typeOfStory === "video") {
        setVideoUrl(content);
      }
      setMediaFile(null);
      toast.success("AI-generated media URL loaded");
    }
  };

  const uploadFile = async (file: File, folder: string): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const filePath = `${user?.id}/${folder}/${fileName}`;

    const { error: uploadError } = await supabase.storage.from("post-media").upload(filePath, file);

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("post-media").getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (connectedPlatforms.length === 0) {
      setAlertMessage("Please connect at least one social media account before creating a story.");
      setAlertPlatform("");
      setShowConnectionAlert(true);
      return;
    }

    setLoading(true);

    try {
      if (!user || !workspaceId) {
        toast.error("Workspace not ready. Please try again.");
        return;
      }

      let uploadedImageUrl = "";
      let uploadedVideoUrl = "";

      if (imageUrl || videoUrl) {
        if (typeOfStory === "image") {
          uploadedImageUrl = imageUrl;
        } else if (typeOfStory === "video") {
          uploadedVideoUrl = videoUrl;
        }
      } else if (mediaFile) {
        setUploading(true);
        const folder = typeOfStory === "video" ? "videos" : "images";
        const url = await uploadFile(mediaFile, folder);

        if (typeOfStory === "video") {
          uploadedVideoUrl = url;
        } else {
          uploadedImageUrl = url;
        }
        setUploading(false);
      }

      // Build account_type string from selected accounts
      let accountTypeValue = "";
      if (selectedAccountIds.length > 0) {
        accountTypeValue = selectedAccountIds.join(",");
      }

      // Convert datetime-local format to ISO 8601
      const formattedScheduledAt = scheduledAt ? new Date(scheduledAt).toISOString() : undefined;

      const finalStatus = approvalsEnabled && status === "scheduled" ? "pending_approval" : (status as typeof status);

      const storyData = {
        type_of_story: typeOfStory,
        platforms,
        account_type: accountTypeValue || undefined,
        image: uploadedImageUrl || "",
        video: uploadedVideoUrl || "",
        scheduled_at: formattedScheduledAt,
        status: finalStatus as any,
        recurrence_frequency: recurrenceFrequency,
        recurrence_until: recurrenceUntil ? new Date(recurrenceUntil).toISOString() : null,
      };

      storySchema.parse(storyData);

      const { error } = await supabase.from("stories").insert({
        user_id: user!.id,
        workspace_id: workspaceId,
        title: "",
        type_of_story: storyData.type_of_story,
        platforms: storyData.platforms,
        account_type: storyData.account_type ?? null,
        image: storyData.image || null,
        video: storyData.video || null,
        scheduled_at: storyData.scheduled_at ?? null,
        status: storyData.status,
        recurrence_frequency: storyData.recurrence_frequency ?? "none",
        recurrence_until: storyData.recurrence_until ?? null,
      });

      if (error) throw error;

      toast.success("Story created successfully!");
      navigate("/stories");
    } catch (error: any) {
      console.error("Error creating story:", error);
      toast.error(error.message || "Failed to create story");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  // Field visibility logic
  const showMediaUpload = typeOfStory && typeOfStory !== "";
  const showAccountSelectors = platforms.length > 0;
  const showSchedule = typeOfStory !== "";

  const getMediaLabel = () => {
    if (typeOfStory === "image") return "Upload Image";
    if (typeOfStory === "video") return "Upload Video";
    return "Upload Media";
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Create Story</h1>
          <p className="text-muted-foreground">Create a new social media story</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Story Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Content Template */}
              <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>Content Template</Label>
                </div>

                <Select value={selectedTemplateId || "none"} onValueChange={handleTemplateSelection}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        templatesLoading ? "Loading templates..." : templates.length ? "Select a template (optional)" : "No templates available"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.template_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {pendingTemplate && (
                  <p className="text-xs text-muted-foreground">
                    Applying template...
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="typeOfStory">
                  Type of Story <span className="text-destructive">*</span>
                </Label>
                <Select value={typeOfStory} onValueChange={setTypeOfStory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Platforms - Show when type is selected */}
              {typeOfStory && availablePlatforms.length > 0 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>
                      Platforms <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex flex-wrap gap-3">
                      {availablePlatforms.map((platform) => {
                        const isSelected = platforms.includes(platform.toLowerCase());
                        const platformLower = platform.toLowerCase();

                        const getPlatformIcon = () => {
                          switch (platformLower) {
                            case "facebook":
                              return (
                                <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#1877F2">
                                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                </svg>
                              );
                            case "instagram":
                              return (
                                <svg viewBox="0 0 24 24" className="w-8 h-8">
                                  <defs>
                                    <linearGradient id="ig-gradient-create-story" x1="0%" y1="100%" x2="100%" y2="0%">
                                      <stop offset="0%" stopColor="#FFDC80" />
                                      <stop offset="10%" stopColor="#FCAF45" />
                                      <stop offset="30%" stopColor="#F77737" />
                                      <stop offset="60%" stopColor="#C13584" />
                                      <stop offset="100%" stopColor="#833AB4" />
                                    </linearGradient>
                                  </defs>
                                  <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ig-gradient-create-story)" />
                                  <circle cx="12" cy="12" r="4" fill="none" stroke="white" strokeWidth="1.5" />
                                  <circle cx="17.5" cy="6.5" r="1.5" fill="white" />
                                </svg>
                              );
                            default:
                              return null;
                          }
                        };

                        return (
                          <button
                            key={platform}
                            type="button"
                            onClick={() => handlePlatformChange(platform, !isSelected)}
                            className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all min-w-[100px] ${
                              isSelected
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-border hover:border-muted-foreground/50 bg-card"
                            }`}
                          >
                            {getPlatformIcon()}
                            <span className="mt-2 text-sm font-medium text-foreground">{platform}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {showAccountSelectors && (
                    <div className="space-y-4">
                      {platforms.includes("facebook") && (
                        <PlatformAccountSelector
                          accounts={platformAccounts}
                          selectedAccountIds={selectedAccountIds}
                          onAccountToggle={handleAccountToggle}
                          loading={loadingPlatformAccounts}
                          platform="facebook"
                        />
                      )}
                      {platforms.includes("instagram") && (
                        <PlatformAccountSelector
                          accounts={platformAccounts}
                          selectedAccountIds={selectedAccountIds}
                          onAccountToggle={handleAccountToggle}
                          loading={loadingPlatformAccounts}
                          platform="instagram"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}


              {/* Media Upload */}
              {showMediaUpload && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="media">
                      {getMediaLabel()} <span className="text-destructive">*</span>
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openAiModal(typeOfStory === "video" ? "video" : "image", "media")}
                      className="h-8 gap-1"
                    >
                      <Sparkles className="h-4 w-4" />
                      AI Generate
                    </Button>
                  </div>
                  <Input
                    id="media"
                    type="file"
                    onChange={(e) => {
                      setMediaFile(e.target.files?.[0] || null);
                      setImageUrl("");
                      setVideoUrl("");
                    }}
                    accept={typeOfStory === "video" ? "video/*" : "image/*"}
                    required={showMediaUpload && !imageUrl && !videoUrl}
                  />
                  {mediaFile && <p className="text-sm text-muted-foreground">Selected: {mediaFile.name}</p>}

                  {/* Media Preview */}
                  {(mediaFile || imageUrl || videoUrl) && (
                    <div className="mt-3 p-3 border rounded-lg bg-muted/30">
                      <p className="text-sm font-medium mb-2">Preview:</p>

                      {typeOfStory === "image" && (
                        <>
                          {mediaFile && (
                            <img
                              src={URL.createObjectURL(mediaFile)}
                              alt="Preview"
                              className="max-h-48 rounded-md object-contain"
                            />
                          )}
                          {imageUrl && (
                            <img
                              src={imageUrl}
                              alt="AI Generated Preview"
                              className="max-h-48 rounded-md object-contain"
                            />
                          )}
                        </>
                      )}

                      {typeOfStory === "video" && (
                        <>
                          {mediaFile && (
                            <video src={URL.createObjectURL(mediaFile)} controls className="max-h-48 rounded-md" />
                          )}
                          {videoUrl && <video src={videoUrl} controls className="max-h-48 rounded-md" />}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Status and Schedule */}
              {showSchedule && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="status">
                        Status <span className="text-destructive">*</span>
                      </Label>
                      <Select value={status} onValueChange={setStatus} required>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="scheduledAt">
                        Schedule Date & Time <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="scheduledAt"
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        required={showSchedule}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Recurrence</Label>
                      <Select
                        value={recurrenceFrequency}
                        onValueChange={(v) =>
                          setRecurrenceFrequency(v as "none" | "weekly" | "monthly")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select recurrence" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="recurrenceUntil">Recurrence Until</Label>
                      <Input
                        id="recurrenceUntil"
                        type="datetime-local"
                        value={recurrenceUntil}
                        onChange={(e) => setRecurrenceUntil(e.target.value)}
                        disabled={recurrenceFrequency === "none"}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              {typeOfStory && (
                <div className="flex gap-4">
                  <Button type="submit" disabled={loading || uploading} className="flex-1">
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Creating...
                      </>
                    ) : uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Uploading...
                      </>
                    ) : (
                      "Create Story"
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => navigate("/stories")}>
                    Cancel
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      <AiPromptModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onGenerate={handleAiGenerate}
        fieldType={aiModalField}
        context={{
          userId: user?.id,
          platforms: platforms,
          typeOfPost: typeOfStory,
          existingImageUrl: imageUrl || (mediaFile && typeOfStory === "image" ? URL.createObjectURL(mediaFile) : ""),
          existingVideoUrl: videoUrl || (mediaFile && typeOfStory === "video" ? URL.createObjectURL(mediaFile) : ""),
        }}
      />

      <AlertDialog open={showConnectionAlert} onOpenChange={setShowConnectionAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Account Connection Required</AlertDialogTitle>
            <AlertDialogDescription>{alertMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => navigate("/accounts")}>Go to Accounts</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showOpenAIAlert} onOpenChange={setShowOpenAIAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>OpenAI Not Connected</AlertDialogTitle>
            <AlertDialogDescription>
              Please connect your OpenAI account first to use AI generation features.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => navigate("/accounts")}>Go to Accounts</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
