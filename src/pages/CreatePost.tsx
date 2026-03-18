import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { z } from "zod";
import { Sparkles, X, Plus, Loader2, Facebook, Instagram, Linkedin, Youtube, Twitter, Wand2, Type } from "lucide-react";
import { convertFileToJpeg, isJpegFile, convertToJpeg, convertUrlToJpegFile } from "@/lib/imageUtils";
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

// Platform configuration based on post type
const PLATFORM_MAP: Record<string, string[]> = {
  onlyText: ["Facebook", "LinkedIn"],
  image: ["Facebook", "Instagram", "LinkedIn"],
  carousel: ["Facebook", "Instagram", "LinkedIn"],
  video: ["Facebook", "Instagram", "LinkedIn"],
  shorts: ["Facebook", "Instagram"],
  article: ["LinkedIn"],
  pdf: ["LinkedIn"],
};

// Post metadata can include structured values (e.g. selected publish targets)
const metadataSchema = z.record(z.string(), z.any()).optional();

const postSchema = z.object({
  type_of_post: z.string().min(1, "Type of post is required"),
  platforms: z.array(z.string()).min(1, "At least one platform is required"),
  account_type: z.string().optional(),
  text: z.string().max(5000).optional(),
  image: z.string().url().optional().or(z.literal("")),
  video: z.string().url().optional().or(z.literal("")),
  pdf: z.string().url().optional().or(z.literal("")),
  tags: z.array(z.string()).optional(),
  metadata: metadataSchema,
  status: z.enum(["draft", "scheduled", "published"]),
  scheduled_at: z.string().optional(),
});

