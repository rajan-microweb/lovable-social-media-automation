import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";

const PLATFORM_MAP: Record<string, string[]> = {
  image: ["Facebook", "Instagram"],
  video: ["Facebook", "Instagram"],
};

const storySchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  type_of_story: z.string().min(1, "Type of story is required"),
  platforms: z.array(z.string()).min(1, "At least one platform is required"),
  text: z.string().optional(),
  image: z.string().optional(),
  video: z.string().optional(),
  scheduled_at: z.string().optional(),
});

export default function EditStory() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fetchingStory, setFetchingStory] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [typeOfStory, setTypeOfStory] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>("");
  const [existingMedia, setExistingMedia] = useState<{ image?: string; video?: string }>({});
  const [scheduledAt, setScheduledAt] = useState("");
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);

  useEffect(() => {
    if (id && user) {
      fetchStory();
    }
  }, [id, user]);

  const fetchStory = async () => {
    try {
      const { data, error } = await supabase
        .from("stories")
        .select("*")
        .eq("id", id)
        .eq("user_id", user!.id)
        .single();

      if (error) throw error;

      if (data) {
        setTitle(data.title || "");
        setDescription(data.description || "");
        setTypeOfStory(data.type_of_story || "");
        setPlatforms(data.platforms || []);
        setText(data.text || "");
        setExistingMedia({
          image: data.image || undefined,
          video: data.video || undefined,
        });
        if (data.image) setMediaPreview(data.image);
        if (data.video) setMediaPreview(data.video);
        setScheduledAt(data.scheduled_at ? new Date(data.scheduled_at).toISOString().slice(0, 16) : "");
      }
    } catch (error: any) {
      console.error("Error fetching story:", error);
      toast.error("Failed to load story");
      navigate("/stories");
    } finally {
      setFetchingStory(false);
    }
  };

  useEffect(() => {
    if (typeOfStory) {
      const newPlatforms = PLATFORM_MAP[typeOfStory] || [];
      setAvailablePlatforms(newPlatforms);
    }
  }, [typeOfStory]);

  const handlePlatformChange = (platform: string, checked: boolean) => {
    setPlatforms(prev =>
      checked ? [...prev, platform] : prev.filter(p => p !== platform)
    );
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaFile(file);
      setMediaPreview(URL.createObjectURL(file));
    }
  };

  const uploadFile = async (file: File, folder: string) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('post-media')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('post-media')
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let imageUrl = existingMedia.image || "";
      let videoUrl = existingMedia.video || "";

      if (mediaFile) {
        setUploading(true);
        const folder = typeOfStory === "video" ? "videos" : "images";
        const url = await uploadFile(mediaFile, folder);
        
        if (typeOfStory === "video") {
          videoUrl = url;
        } else {
          imageUrl = url;
        }
        setUploading(false);
      }

      const storyData = {
        title,
        description: description || null,
        type_of_story: typeOfStory,
        platforms,
        text: text || null,
        image: imageUrl || null,
        video: videoUrl || null,
        scheduled_at: scheduledAt || null,
        status: scheduledAt ? "scheduled" : "draft",
      };

      storySchema.parse(storyData);

      const { error } = await supabase
        .from("stories")
        .update(storyData)
        .eq("id", id)
        .eq("user_id", user!.id);

      if (error) throw error;

      toast.success("Story updated successfully!");
      navigate("/stories");
    } catch (error: any) {
      console.error("Error updating story:", error);
      toast.error(error.message || "Failed to update story");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  if (fetchingStory) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const showMediaUpload = typeOfStory && typeOfStory !== "";

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Edit Story</h1>
          <p className="text-muted-foreground">Update your social media story</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Story Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter story title"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter story description"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="typeOfStory">Type of Story *</Label>
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

              {availablePlatforms.length > 0 && (
                <div className="space-y-2">
                  <Label>Platforms *</Label>
                  <div className="flex flex-wrap gap-4">
                    {availablePlatforms.map((platform) => (
                      <div key={platform} className="flex items-center space-x-2">
                        <Checkbox
                          id={platform}
                          checked={platforms.includes(platform)}
                          onCheckedChange={(checked) =>
                            handlePlatformChange(platform, checked as boolean)
                          }
                        />
                        <Label htmlFor={platform} className="cursor-pointer">
                          {platform}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="text">Text Content</Label>
                <Textarea
                  id="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Write your story text..."
                  rows={3}
                />
              </div>

              {showMediaUpload && (
                <div className="space-y-2">
                  <Label htmlFor="media">Upload Media</Label>
                  <Input
                    id="media"
                    type="file"
                    accept={typeOfStory === "video" ? "video/*" : "image/*"}
                    onChange={handleMediaChange}
                  />
                  {mediaPreview && (
                    <div className="mt-4">
                      {typeOfStory === "video" ? (
                        <video src={mediaPreview} controls className="max-w-full h-auto rounded" />
                      ) : (
                        <img src={mediaPreview} alt="Preview" className="max-w-full h-auto rounded" />
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="scheduledAt">Schedule Date & Time</Label>
                <Input
                  id="scheduledAt"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>

              <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={loading || uploading}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {uploading ? "Uploading..." : "Updating..."}
                    </>
                  ) : (
                    "Update Story"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/stories")}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
