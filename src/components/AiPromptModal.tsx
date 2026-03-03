import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2, ArrowLeft, FileText, Image, Wand2, Type, Film, Check,
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
  /** null = needs a free-text prompt; "auto" = pulls from existing form content; "mixed" = auto URL + prompt textarea */
  inputType: "prompt" | "auto" | "mixed";
  inputLabel: string;
  inputPlaceholder: string;
  promptLabel?: string;
  promptPlaceholder?: string;
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
    inputType: "mixed",
    inputLabel: "Image source",
    inputPlaceholder: "",
    promptLabel: "Instructions (optional)",
    promptPlaceholder: "e.g. Write a caption with a professional tone and 3 hashtags",
    dependency: "image",
    validPostTypes: ["image", "carousel"],
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

// n8n now polls internally and responds once completed — no client-side polling needed.
// We just wait on the single main webhook response (can take up to 5 min for video).
const IMAGE_MAX_WAIT_MS = 4 * 60 * 1000;   // 4 min timeout
const VIDEO_MAX_WAIT_MS = 6 * 60 * 1000;   // 6 min timeout

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
  const [elapsed, setElapsed] = useState(0);
  // Preview state: once generation is done, show preview before closing
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"image" | "video" | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Filter options based on fieldType and typeOfPost
  const rawOptions = SUB_OPTIONS_MAP[fieldType] ?? [];
  const typeOfPost = context?.typeOfPost ?? "";
  const options = rawOptions.filter((opt) => {
    if (!opt.validPostTypes) return true;
    if (!typeOfPost) return false;
    return opt.validPostTypes.includes(typeOfPost);
  });

  // Reset when modal opens / fieldType changes
  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedOption(null);
      setInputValue("");
      setUploadProgress("");
      setPreviewUrl(null);
      setPreviewType(null);
      setPendingUrl(null);
      setElapsed(0);
    }
  }, [open, fieldType]);

  const cleanupPolling = useCallback(() => {
    if (elapsedIntervalRef.current) { clearInterval(elapsedIntervalRef.current); elapsedIntervalRef.current = null; }
    setElapsed(0);
  }, []);

  useEffect(() => () => cleanupPolling(), [cleanupPolling]);

  // ── Polling ─────────────────────────────────────────────────────────────

  const startElapsedTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    elapsedIntervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, []);

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

  // For "auto"/"mixed" options the URL comes from context, not a textarea.
  const resolveInputValue = (opt: SubOption): string => {
    if (opt.inputType === "auto" || opt.inputType === "mixed") return getDependencyValue(opt.dependency, context);
    return inputValue;
  };

  // ── Payload builder ──────────────────────────────────────────────────────

  const GENERATION_TYPE_MAP: Record<SubOptionKey, string> = {
    "text:prompt":    "text",
    "text:fromImage": "textFromImage",
    "image:prompt":   "image",
    "image:fromText": "imageFromText",
    "video:prompt":   "video",
    "video:fromText": "videoFromText",
  };

  const buildPayload = (opt: SubOption): Record<string, unknown> => {
    const mediaUrl = (opt.inputType === "auto" || opt.inputType === "mixed")
      ? getDependencyValue(opt.dependency, context)
      : undefined;
    const prompt = opt.inputType === "mixed" ? inputValue : undefined;
    const base = {
      userId: context?.userId,
      platforms: context?.platforms,
      typeOfPost: context?.typeOfPost,
      typeOfStory: context?.typeOfStory,
      title: context?.title,
      description: context?.description,
      generationType: GENERATION_TYPE_MAP[opt.key],
    };
    const map: Record<SubOptionKey, Record<string, unknown>> = {
      "text:prompt":    { textPrompt: inputValue },
      "text:fromImage": { mediaUrl, prompt: prompt || undefined },
      "image:prompt":   { imagePrompt: inputValue },
      "image:fromText": { text: mediaUrl },
      "video:prompt":   { videoPrompt: inputValue },
      "video:fromText": { text: mediaUrl },
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
    if ((selectedOption.inputType === "auto" || selectedOption.inputType === "mixed") && !effectiveValue.trim()) {
      toast.error(getMissingDependencyMessage(selectedOption.dependency));
      return;
    }

    setLoading(true);
    setUploadProgress("Generating content...");
    setPreviewUrl(null);
    setPreviewType(null);
    setPendingUrl(null);

    const isImage = selectedOption.key === "image:prompt" || selectedOption.key === "image:fromText";
    const isVideo = selectedOption.key === "video:prompt" || selectedOption.key === "video:fromText";

    // Start elapsed timer for image/video — n8n blocks until done, so we just show progress
    if (isImage || isVideo) {
      startElapsedTimer();
      setUploadProgress(isVideo ? "Generating video... this may take a few minutes" : "Generating image...");
    }

    try {
      const payload = buildPayload(selectedOption);

      // Use AbortController so we can timeout cleanly
      const maxWait = isVideo ? VIDEO_MAX_WAIT_MS : isImage ? IMAGE_MAX_WAIT_MS : 60_000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), maxWait);

      let response: Response;
      try {
        response = await fetch("https://n8n.srv1248804.hstgr.cloud/webhook/ai-content-generator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) throw new Error("Failed to generate content");

      // Stop elapsed timer once response arrives
      if (elapsedIntervalRef.current) { clearInterval(elapsedIntervalRef.current); elapsedIntervalRef.current = null; }

      const raw = await response.json();
      // n8n may wrap in array
      const data = Array.isArray(raw) ? raw[0] : raw;

      console.log("[AiPromptModal] Response:", JSON.stringify(data));

      // ── TEXT result ──
      if (selectedOption.key === "text:prompt" || selectedOption.key === "text:fromImage") {
        const text = data.text ?? data.data?.text ?? "";
        if (!text) throw new Error(`No text returned. Response: ${JSON.stringify(data)}`);
        onGenerate(text);
        toast.success("Text generated successfully");
        setInputValue("");
        onClose();
        return;
      }

      // ── IMAGE result ──
      if (isImage) {
        const imageUrl = data.imageUrl ?? data.image_url ?? data.data?.imageUrl ?? data.url ?? "";
        if (!imageUrl) throw new Error(`No image URL returned. Response: ${JSON.stringify(data)}`);
        setUploadProgress("Uploading image to storage...");
        const permanent = await uploadAiMedia(imageUrl.trim(), "image");
        setPreviewUrl(permanent);
        setPreviewType("image");
        setPendingUrl(permanent);
        setUploadProgress("");
        setLoading(false);
        toast.success("Image generated successfully");
        return;
      }

      // ── VIDEO result ──
      if (isVideo) {
        const videoUrl = data.videoUrl ?? data.video_url ?? data.data?.videoUrl ?? data.url ?? "";
        if (!videoUrl) throw new Error(`No video URL returned. Response: ${JSON.stringify(data)}`);
        const permanent = videoUrl.includes("supabase.co/storage")
          ? videoUrl
          : await (async () => { setUploadProgress("Uploading video to storage..."); return uploadAiMedia(videoUrl.trim(), "video"); })();
        setPreviewUrl(permanent);
        setPreviewType("video");
        setPendingUrl(permanent);
        setUploadProgress("");
        setLoading(false);
        toast.success("Video generated successfully");
        return;
      }

    } catch (error: unknown) {
      const msg = error instanceof Error
        ? (error.name === "AbortError" ? "Generation timed out — please try again" : error.message)
        : "Failed to generate content";
      toast.error(msg);
      setLoading(false);
      setUploadProgress("");
      cleanupPolling();
    }
  };

  // ── Use generated media ──────────────────────────────────────────────────

  const handleUseResult = () => {
    if (pendingUrl) {
      onGenerate(pendingUrl);
    }
    setInputValue("");
    setPreviewUrl(null);
    setPreviewType(null);
    setPendingUrl(null);
    onClose();
  };

  // ── Close ────────────────────────────────────────────────────────────────

  const handleClose = () => {
    if (!loading) { setInputValue(""); setStep(1); setSelectedOption(null); setPreviewUrl(null); setPreviewType(null); setPendingUrl(null); cleanupPolling(); onClose(); }
  };

  const handleSelectOption = (opt: SubOption) => {
    setSelectedOption(opt);
    setInputValue("");
    setStep(2);
  };

  const handleBack = () => { setStep(1); setSelectedOption(null); setInputValue(""); setPreviewUrl(null); setPreviewType(null); setPendingUrl(null); };

  const isImageOrVideo = selectedOption?.key.startsWith("image:") || selectedOption?.key.startsWith("video:");
  const progressMax = selectedOption?.key.startsWith("video:") ? VIDEO_MAX_WAIT_MS / 1000 : IMAGE_MAX_WAIT_MS / 1000;
  const progressPercent = Math.min((elapsed / progressMax) * 100, 95); // cap at 95 until done

  // ── Computed for step 2 ──────────────────────────────────────────────────

  const depValue = selectedOption ? getDependencyValue(selectedOption.dependency, context) : "";
  const hasDependency = selectedOption?.inputType === "auto" || selectedOption?.inputType === "mixed";
  const dependencyMissing = hasDependency && !depValue.trim();
  const canGenerate = !loading && !dependencyMissing && !previewUrl && (
    selectedOption?.inputType === "prompt" ? inputValue.trim().length > 0 : true
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {step === 2 && !previewUrl && (
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
                {previewUrl
                  ? "Preview — use or regenerate"
                  : `Step ${step} of 2 — ${step === 1 ? "Choose a generation method" : selectedOption?.label}`}
              </p>
            </div>
            {/* Step dots */}
            {!previewUrl && (
              <div className="flex gap-1.5 pr-6">
                <span className={cn("h-2 w-2 rounded-full transition-colors", step === 1 ? "bg-primary" : "bg-muted")} />
                <span className={cn("h-2 w-2 rounded-full transition-colors", step === 2 ? "bg-primary" : "bg-muted")} />
              </div>
            )}
          </div>
        </DialogHeader>

        {/* ── Preview State ── */}
        {previewUrl && previewType && (
          <div className="space-y-4 mt-2">
            <div className="rounded-xl overflow-hidden border bg-muted/30">
              {previewType === "image" ? (
                <img
                  src={previewUrl}
                  alt="Generated image"
                  className="w-full object-contain max-h-72"
                />
              ) : (
                <video
                  src={previewUrl}
                  controls
                  className="w-full max-h-72"
                  preload="metadata"
                />
              )}
            </div>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setPreviewUrl(null); setPreviewType(null); setPendingUrl(null); }}
                disabled={loading}
              >
                Regenerate
              </Button>
              <Button type="button" onClick={handleUseResult}>
                <Check className="mr-2 h-4 w-4" />
                Use This {previewType === "image" ? "Image" : "Video"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 1: Option Grid ── */}
        {!previewUrl && step === 1 && (
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
        {!previewUrl && step === 2 && selectedOption && (
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

            {/* Auto-detect source preview */}
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

            {/* "mixed" type: show URL preview + optional prompt textarea */}
            {selectedOption.inputType === "mixed" && !dependencyMissing && (
              <div className="space-y-2">
                <Label htmlFor="ai-mixed-prompt">
                  {selectedOption.promptLabel ?? "Instructions (optional)"}
                </Label>
                <Textarea
                  id="ai-mixed-prompt"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  rows={3}
                  placeholder={selectedOption.promptPlaceholder ?? "Add specific instructions (tone, style, length)…"}
                  disabled={loading}
                />
              </div>
            )}

            {/* Prompt input field (only for "prompt" type options) */}
            {selectedOption.inputType === "prompt" && (
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

            {/* Progress — shown while generating image or video */}
            {uploadProgress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{uploadProgress}</span>
                  </div>
                  {elapsed > 0 && (
                    <span className="text-xs tabular-nums">{elapsed}s</span>
                  )}
                </div>
                {isImageOrVideo && elapsed > 0 && (
                  <Progress value={progressPercent} className="h-2" />
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