export default function CreatePost() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Form state
  const [typeOfPost, setTypeOfPost] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  // Use the platform accounts hook
  const { accounts: platformAccounts, loading: loadingPlatformAccounts } = usePlatformAccounts(user?.id, platforms);

  // Platform connection state
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [showConnectionAlert, setShowConnectionAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertPlatform, setAlertPlatform] = useState("");
  const [textContent, setTextContent] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [postDescription, setPostDescription] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [articleDescription, setArticleDescription] = useState("");
  const [articleUrl, setArticleUrl] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeDescription, setYoutubeDescription] = useState("");
  const [instagramTags, setInstagramTags] = useState("");
  const [facebookTags, setFacebookTags] = useState("");
  const [status, setStatus] = useState("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [articleThumbnailFile, setArticleThumbnailFile] = useState<File | null>(null);
  const [articleThumbnailUrl, setArticleThumbnailUrl] = useState("");

  // AI Modal state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalField, setAiModalField] = useState<"text" | "image" | "video" | "pdf">("text");
  const [aiModalTarget, setAiModalTarget] = useState<string>("");

  // OpenAI connection state
  const [openaiConnected, setOpenaiConnected] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [showOpenAIAlert, setShowOpenAIAlert] = useState(false);

  // Media URLs (both uploaded and AI-generated stored in bucket)
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [mediaUploading, setMediaUploading] = useState(false);

  // Carousel state - multiple images (all stored as persistent bucket URLs)
  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [carouselGenerating, setCarouselGenerating] = useState(false);
  const [carouselAiPrompt, setCarouselAiPrompt] = useState("");
  const [carouselAiMode, setCarouselAiMode] = useState<"prompt" | "fromText">("prompt");
  // Selected carousel image index for "Text from Image" in AI modal
  const [selectedCarouselImageIndex, setSelectedCarouselImageIndex] = useState<number | null>(null);

  // Available platforms based on post type
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);

  // Fetch connected platforms on mount
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
        // Check if OpenAI is connected and get API key
        const openaiIntegration = data.find((p) => p.platform_name.toLowerCase() === "openai");
        setOpenaiConnected(!!openaiIntegration);
      }
    };

    fetchConnectedPlatforms();
  }, [user]);

  // Reset form when type changes
  useEffect(() => {
    if (typeOfPost) {
      // Update available platforms
      setAvailablePlatforms(PLATFORM_MAP[typeOfPost] || []);
      // Reset selected platforms
      setPlatforms([]);
      setSelectedAccountIds([]);
      // Reset platform-specific fields
      setYoutubeTitle("");
      setYoutubeDescription("");
      setInstagramTags("");
      setFacebookTags("");
      // Reset carousel images when switching away from carousel
      if (typeOfPost !== "carousel") {
        setCarouselImages([]);
      }
    } else {
      setAvailablePlatforms([]);
      setPlatforms([]);
    }
  }, [typeOfPost]);

  // Reset selected accounts when platforms change (but only when accounts have loaded)
  useEffect(() => {
    if (loadingPlatformAccounts) return; // Don't filter while loading
    // Filter out account IDs that no longer belong to selected platforms
    const validAccountIds = selectedAccountIds.filter((id) => platformAccounts.some((account) => account.id === id));
    if (validAccountIds.length !== selectedAccountIds.length) {
      setSelectedAccountIds(validAccountIds);
    }
  }, [platforms, platformAccounts, loadingPlatformAccounts]);

  const handlePlatformChange = (platform: string, checked: boolean) => {
    // Check if platform is connected before allowing selection (case-insensitive)
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

  const openAiModal = (field: "text" | "image" | "video" | "pdf", target: string) => {
    if (!openaiConnected) {
      setShowOpenAIAlert(true);
      return;
    }
    setAiModalField(field);
    setAiModalTarget(target);
    setAiModalOpen(true);
  };

  // Auto-upload file to bucket immediately when selected
  const handleMediaFileChange = async (file: File) => {
    setMediaFile(file);
    setImageUrl("");
    setVideoUrl("");
    setPdfUrl("");

    let folder = "";
    if (typeOfPost === "image") folder = "images";
    else if (typeOfPost === "video" || typeOfPost === "shorts") folder = "videos";
    else if (typeOfPost === "pdf") folder = "pdfs";

    if (!folder) return;

    setMediaUploading(true);
    try {
      const url = await uploadFile(file, folder);
      if (typeOfPost === "image") setImageUrl(url);
      else if (typeOfPost === "video" || typeOfPost === "shorts") setVideoUrl(url);
      else if (typeOfPost === "pdf") setPdfUrl(url);
      toast.success("File uploaded to storage");
    } catch (err) {
      toast.error("Failed to upload file. Please try again.");
      console.error(err);
    } finally {
      setMediaUploading(false);
    }
  };

  // Resolve existing media/text for AI modal context (always bucket URLs)
  const getAiContext = () => {
    // For carousel, use the selected carousel image URL for "Text from Image"
    let contextImageUrl = imageUrl;
    if (typeOfPost === "carousel" && selectedCarouselImageIndex !== null) {
      contextImageUrl = carouselImages[selectedCarouselImageIndex] ?? imageUrl;
    }
    return {
      userId: user?.id,
      platforms,
      typeOfPost,
      title: postTitle,
      description: postDescription,
      existingImageUrl: contextImageUrl,
      existingVideoUrl: videoUrl,
      existingTextContent: textContent,
    };
  };

  const handleAiGenerate = async (content: string) => {
    if (aiModalTarget === "textContent") {
      setTextContent(content);
    } else if (aiModalTarget === "postTitle") {
      setPostTitle(content);
    } else if (aiModalTarget === "postDescription") {
      setPostDescription(content);
    } else if (aiModalTarget === "articleTitle") {
      setArticleTitle(content);
    } else if (aiModalTarget === "articleDescription") {
      setArticleDescription(content);
    } else if (aiModalTarget === "youtubeTitle") {
      setYoutubeTitle(content);
    } else if (aiModalTarget === "youtubeDescription") {
      setYoutubeDescription(content);
    } else if (aiModalTarget === "articleThumbnail") {
      setArticleThumbnailUrl(content);
      setArticleThumbnailFile(null);
      toast.success("AI-generated thumbnail URL loaded");
    } else if (aiModalTarget === "media") {
      // For media, content is a URL from AI - store it directly
      if (typeOfPost === "image" || typeOfPost === "carousel") {
        setImageUrl(content);
      } else if (typeOfPost === "video" || typeOfPost === "shorts") {
        setVideoUrl(content);
      } else if (typeOfPost === "pdf") {
        setPdfUrl(content);
      }
      setMediaFile(null); // Clear file if URL is set
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Check if any platform is connected
    if (connectedPlatforms.length === 0) {
      setAlertMessage("Please connect at least one social media account before creating a post.");
      setAlertPlatform("");
      setShowConnectionAlert(true);
      return;
    }

    setLoading(true);
    setUploading(true);

    try {
      // Files are pre-uploaded on select; use stored bucket URLs directly
      let uploadedUrl = null;
      let thumbnailUrl = null;

      // Handle carousel separately - multiple images stored as comma-separated URLs
      if (typeOfPost === "carousel") {
        // All carousel images are already uploaded to storage
        if (carouselImages.length === 0) {
          toast.error("Please add at least one image for the carousel");
          setLoading(false);
          setUploading(false);
          return;
        }

        if (carouselImages.length > 10) {
          toast.error("Maximum 10 images allowed for carousel");
          setLoading(false);
          setUploading(false);
          return;
        }

        uploadedUrl = carouselImages.join(",");
      } else if (imageUrl || videoUrl || pdfUrl) {
        // Use the already-stored bucket URL
        if (typeOfPost === "image") {
          uploadedUrl = imageUrl;
        } else if (typeOfPost === "video" || typeOfPost === "shorts") {
          uploadedUrl = videoUrl;
        } else if (typeOfPost === "pdf") {
          uploadedUrl = pdfUrl;
        }
      }

      // Handle article thumbnail upload
      if (typeOfPost === "article") {
        if (articleThumbnailUrl) {
          thumbnailUrl = articleThumbnailUrl;
        } else if (articleThumbnailFile) {
          thumbnailUrl = await uploadFile(articleThumbnailFile, "images");
        }
      }

      // Build account_type string from selected accounts
      let accountTypeValue = "";
      if (selectedAccountIds.length > 0) {
        accountTypeValue = selectedAccountIds.join(",");
      }

      // Build metadata object with platform+post-type specific fields
      const metadataObject: Record<string, any> = {};

      // Article URL stored in metadata
      if (typeOfPost === "article" && platforms.includes("linkedin")) {
        if (articleTitle) metadataObject["title"] = articleTitle;
        if (articleDescription) metadataObject["description"] = articleDescription;
        if (articleUrl) metadataObject["url"] = articleUrl;
      }

      // Video + YouTube specific fields
      if ((typeOfPost === "video" || typeOfPost === "shorts") && platforms.includes("youtube")) {
        if (youtubeTitle) metadataObject["title"] = youtubeTitle;
        if (youtubeDescription) metadataObject["description"] = youtubeDescription;
      }

      // Selected publish targets (Publer-style)
      if (selectedAccountIds.length > 0) {
        const targets = platformAccounts
          .filter((a) => selectedAccountIds.includes(a.id))
          .map((a) => ({
            platform: a.platform,
            target_id: a.id,
            target_type: a.type,
            name: a.name,
          }));
        metadataObject["targets"] = targets;
      }

      // Build tags array for platform-specific hashtags only
      const tagsArray: string[] = [];

      // Instagram tags
      if (platforms.includes("instagram") && instagramTags) {
        tagsArray.push(`instagram_tags:${instagramTags}`);
      }

      // Facebook tags
      if (platforms.includes("facebook") && facebookTags) {
        tagsArray.push(`facebook_tags:${facebookTags}`);
      }

      const data = {
        type_of_post: typeOfPost,
        platforms: platforms,
        account_type: accountTypeValue || undefined,
        text: textContent || undefined,
        image:
          typeOfPost === "image" || typeOfPost === "carousel"
            ? uploadedUrl || ""
            : typeOfPost === "article"
              ? thumbnailUrl || ""
              : "",
        video: typeOfPost === "video" || typeOfPost === "shorts" ? uploadedUrl || "" : "",
        pdf: typeOfPost === "pdf" ? uploadedUrl || "" : "",
        tags: tagsArray,
        metadata: metadataObject, // Use the new object structure here
        status: status,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      };

      postSchema.parse(data);

      const { error } = await supabase.from("posts").insert({
        user_id: user!.id,
        type_of_post: data.type_of_post,
        platforms: data.platforms,
        account_type: data.account_type ?? null,
        text: data.text ?? null,
        image: data.image || null,
        video: data.video || null,
        pdf: data.pdf || null,
        title: postTitle || "Untitled",
        description: postDescription || null,
        url: null,
        tags: data.tags.length > 0 ? data.tags : null,
        metadata: Object.keys(data.metadata).length > 0 ? data.metadata : null,
        status: data.status,
        scheduled_at: data.scheduled_at ?? null,
      });

      if (error) throw error;

      toast.success("Post created successfully");
      navigate("/posts");
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error(error.message || "Failed to create post");
      }
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  // State for conversion / upload progress
  const [isConverting, setIsConverting] = useState(false);
  const [carouselUploading, setCarouselUploading] = useState(false);

  // Carousel-specific functions
  // Auto-uploads every selected file to storage so we always have persistent URLs
  const handleCarouselFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = 10 - getTotalCarouselCount();
    const toProcess = files.slice(0, remaining);

    if (files.length > remaining) {
      toast.error(`You can only add ${remaining} more image${remaining !== 1 ? "s" : ""}`);
    }

    const isInstaCarousel = platforms.includes("instagram");

    setIsConverting(true);
    const readyFiles: File[] = [];
    for (const file of toProcess) {
      if (isInstaCarousel && !isJpegFile(file)) {
        toast.info(`Converting ${file.name} to JPEG…`);
        try {
          readyFiles.push(await convertFileToJpeg(file));
        } catch {
          toast.error(`Failed to convert ${file.name}`);
        }
      } else {
        readyFiles.push(file);
      }
    }
    setIsConverting(false);

    // Upload each file to storage immediately
    setCarouselUploading(true);
    const uploadedUrls: string[] = [];
    for (const file of readyFiles) {
      try {
        const url = await uploadFile(file, "carousel");
        uploadedUrls.push(url);
      } catch (err) {
        console.error("Carousel upload error:", err);
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    setCarouselUploading(false);

    if (uploadedUrls.length) {
      setCarouselImages((prev) => [...prev, ...uploadedUrls]);
      toast.success(`${uploadedUrls.length} image${uploadedUrls.length !== 1 ? "s" : ""} uploaded to storage`);
    }
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const generateCarouselAiImage = async () => {
    if (!openaiConnected) {
      setShowOpenAIAlert(true);
      return;
    }

    if (carouselAiMode === "prompt" && !carouselAiPrompt.trim()) {
      toast.error("Please enter a prompt for AI image generation");
      return;
    }

    if (carouselAiMode === "fromText" && !textContent.trim()) {
      toast.error("Please enter text content first before using Image from Text");
      return;
    }

    if (getTotalCarouselCount() >= 10) {
      toast.error("Maximum 10 images reached");
      return;
    }

    setCarouselGenerating(true);

    try {
      // Step 1: Call n8n webhook to generate the image
      const payload = carouselAiMode === "fromText"
        ? {
            generationType: "imageFromText",
            text: textContent,
            userId: user?.id,
            platforms: platforms,
            typeOfPost: "carousel",
            title: postTitle,
            description: postDescription,
          }
        : {
            generationType: "image",
            imagePrompt: carouselAiPrompt,
            userId: user?.id,
            platforms: platforms,
            typeOfPost: "carousel",
            title: postTitle,
            description: postDescription,
          };

      const genResponse = await fetch("https://n8n.srv1248804.hstgr.cloud/webhook/ai-content-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!genResponse.ok) {
        throw new Error(`AI generation failed: ${genResponse.statusText}`);
      }

      const data = await genResponse.json();
      console.log("Carousel AI response:", JSON.stringify(data, null, 2));

      const rawImageUrl = data.imageUrl || data.image_url || data.data?.imageUrl || data.url || "";
      if (!rawImageUrl || typeof rawImageUrl !== "string" || rawImageUrl.trim() === "") {
        throw new Error(`No image URL returned. Response: ${JSON.stringify(data)}`);
      }

      // Step 2: Upload to permanent storage via edge function
      let permanentUrl = rawImageUrl.trim();
      if (!permanentUrl.includes("supabase.co/storage")) {
        const uploadResponse = await supabase.functions.invoke("upload-ai-media", {
          body: { externalUrl: permanentUrl, mediaType: "image", userId: user?.id },
        });

        if (uploadResponse.error) {
          console.error("Storage upload failed, using original URL:", uploadResponse.error);
          toast.warning("Could not store permanently, using original URL");
        } else if (uploadResponse.data?.url) {
          permanentUrl = uploadResponse.data.url;
        }
      }

      setCarouselImages((prev) => [...prev, permanentUrl]);
      setCarouselAiPrompt("");
      toast.success(`AI image added to carousel (${getTotalCarouselCount() + 1}/10)`);
    } catch (error: any) {
      console.error("AI generation error:", error);
      toast.error(error.message || "Failed to generate image");
    } finally {
      setCarouselGenerating(false);
    }
  };

  const getTotalCarouselCount = () => carouselImages.length;

  const removeCarouselImage = (index: number) => {
    setCarouselImages(carouselImages.filter((_, i) => i !== index));
  };

  // Field visibility logic
  const showTextContent = typeOfPost && typeOfPost !== "pdf";
  const showPdfTextContent = typeOfPost === "pdf";
  const showArticleFields = typeOfPost === "article";
  const showMediaUpload = typeOfPost && typeOfPost !== "onlyText" && typeOfPost !== "article";
  const showYoutubeFields = platforms.includes("youtube") && typeOfPost === "video";
  const showInstagramFields = platforms.includes("instagram");
  const showFacebookFields = platforms.includes("facebook");
  const showAccountSelectors = platforms.length > 0;
  const showSchedule = typeOfPost !== "";

  // Media label based on type
  const getMediaLabel = () => {
    if (typeOfPost === "image") return "Upload Image";
    if (typeOfPost === "carousel") return "Upload Images (Multiple)";
    if (typeOfPost === "video") return "Upload Video (landscape)";
    if (typeOfPost === "shorts") return "Upload Video (portrait)";
    if (typeOfPost === "pdf") return "Upload PDF";
    return "Upload Media";
  };

  // Platform icon config for card-style selection
  const platformIcons: Record<
    string,
    { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }
  > = {
    Facebook: { icon: Facebook, color: "text-[#1877F3]", bg: "border-[#1877F3]" },
    Instagram: { icon: Instagram, color: "text-[#E4405F]", bg: "border-[#E4405F]" },
    LinkedIn: { icon: Linkedin, color: "text-[#0A66C2]", bg: "border-[#0A66C2]" },
    YouTube: { icon: Youtube, color: "text-[#FF0000]", bg: "border-[#FF0000]" },
    Twitter: { icon: Twitter, color: "text-[#1DA1F2]", bg: "border-[#1DA1F2]" },
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Create Post</h1>
          <p className="text-muted-foreground">Create a new social media post</p>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* Post Details Header */}
              <h2 className="text-xl font-semibold">Post Details</h2>

              {/* Post Title */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="postTitle">Post Title</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openAiModal("text", "postTitle")}
                    className="text-xs h-auto py-1"
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" /> AI Generate
                  </Button>
                </div>
                <Input
                  id="postTitle"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  placeholder="Enter post title..."
                />
              </div>

              {/* Post Description */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="postDescription">Post Description (Optional)</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openAiModal("text", "postDescription")}
                    className="text-xs h-auto py-1"
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" /> AI Generate
                  </Button>
                </div>
                <Textarea
                  id="postDescription"
                  value={postDescription}
                  onChange={(e) => setPostDescription(e.target.value)}
                  placeholder="Enter post description..."
                  rows={3}
                  maxLength={5000}
                />
                <p className="text-xs text-muted-foreground text-right mt-1">{postDescription.length}/5000</p>
              </div>

              {/* Type of Post */}
              <div>
                <Label>
                  Type of Post <span className="text-destructive">*</span>
                </Label>
                <Select value={typeOfPost} onValueChange={setTypeOfPost}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onlyText">Only Text</SelectItem>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="carousel">Carousel (Multiple Images)</SelectItem>
                    <SelectItem value="video">Video (landscape)</SelectItem>
                    <SelectItem value="shorts">Reels/Shorts (portrait)</SelectItem>
                    <SelectItem value="article">Article</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {typeOfPost && (
                <>
                  {/* Platforms */}
                  <div>
                    <Label>
                      Platforms <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex flex-wrap gap-3 mt-2">
                      {availablePlatforms.map((platform) => {
                        const isSelected = platforms.includes(platform.toLowerCase());
                        const iconConfig = platformIcons[platform];
                        const PlatformIcon = iconConfig?.icon || Linkedin;
                        return (
                          <button
                            key={platform}
                            type="button"
                            onClick={() => handlePlatformChange(platform, !isSelected)}
                            className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all min-w-[70px] ${
                              isSelected
                                ? `${iconConfig?.bg || "border-primary"} bg-background shadow-sm`
                                : "border-border hover:border-muted-foreground/50"
                            }`}
                          >
                            <PlatformIcon className={`h-7 w-7 ${iconConfig?.color || "text-foreground"}`} />
                            <span className="text-xs font-medium">{platform}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Account selectors */}
                  {showAccountSelectors && (
                    <div>
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
                  )}

                  {/* Text Content */}
                  {(showTextContent || showPdfTextContent) && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label>Text Content (Optional)</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openAiModal("text", "textContent")}
                          className="text-xs h-auto py-1"
                        >
                          <Sparkles className="mr-1 h-3.5 w-3.5" /> AI Generate
                        </Button>
                      </div>
                      {/* Carousel image selector for "Text from Image" */}
                      {typeOfPost === "carousel" && carouselImages.length > 0 && (
                        <div className="mb-3 space-y-1">
                          <p className="text-xs text-muted-foreground">
                            Select a carousel image to use with <span className="font-medium">Text from Image</span> AI generation:
                          </p>
                          <div className="flex gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setSelectedCarouselImageIndex(null)}
                              className={`rounded-lg border-2 p-0.5 transition-all ${selectedCarouselImageIndex === null ? "border-primary" : "border-transparent hover:border-muted-foreground/40"}`}
                            >
                              <div className="h-14 w-14 rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground">
                                None
                              </div>
                            </button>
                            {carouselImages.map((url, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setSelectedCarouselImageIndex(idx)}
                                className={`rounded-lg border-2 p-0.5 transition-all ${selectedCarouselImageIndex === idx ? "border-primary" : "border-transparent hover:border-muted-foreground/40"}`}
                              >
                                <img src={url} alt={`Slide ${idx + 1}`} className="h-14 w-14 object-cover rounded-md" />
                              </button>
                            ))}
                          </div>
                          {selectedCarouselImageIndex !== null && (
                            <p className="text-xs text-primary">Slide {selectedCarouselImageIndex + 1} selected — click AI Generate to use it</p>
                          )}
                        </div>
                      )}
                      <Textarea
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        placeholder={
                          showPdfTextContent
                            ? "Write accompanying text for your PDF post..."
                            : "Write your post text..."
                        }
                        rows={4}
                        maxLength={2000}
                      />
                      <p className="text-xs text-muted-foreground text-right mt-1">{textContent.length}/2000</p>
                    </div>
                  )}

                  {/* Carousel Images */}
                  {typeOfPost === "carousel" && (
                    <div className="space-y-3">
                      <Label>
                        Carousel Images ({getTotalCarouselCount()}/10) <span className="text-destructive">*</span>
                      </Label>

                      {/* AI Generate section */}
                      <div className="border rounded-lg p-3 space-y-3">
                        <div className="flex items-center gap-1 text-sm font-medium">
                          <Sparkles className="h-4 w-4" /> AI Generate Images
                        </div>

                        {/* Mode selector */}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setCarouselAiMode("prompt")}
                            className={`flex-1 flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${carouselAiMode === "prompt" ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"}`}
                          >
                            <div className="flex items-center gap-2">
                              <Wand2 className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium">Generate Image</span>
                            </div>
                            <p className="text-xs text-muted-foreground">Create from a prompt</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => setCarouselAiMode("fromText")}
                            className={`flex-1 flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${carouselAiMode === "fromText" ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"}`}
                          >
                            <div className="flex items-center gap-2">
                              <Type className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium">Image from Text</span>
                            </div>
                            <p className="text-xs text-muted-foreground">Turn post text into a visual</p>
                          </button>
                        </div>

                        {/* Mode: Generate Image */}
                        {carouselAiMode === "prompt" && (
                          <div className="flex gap-2">
                            <Input
                              type="text"
                              placeholder="Describe the image you want to generate..."
                              value={carouselAiPrompt}
                              onChange={(e) => setCarouselAiPrompt(e.target.value)}
                              disabled={carouselGenerating}
                            />
                            <Button
                              type="button"
                              onClick={generateCarouselAiImage}
                              disabled={carouselGenerating || !carouselAiPrompt.trim()}
                              size="sm"
                            >
                              {carouselGenerating ? (
                                <Loader2 className="animate-spin mr-1 h-4 w-4" />
                              ) : (
                                <Plus className="mr-1 h-4 w-4" />
                              )}
                              Generate
                            </Button>
                          </div>
                        )}

                        {/* Mode: Image from Text */}
                        {carouselAiMode === "fromText" && (
                          <div className="space-y-2">
                            {textContent.trim() ? (
                              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground line-clamp-2">
                                <span className="font-medium text-primary">Using text: </span>{textContent}
                              </div>
                            ) : (
                              <p className="text-xs text-destructive">Please enter text content first before using this option.</p>
                            )}
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                onClick={generateCarouselAiImage}
                                disabled={carouselGenerating || !textContent.trim()}
                                size="sm"
                              >
                                {carouselGenerating ? (
                                  <Loader2 className="animate-spin mr-1 h-4 w-4" />
                                ) : (
                                  <Plus className="mr-1 h-4 w-4" />
                                )}
                                Generate
                              </Button>
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground">
                          Generate images one by one. Each generation adds one image to the carousel.
                        </p>
                      </div>

                      {/* File upload */}
                      <div>
                        <Label className="text-sm">Or Upload Images from Device</Label>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleCarouselFilesChange}
                          disabled={isConverting || carouselUploading || getTotalCarouselCount() >= 10}
                          className="mt-1 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-muted file:text-foreground hover:file:bg-muted/80"
                        />
                        {(isConverting || carouselUploading) && (
                          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{isConverting ? "Converting to JPEG…" : "Uploading to storage…"}</span>
                          </div>
                        )}
                      </div>

                      {/* Preview grid — all images are bucket URLs */}
                      {carouselImages.length > 0 ? (
                        <div className="grid grid-cols-5 gap-2">
                          {carouselImages.map((url, idx) => (
                            <div key={`img-${idx}`} className="relative group">
                              <img src={url} alt={`Slide ${idx + 1}`} className="w-full h-20 object-cover rounded" />
                              <button
                                type="button"
                                onClick={() => removeCarouselImage(idx)}
                                className="absolute top-1 right-1 bg-black/50 rounded-full p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={12} />
                              </button>
                              <span className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1 rounded">{idx + 1}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-3 border rounded-lg">
                          No images added yet. Generate with AI or upload from your device.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Media upload (non-carousel) */}
                  {showMediaUpload && typeOfPost !== "carousel" && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label>
                          {getMediaLabel()} <span className="text-destructive">*</span>
                        </Label>
                        {typeOfPost === "image" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openAiModal("image", "media")}
                            className="text-xs h-auto py-1"
                          >
                            <Sparkles className="mr-1 h-3.5 w-3.5" /> AI Generate
                          </Button>
                        )}
                        {(typeOfPost === "video" || typeOfPost === "shorts") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openAiModal("video", "media")}
                            className="text-xs h-auto py-1"
                          >
                            <Sparkles className="mr-1 h-3.5 w-3.5" /> AI Generate
                          </Button>
                        )}
                        {typeOfPost === "pdf" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openAiModal("pdf", "media")}
                            className="text-xs h-auto py-1"
                          >
                            <Sparkles className="mr-1 h-3.5 w-3.5" /> AI Generate
                          </Button>
                        )}
                      </div>
                      <input
                        type="file"
                        accept={
                          typeOfPost === "image"
                            ? "image/*"
                            : typeOfPost === "video" || typeOfPost === "shorts"
                              ? "video/*"
                              : typeOfPost === "pdf"
                                ? "application/pdf"
                                : undefined
                        }
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handleMediaFileChange(e.target.files[0]);
                          }
                        }}
                        className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-muted file:text-foreground hover:file:bg-muted/80"
                      />
                      {mediaUploading && (
                        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Uploading to storage…</span>
                        </div>
                      )}
                      {mediaFile && !mediaUploading && <p className="text-sm text-muted-foreground mt-1">Selected: {mediaFile.name}</p>}
                      {(imageUrl || videoUrl || pdfUrl) && !mediaUploading && (
                        <p className="text-xs text-primary mt-1 truncate">✓ Stored: {(imageUrl || videoUrl || pdfUrl).split("/").pop()}</p>
                      )}

                      {/* Media Preview */}
                      {(imageUrl || videoUrl || pdfUrl) && !mediaUploading && (
                        <div className="mt-3 p-3 border rounded-lg bg-muted/30">
                          <p className="text-sm font-medium mb-2">Preview:</p>

                          {typeOfPost === "image" && imageUrl && (
                            <img
                              src={imageUrl}
                              alt="Preview"
                              className="max-h-48 rounded-md object-contain"
                            />
                          )}

                          {(typeOfPost === "video" || typeOfPost === "shorts") && videoUrl && (
                            <video src={videoUrl} controls className="max-h-48 rounded-md" />
                          )}

                          {typeOfPost === "pdf" && pdfUrl && (
                            <div className="flex items-center gap-2 p-3 bg-background rounded-md">
                              <div className="text-2xl">📄</div>
                              <div>
                                <p className="text-sm font-medium">{mediaFile?.name || "PDF File"}</p>
                                <a
                                  href={pdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline"
                                >
                                  View PDF
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Article fields */}
                  {showArticleFields && (
                    <div className="border rounded-lg p-4 space-y-4">
                      <h3 className="font-semibold">Article Fields</h3>

                      <div>
                        <Label htmlFor="articleTitle">Article Title (Optional)</Label>
                        <Input
                          id="articleTitle"
                          value={articleTitle}
                          onChange={(e) => setArticleTitle(e.target.value)}
                          placeholder="Enter article title..."
                        />
                      </div>

                      <div>
                        <Label htmlFor="articleDescription">Article Description (Optional)</Label>
                        <Textarea
                          id="articleDescription"
                          value={articleDescription}
                          onChange={(e) => setArticleDescription(e.target.value)}
                          placeholder="Enter article description..."
                          rows={3}
                        />
                      </div>

                      <div>
                        <Label htmlFor="articleUrl">Article URL (Optional)</Label>
                        <Input
                          id="articleUrl"
                          value={articleUrl}
                          onChange={(e) => setArticleUrl(e.target.value)}
                          placeholder="https://..."
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label>Upload Thumbnail (Optional)</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openAiModal("image", "articleThumbnail")}
                            className="text-xs h-auto py-1"
                          >
                            <Sparkles className="mr-1 h-3.5 w-3.5" /> AI Generate
                          </Button>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              setArticleThumbnailFile(e.target.files[0]);
                              setArticleThumbnailUrl("");
                            }
                          }}
                          className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-muted file:text-foreground hover:file:bg-muted/80"
                        />
                        {/* Article Thumbnail Preview */}
                        {(articleThumbnailFile || articleThumbnailUrl) && (
                          <div className="mt-3 p-3 border rounded-lg bg-muted/30">
                            <p className="text-sm font-medium mb-2">Preview:</p>
                            <img
                              src={
                                articleThumbnailUrl ||
                                (articleThumbnailFile ? URL.createObjectURL(articleThumbnailFile) : "")
                              }
                              alt="Thumbnail preview"
                              className="max-h-48 rounded-md object-contain"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* YouTube specific fields */}
                  {showYoutubeFields && (
                    <div className="border rounded-lg p-4 space-y-4">
                      <h3 className="font-semibold">YouTube Details</h3>
                      <div>
                        <Label htmlFor="youtubeTitle">YouTube Title</Label>
                        <Input
                          id="youtubeTitle"
                          value={youtubeTitle}
                          onChange={(e) => setYoutubeTitle(e.target.value)}
                          placeholder="Enter YouTube video title"
                        />
                      </div>
                      <div>
                        <Label htmlFor="youtubeDescription">YouTube Description</Label>
                        <Textarea
                          id="youtubeDescription"
                          value={youtubeDescription}
                          onChange={(e) => setYoutubeDescription(e.target.value)}
                          placeholder="Enter YouTube video description"
                          rows={3}
                        />
                      </div>
                    </div>
                  )}

                  {/* Instagram tags */}
                  {showInstagramFields && (
                    <div>
                      <Label>Instagram Hashtags</Label>
                      <Textarea
                        value={instagramTags}
                        onChange={(e) => setInstagramTags(e.target.value)}
                        placeholder="Enter Instagram hashtags separated by spaces"
                        rows={2}
                        className="mt-1"
                      />
                    </div>
                  )}

                  {/* Facebook tags */}
                  {showFacebookFields && (
                    <div>
                      <Label>Facebook Hashtags</Label>
                      <Textarea
                        value={facebookTags}
                        onChange={(e) => setFacebookTags(e.target.value)}
                        placeholder="Enter Facebook hashtags separated by spaces"
                        rows={2}
                        className="mt-1"
                      />
                    </div>
                  )}

                  {/* Status and Schedule - side by side */}
                  {showSchedule && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>
                          Status <span className="text-destructive">*</span>
                        </Label>
                        <Select value={status} onValueChange={setStatus}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="scheduledAt">
                          Schedule Date & Time <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="scheduledAt"
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Submit / Cancel */}
          {typeOfPost && (
            <div className="flex gap-3 mt-6">
              <Button type="submit" disabled={loading || uploading}>
                {loading || uploading ? (
                  <>
                    <Loader2 className="animate-spin mr-2 h-4 w-4" /> Saving...
                  </>
                ) : (
                  "Submit"
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate("/posts")}>
                Cancel
              </Button>
            </div>
          )}
        </form>
      </div>

      <AiPromptModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        fieldType={aiModalField}
        onGenerate={handleAiGenerate}
        context={getAiContext()}
      />

      <AlertDialog open={showConnectionAlert} onOpenChange={setShowConnectionAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Platform Not Connected</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>{alertMessage}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => navigate("/accounts")}>Connect Account</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showOpenAIAlert} onOpenChange={setShowOpenAIAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>OpenAI Not Connected</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            Please connect your OpenAI account to generate content with AI.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => navigate("/accounts")}>Connect OpenAI</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
