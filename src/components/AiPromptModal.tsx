import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadMediaFromUrl, uploadBase64ToStorage } from "@/lib/mediaUploadUtils";

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

const VIDEO_POLL_INTERVAL_MS = 10_000;
const VIDEO_MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const CHECK_VIDEO_WEBHOOK = "https://n8n.srv1248804.hstgr.cloud/webhook/check-video-status";

export function AiPromptModal({
  open,
  onClose,
  onGenerate,
  fieldType,
  title = "AI Content Generator",
  context,
}: AiPromptModalProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [videoElapsed, setVideoElapsed] = useState(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const cleanupPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
    setVideoElapsed(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanupPolling();
  }, [cleanupPolling]);

  const pollVideoStatus = useCallback(
    async (jobId: string) => {
      return new Promise<string>((resolve, reject) => {
        startTimeRef.current = Date.now();

        // Elapsed time ticker
        elapsedIntervalRef.current = setInterval(() => {
          setVideoElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);

        // Status polling
        pollIntervalRef.current = setInterval(async () => {
          const elapsed = Date.now() - startTimeRef.current;

          if (elapsed >= VIDEO_MAX_POLL_DURATION_MS) {
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

            if (!res.ok) {
              console.error("Check video status error:", res.status);
              return; // keep polling
            }

            const data = await res.json();
            console.log("Video poll response:", JSON.stringify(data, null, 2));

            const status = data.status || data.data?.status;
            const videoUrl = data.videoUrl || data.data?.videoUrl || data.url || "";

            if (status === "completed" && videoUrl) {
              cleanupPolling();
              resolve(videoUrl);
            } else if (status === "failed") {
              cleanupPolling();
              reject(new Error(data.error || data.data?.error || "Video generation failed"));
            }
            // else still processing — keep polling
          } catch (err) {
            console.error("Poll error:", err);
            // keep polling on network errors
          }
        }, VIDEO_POLL_INTERVAL_MS);
      });
    },
    [cleanupPolling, context?.userId]
  );

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    setLoading(true);
    setUploadProgress("");

    try {
      const payload: Record<string, any> = {
        userId: context?.userId,
        platforms: context?.platforms,
        typeOfPost: context?.typeOfPost,
        typeOfStory: context?.typeOfStory,
        title: context?.title,
        description: context?.description,
      };

      if (fieldType === "text") {
        payload.textPrompt = prompt;
      } else if (fieldType === "image") {
        payload.imagePrompt = prompt;
      } else if (fieldType === "video") {
        payload.videoPrompt = prompt;
      } else if (fieldType === "pdf") {
        payload.pdfPrompt = prompt;
      }

      setUploadProgress("Generating content...");

      const response = await fetch("https://n8n.srv1248804.hstgr.cloud/webhook/ai-content-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to generate content");
      }

      const data = await response.json();
      console.log("n8n AI response:", JSON.stringify(data, null, 2));

      if (fieldType === "text" && data.text) {
        onGenerate(data.text);
        toast.success("Text generated successfully");
      } else if (fieldType === "image") {
        const imageUrl = data.imageUrl || data.image_url || data.data?.imageUrl || data.url || "";
        if (!imageUrl || typeof imageUrl !== "string" || imageUrl.trim() === "") {
          throw new Error(`No image URL returned. Response: ${JSON.stringify(data)}`);
        }
        setUploadProgress("Uploading image to storage...");
        const permanentUrl = await uploadAiMediaToStorage(imageUrl.trim(), "image");
        onGenerate(permanentUrl);
        toast.success("Image generated and stored successfully");
      } else if (fieldType === "video") {
        // Async two-phase: n8n returns { jobId, status } immediately
        const jobId = data.jobId || data.data?.jobId;
        if (!jobId) {
          // Fallback: maybe n8n returned videoUrl directly (old flow)
          const videoUrl = data.videoUrl || data.video_url || data.data?.videoUrl || data.url || "";
          if (videoUrl && typeof videoUrl === "string" && videoUrl.trim() !== "") {
            if (videoUrl.includes("supabase.co/storage")) {
              onGenerate(videoUrl);
            } else {
              setUploadProgress("Uploading video to storage...");
              const permanentUrl = await uploadAiMediaToStorage(videoUrl.trim(), "video");
              onGenerate(permanentUrl);
            }
            toast.success("Video generated successfully");
          } else {
            throw new Error(`No jobId or videoUrl returned. Response: ${JSON.stringify(data)}`);
          }
        } else {
          // Poll for completion
          setUploadProgress("Generating video...");
          const videoUrl = await pollVideoStatus(jobId);

          if (videoUrl.includes("supabase.co/storage")) {
            onGenerate(videoUrl);
          } else {
            setUploadProgress("Uploading video to storage...");
            const permanentUrl = await uploadAiMediaToStorage(videoUrl.trim(), "video");
            onGenerate(permanentUrl);
          }
          toast.success("Video generated and stored successfully");
        }
      } else if (fieldType === "pdf") {
        const pdfUrl = data.pdfUrl || data.pdf_url || data.data?.pdfUrl || data.url || "";
        if (!pdfUrl || typeof pdfUrl !== "string" || pdfUrl.trim() === "") {
          throw new Error(`No PDF URL returned. Response: ${JSON.stringify(data)}`);
        }
        onGenerate(pdfUrl);
        toast.success("PDF generated successfully");
      } else {
        throw new Error(`AI generation failed: no ${fieldType} content returned. Response: ${JSON.stringify(data)}`);
      }

      setPrompt("");
      onClose();
    } catch (error: any) {
      console.error("AI generation error:", error);
      toast.error(error.message || "Failed to generate content");
    } finally {
      setLoading(false);
      setUploadProgress("");
      cleanupPolling();
    }
  };

  const uploadAiMediaToStorage = async (
    url: string,
    mediaType: "image" | "video"
  ): Promise<string> => {
    try {
      if (url.startsWith("data:")) {
        return await uploadBase64ToStorage(url, mediaType, supabase);
      }
      return await uploadMediaFromUrl(url, mediaType, supabase);
    } catch (error) {
      console.error("Failed to upload to storage, using original URL:", error);
      toast.warning("Could not store in permanent storage, using original URL");
      return url;
    }
  };

  const handleClose = () => {
    if (!loading) {
      setPrompt("");
      cleanupPolling();
      onClose();
    }
  };

  const videoProgressPercent = Math.min((videoElapsed / 300) * 100, 100);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-prompt">Enter your prompt</Label>
            <Textarea
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Describe what you want to generate..."
              disabled={loading}
            />
          </div>
          {uploadProgress && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {videoElapsed > 0
                    ? `${uploadProgress} (${videoElapsed}s elapsed)`
                    : uploadProgress}
                </span>
              </div>
              {fieldType === "video" && videoElapsed > 0 && (
                <Progress value={videoProgressPercent} className="h-2" />
              )}
            </div>
          )}
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
      </DialogContent>
    </Dialog>
  );
}
