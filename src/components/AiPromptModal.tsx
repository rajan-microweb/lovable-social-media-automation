import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2, ArrowLeft, FileText, Image, Video, Wand2, Type, Film, Check,
  AlertCircle, ImageIcon, VideoIcon,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadMediaFromUrl, uploadBase64ToStorage } from "@/lib/mediaUploadUtils";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AiContext {
  userId?: string;
  platforms?: string[];
  typeOfPost?: string;
  typeOfStory?: string;
  title?: string;
  description?: string;
  // Existing form content for auto-detection
  existingImageUrl?: string;
  existingVideoUrl?: string;
  existingTextContent?: string;
}

interface AiPromptModalProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (content: string) => void;
  fieldType: "text" | "image" | "video" | "pdf";
  title?: string;
  context?: AiContext;
}

type SubOptionKey =
  | "text:prompt"
  | "text:fromImage"
  | "text:fromVideo"
  | "image:prompt"
  | "image:fromText"
  | "video:prompt"
  | "video:fromText";

/** Which existing resource a sub-option depends on (if any) */
type Dependency = "image" | "video" | "text" | null;

interface SubOption {
  key: SubOptionKey;
  icon: React.ElementType;
  label: string;
  description: string;
  /** null = needs a free-text prompt; "auto" = pulls from existing form content */
  inputType: "prompt" | "auto";
  inputLabel: string;
  inputPlaceholder: string;
  dependency: Dependency;
  /** Which post types this option is valid for (undefined = all) */
  validPostTypes?: string[];
}

// ─── Option definitions ──────────────────────────────────────────────────────

const ALL_TEXT_OPTIONS: SubOption[] = [
  {
    key: "text:prompt",
    icon: FileText,
    label: "Generate Text",
    description: "Write text from a prompt",
    inputType: "prompt",
    inputLabel: "Your prompt",
    inputPlaceholder: "Describe what text you want to generate...",
    dependency: null,
  },
  {
    key: "text:fromImage",
    icon: Image,
    label: "Text from Image",
    description: "Analyse the uploaded image to write text",
    inputType: "auto",
    inputLabel: "Image source",
    inputPlaceholder: "",
    dependency: "image",
    validPostTypes: ["image", "carousel"],
  },
  {
    key: "text:fromVideo",
    icon: Video,
    label: "Text from Video",
    description: "Summarise or transcribe the uploaded video",
    inputType: "auto",
    inputLabel: "Video source",
    inputPlaceholder: "",
    dependency: "video",
    validPostTypes: ["video", "shorts"],
  },
];

const IMAGE_OPTIONS: SubOption[] = [
  {
    key: "image:prompt",
    icon: Wand2,
    label: "Generate Image",
    description: "Create an image from a prompt",
    inputType: "prompt",
    inputLabel: "Image prompt",
    inputPlaceholder: "Describe the image you want to create...",
    dependency: null,
  },
  {
    key: "image:fromText",
    icon: Type,
    label: "Image from Text",
    description: "Turn your existing post text into a visual",
    inputType: "auto",
    inputLabel: "Source text",
    inputPlaceholder: "",
    dependency: "text",
  },
];

const VIDEO_OPTIONS: SubOption[] = [
  {
    key: "video:prompt",
    icon: Film,
    label: "Generate Video",
    description: "Create a video from a prompt",
    inputType: "prompt",
    inputLabel: "Video prompt",
    inputPlaceholder: "Describe the video you want to create...",
    dependency: null,
  },
  {
    key: "video:fromText",
    icon: Type,
    label: "Video from Text",
    description: "Turn your existing post text into a video",
    inputType: "auto",
    inputLabel: "Source text",
    inputPlaceholder: "",
    dependency: "text",
  },
];

const SUB_OPTIONS_MAP: Record<string, SubOption[]> = {
  text: ALL_TEXT_OPTIONS,
  image: IMAGE_OPTIONS,
  video: VIDEO_OPTIONS,
};

// ─── Constants ───────────────────────────────────────────────────────────────

