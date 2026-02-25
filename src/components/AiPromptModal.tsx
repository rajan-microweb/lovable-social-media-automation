import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, ArrowLeft, FileText, Image, Video, Wand2, Type, Film, Check,
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

interface SubOption {
  key: SubOptionKey;
  icon: React.ElementType;
  label: string;
  description: string;
  inputType: "prompt" | "url" | "text";
  inputLabel: string;
  inputPlaceholder: string;
}

// ─── Option definitions ──────────────────────────────────────────────────────

const SUB_OPTIONS: Record<string, SubOption[]> = {
  text: [
    {
      key: "text:prompt",
      icon: FileText,
      label: "Generate Text",
      description: "Write text from a prompt",
      inputType: "prompt",
      inputLabel: "Your prompt",
      inputPlaceholder: "Describe what text you want to generate...",
    },
    {
      key: "text:fromImage",
      icon: Image,
      label: "Text from Image",
      description: "Describe or analyse an image",
      inputType: "url",
      inputLabel: "Image URL",
      inputPlaceholder: "Paste a public image URL...",
    },
    {
      key: "text:fromVideo",
      icon: Video,
      label: "Text from Video",
      description: "Summarise or transcribe a video",
      inputType: "url",
      inputLabel: "Video URL",
      inputPlaceholder: "Paste a public video URL...",
    },
  ],
  image: [
    {
      key: "image:prompt",
      icon: Wand2,
      label: "Generate Image",
      description: "Create an image from a prompt",
      inputType: "prompt",
      inputLabel: "Image prompt",
      inputPlaceholder: "Describe the image you want to create...",
    },
    {
      key: "image:fromText",
      icon: Type,
      label: "Image from Text",
      description: "Turn existing text into a visual",
      inputType: "text",
      inputLabel: "Source text",
      inputPlaceholder: "Paste the text to convert into an image...",
    },
  ],
  video: [
    {
      key: "video:prompt",
      icon: Film,
      label: "Generate Video",
      description: "Create a video from a prompt",
      inputType: "prompt",
      inputLabel: "Video prompt",
      inputPlaceholder: "Describe the video you want to create...",
    },
    {
      key: "video:fromText",
      icon: Type,
      label: "Video from Text",
      description: "Turn existing text into a video",
      inputType: "text",
      inputLabel: "Source text",
      inputPlaceholder: "Paste the text to convert into a video...",
    },
  ],
};

// ─── Constants ───────────────────────────────────────────────────────────────

const VIDEO_POLL_INTERVAL_MS = 10_000;
const VIDEO_MAX_POLL_DURATION_MS = 5 * 60 * 1000;
const CHECK_VIDEO_WEBHOOK = "https://n8n.srv1248804.hstgr.cloud/webhook/check-video-status";

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

  const options = SUB_OPTIONS[fieldType] ?? [];

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

  // ── Payload builder ──────────────────────────────────────────────────────

  const buildPayload = (opt: SubOption): Record<string, unknown> => {
    const base = {
      userId: context?.userId,
      platforms: context?.platforms,
      typeOfPost: context?.typeOfPost,
      typeOfStory: context?.typeOfStory,
      title: context?.title,
      description: context?.description,
    };
    const map: Record<SubOptionKey, Record<string, unknown>> = {
      "text:prompt":    { textPrompt: inputValue },
      "text:fromImage": { textFromImageUrl: inputValue },
      "text:fromVideo": { textFromVideoUrl: inputValue },
      "image:prompt":   { imagePrompt: inputValue },
      "image:fromText": { imageFromText: inputValue },
      "video:prompt":   { videoPrompt: inputValue },
      "video:fromText": { videoFromText: inputValue },
    };
    return { ...base, ...map[opt.key] };
  };

  // ── Generate ─────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!selectedOption) return;
    if (!inputValue.trim()) { toast.error("Please fill in the input field"); return; }

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
          <div className="grid grid-cols-2 gap-3 mt-2">
            {options.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.key}
                  onClick={() => handleSelectOption(opt)}
                  className={cn(
                    "group relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all duration-200",
                    "hover:border-primary hover:shadow-md hover:scale-[1.02]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "bg-card"
                  )}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm leading-none">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-snug">{opt.description}</p>
                  </div>
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                  </div>
                </button>
              );
            })}
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

            {/* Input field */}
            <div className="space-y-2">
              <Label htmlFor="ai-input">{selectedOption.inputLabel}</Label>
              {selectedOption.inputType === "url" ? (
                <Input
                  id="ai-input"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={selectedOption.inputPlaceholder}
                  disabled={loading}
                />
              ) : (
                <Textarea
                  id="ai-input"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  rows={4}
                  placeholder={selectedOption.inputPlaceholder}
                  disabled={loading}
                />
              )}
            </div>

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
              <Button type="button" onClick={handleGenerate} disabled={loading}>
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