const VIDEO_POLL_INTERVAL_MS = 10_000;
const VIDEO_MAX_POLL_DURATION_MS = 5 * 60 * 1000;
const CHECK_VIDEO_WEBHOOK = "https://n8n.srv1248804.hstgr.cloud/webhook/check-video-status";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDependencyValue(dep: Dependency, context?: AiContext): string {
  if (!dep) return "";
  if (dep === "image") return context?.existingImageUrl ?? "";
  if (dep === "video") return context?.existingVideoUrl ?? "";
  if (dep === "text") return context?.existingTextContent ?? "";
  return "";
}

function getDependencyLabel(dep: Dependency): string {
  if (dep === "image") return "Uploaded image";
  if (dep === "video") return "Uploaded video";
  if (dep === "text") return "Post text content";
  return "";
}

function getDependencyIcon(dep: Dependency) {
  if (dep === "image") return ImageIcon;
  if (dep === "video") return VideoIcon;
  if (dep === "text") return FileText;
  return FileText;
}

function getMissingDependencyMessage(dep: Dependency): string {
  if (dep === "image") return "Please upload or generate an image first before using this option.";
  if (dep === "video") return "Please upload or generate a video first before using this option.";
  if (dep === "text") return "Please enter or generate some text content first before using this option.";
  return "Required content is missing.";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AiPromptModal({
  open,
  onClose,
  onGenerate,
  fieldType,
  title = "AI Content Generator",
  context,
}: AiPromptModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedOption, setSelectedOption] = useState<SubOption | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [videoElapsed, setVideoElapsed] = useState(0);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Filter options based on fieldType and typeOfPost
  const rawOptions = SUB_OPTIONS_MAP[fieldType] ?? [];
  const typeOfPost = context?.typeOfPost ?? "";
  const options = rawOptions.filter((opt) => {
    if (!opt.validPostTypes) return true; // no restriction
    if (!typeOfPost) return false;        // post type not set yet
    return opt.validPostTypes.includes(typeOfPost);
  });

  // Reset when modal opens / fieldType changes
  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedOption(null);
      setInputValue("");
      setUploadProgress("");
    }
  }, [open, fieldType]);

  const cleanupPolling = useCallback(() => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (elapsedIntervalRef.current) { clearInterval(elapsedIntervalRef.current); elapsedIntervalRef.current = null; }
    setVideoElapsed(0);
  }, []);

  useEffect(() => () => cleanupPolling(), [cleanupPolling]);

  // ── Polling ─────────────────────────────────────────────────────────────

  const pollVideoStatus = useCallback(
    (jobId: string): Promise<string> =>
      new Promise((resolve, reject) => {
        startTimeRef.current = Date.now();

        elapsedIntervalRef.current = setInterval(() => {
          setVideoElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);

        pollIntervalRef.current = setInterval(async () => {
          if (Date.now() - startTimeRef.current >= VIDEO_MAX_POLL_DURATION_MS) {
            cleanupPolling();
            reject(new Error("Video generation timed out after 5 minutes"));
            return;
          }
          try {
            const res = await fetch(CHECK_VIDEO_WEBHOOK, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jobId, userId: context?.userId }),
            });
            if (!res.ok) return;
            const data = await res.json();
            const status = data.status || data.data?.status;
            const videoUrl = data.videoUrl || data.data?.videoUrl || data.url || "";
            if (status === "completed" && videoUrl) { cleanupPolling(); resolve(videoUrl); }
            else if (status === "failed") { cleanupPolling(); reject(new Error(data.error || "Video generation failed")); }
          } catch { /* keep polling */ }
        }, VIDEO_POLL_INTERVAL_MS);
      }),
    [cleanupPolling, context?.userId]
  );

  // ── Upload helper ────────────────────────────────────────────────────────

  const uploadAiMedia = async (url: string, mediaType: "image" | "video") => {
    try {
      if (url.startsWith("data:")) return await uploadBase64ToStorage(url, mediaType, supabase);
      return await uploadMediaFromUrl(url, mediaType, supabase);
    } catch {
      toast.warning("Could not store in permanent storage, using original URL");
      return url;
    }
  };

  // ── Resolve the effective input value ────────────────────────────────────
  // For "auto" options the value comes from context, not a textarea.

  const resolveInputValue = (opt: SubOption): string => {
    if (opt.inputType === "auto") return getDependencyValue(opt.dependency, context);
    return inputValue;
  };

  // ── Payload builder ──────────────────────────────────────────────────────

  const buildPayload = (opt: SubOption): Record<string, unknown> => {
    const effectiveValue = resolveInputValue(opt);
    const base = {
      userId: context?.userId,
      platforms: context?.platforms,
      typeOfPost: context?.typeOfPost,
      typeOfStory: context?.typeOfStory,
      title: context?.title,
      description: context?.description,
    };
    const map: Record<SubOptionKey, Record<string, unknown>> = {
      "text:prompt":    { textPrompt: effectiveValue },
      "text:fromImage": { textFromImageUrl: effectiveValue },
      "text:fromVideo": { textFromVideoUrl: effectiveValue },
      "image:prompt":   { imagePrompt: effectiveValue },
      "image:fromText": { imageFromText: effectiveValue },
      "video:prompt":   { videoPrompt: effectiveValue },
      "video:fromText": { videoFromText: effectiveValue },
    };
    return { ...base, ...map[opt.key] };
  };

  // ── Generate ─────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!selectedOption) return;

    const effectiveValue = resolveInputValue(selectedOption);

    // Validation
    if (selectedOption.inputType === "prompt" && !inputValue.trim()) {
      toast.error("Please fill in the prompt field");
      return;
    }
    if (selectedOption.inputType === "auto" && !effectiveValue.trim()) {
      toast.error(getMissingDependencyMessage(selectedOption.dependency));
      return;
    }

    setLoading(true);
    setUploadProgress("Generating content...");

    try {
      const payload = buildPayload(selectedOption);
      const response = await fetch("https://n8n.srv1248804.hstgr.cloud/webhook/ai-content-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Failed to generate content");

      const data = await response.json();

      // ── TEXT result ──
      if (
        selectedOption.key === "text:prompt" ||
        selectedOption.key === "text:fromImage" ||
        selectedOption.key === "text:fromVideo"
      ) {
        if (!data.text) throw new Error(`No text returned. Response: ${JSON.stringify(data)}`);
        onGenerate(data.text);
        toast.success("Text generated successfully");
      }

      // ── IMAGE result ──
      else if (
        selectedOption.key === "image:prompt" ||
        selectedOption.key === "image:fromText"
      ) {
        const imageUrl = data.imageUrl || data.image_url || data.data?.imageUrl || data.url || "";
        if (!imageUrl) throw new Error(`No image URL returned. Response: ${JSON.stringify(data)}`);
        setUploadProgress("Uploading image to storage...");
        const permanent = await uploadAiMedia(imageUrl.trim(), "image");
        onGenerate(permanent);
        toast.success("Image generated and stored successfully");
      }

      // ── VIDEO result ──
      else if (
        selectedOption.key === "video:prompt" ||
        selectedOption.key === "video:fromText"
      ) {
        const jobId = data.jobId || data.data?.jobId;
        if (!jobId) {
          const videoUrl = data.videoUrl || data.video_url || data.data?.videoUrl || data.url || "";
          if (!videoUrl) throw new Error(`No jobId or videoUrl returned. Response: ${JSON.stringify(data)}`);
          const permanent = videoUrl.includes("supabase.co/storage")
            ? videoUrl
            : await (async () => { setUploadProgress("Uploading video to storage..."); return uploadAiMedia(videoUrl.trim(), "video"); })();
          onGenerate(permanent);
        } else {
          setUploadProgress("Generating video...");
          const videoUrl = await pollVideoStatus(jobId);
          const permanent = videoUrl.includes("supabase.co/storage")
            ? videoUrl
            : await (async () => { setUploadProgress("Uploading video to storage..."); return uploadAiMedia(videoUrl.trim(), "video"); })();
          onGenerate(permanent);
        }
        toast.success("Video generated successfully");
      }

      setInputValue("");
      onClose();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to generate content";
      toast.error(msg);
    } finally {
      setLoading(false);
      setUploadProgress("");
      cleanupPolling();
    }
  };

  // ── Close ────────────────────────────────────────────────────────────────

  const handleClose = () => {
    if (!loading) { setInputValue(""); setStep(1); setSelectedOption(null); cleanupPolling(); onClose(); }
  };

  const handleSelectOption = (opt: SubOption) => {
    setSelectedOption(opt);
    setInputValue("");
    setStep(2);
  };

  const handleBack = () => { setStep(1); setSelectedOption(null); setInputValue(""); };

  const videoProgressPercent = Math.min((videoElapsed / 300) * 100, 100);

  // ── Computed for step 2 ──────────────────────────────────────────────────

  const depValue = selectedOption ? getDependencyValue(selectedOption.dependency, context) : "";
  const hasDependency = selectedOption?.inputType === "auto";
  const dependencyMissing = hasDependency && !depValue.trim();
  const canGenerate = !loading && (hasDependency ? !dependencyMissing : inputValue.trim().length > 0);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button
                onClick={handleBack}
                disabled={loading}
                className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="flex-1">
              <DialogTitle>{title}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Step {step} of 2 — {step === 1 ? "Choose a generation method" : selectedOption?.label}
              </p>
            </div>
            {/* Step dots */}
            <div className="flex gap-1.5 pr-6">
              <span className={cn("h-2 w-2 rounded-full transition-colors", step === 1 ? "bg-primary" : "bg-muted")} />
              <span className={cn("h-2 w-2 rounded-full transition-colors", step === 2 ? "bg-primary" : "bg-muted")} />
            </div>
          </div>
        </DialogHeader>

        {/* ── Step 1: Option Grid ── */}
        {step === 1 && (
          <div className="mt-2 space-y-3">
            {options.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 opacity-40" />
                <p className="text-sm">No generation options available for the selected post type.</p>
                <p className="text-xs">Please select a post type first.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {options.map((opt) => {
                  const Icon = opt.icon;
                  const depVal = getDependencyValue(opt.dependency, context);
                  const depMissing = opt.inputType === "auto" && !depVal.trim();
                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleSelectOption(opt)}
                      className={cn(
                        "group relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all duration-200",
                        "hover:border-primary hover:shadow-md hover:scale-[1.02]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "bg-card",
                        depMissing && "opacity-60"
                      )}
                    >
                      <div className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                        depMissing
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm leading-none">{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-snug">{opt.description}</p>
                      </div>
                      {depMissing && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertCircle className="h-3 w-3 text-destructive" />
                          <span className="text-[10px] text-destructive leading-tight">
                            {getDependencyLabel(opt.dependency)} required
                          </span>
                        </div>
                      )}
                      {!depMissing && (
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center">
                            <Check className="h-3 w-3 text-primary" />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Input ── */}
        {step === 2 && selectedOption && (
          <div className="space-y-4 mt-2">
            {/* Selected option badge */}
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                <selectedOption.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{selectedOption.label}</p>
                <p className="text-xs text-muted-foreground">{selectedOption.description}</p>
              </div>
            </div>

            {/* Auto-detect source preview  */}
            {hasDependency && (
              <div className="space-y-2">
                <Label>{selectedOption.inputLabel}</Label>
                {dependencyMissing ? (
                  <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
                    <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-destructive">Required content missing</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {getMissingDependencyMessage(selectedOption.dependency)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                    {(() => {
                      const DepIcon = getDependencyIcon(selectedOption.dependency);
                      return (
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 shrink-0">
                            <DepIcon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-primary mb-1">
                              {getDependencyLabel(selectedOption.dependency)} detected ✓
                            </p>
                            {selectedOption.dependency === "text" ? (
                              <p className="text-xs text-muted-foreground line-clamp-3 break-words">
                                {depValue}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground truncate">
                                {depValue.length > 60 ? `${depValue.slice(0, 60)}…` : depValue}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Prompt input field (only for "prompt" type options) */}
            {!hasDependency && (
              <div className="space-y-2">
                <Label htmlFor="ai-input">{selectedOption.inputLabel}</Label>
                <Textarea
                  id="ai-input"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  rows={4}
                  placeholder={selectedOption.inputPlaceholder}
                  disabled={loading}
                />
              </div>
            )}

            {/* Progress */}
            {uploadProgress && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>
                    {videoElapsed > 0 ? `${uploadProgress} (${videoElapsed}s elapsed)` : uploadProgress}
                  </span>
                </div>
                {(selectedOption.key === "video:prompt" || selectedOption.key === "video:fromText") && videoElapsed > 0 && (
                  <Progress value={videoProgressPercent} className="h-2" />
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                title={dependencyMissing ? getMissingDependencyMessage(selectedOption.dependency) : undefined}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
