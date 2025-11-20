import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { z } from "zod";

const postSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional(),
  type_of_post: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  account_type: z.string().optional(),
  text: z.string().max(5000).optional(),
  image: z.string().url().optional().or(z.literal("")),
  video: z.string().url().optional().or(z.literal("")),
  pdf: z.string().url().optional().or(z.literal("")),
  url: z.string().url().optional().or(z.literal("")),
  tags: z.array(z.string()).optional(),
  status: z.enum(["draft", "scheduled", "published"]),
  scheduled_at: z.string().optional(),
});

export default function EditPost() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [post, setPost] = useState<any>(null);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const platformOptions = [
    { value: "instagram", label: "Instagram" },
    { value: "facebook", label: "Facebook" },
    { value: "linkedin", label: "LinkedIn" },
    { value: "twitter", label: "Twitter" },
    { value: "youtube", label: "YouTube" },
  ];

  useEffect(() => {
    if (!user || !id) return;

    const fetchPost = async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (error) {
        toast.error("Post not found");
        navigate("/posts");
      } else {
        setPost(data);
        setPlatforms(data.platforms || []);
        setTags(data.tags || []);
      }
    };

    fetchPost();
  }, [user, id, navigate]);

  const handlePlatformChange = (platform: string, checked: boolean) => {
    if (checked) {
      setPlatforms([...platforms, platform]);
    } else {
      setPlatforms(platforms.filter((p) => p !== platform));
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      type_of_post: formData.get("type_of_post") as string,
      platforms: platforms.length > 0 ? platforms : null,
      account_type: formData.get("account_type") as string,
      text: formData.get("text") as string,
      image: formData.get("image") as string,
      video: formData.get("video") as string,
      pdf: formData.get("pdf") as string,
      url: formData.get("url") as string,
      tags: tags.length > 0 ? tags : null,
      status: formData.get("status") as string,
      scheduled_at: formData.get("scheduled_at") as string,
    };

    try {
      postSchema.parse(data);

      const { error } = await supabase
        .from("posts")
        .update({
          title: data.title,
          description: data.description || null,
          type_of_post: data.type_of_post || null,
          platforms: data.platforms,
          account_type: data.account_type || null,
          text: data.text || null,
          image: data.image || null,
          video: data.video || null,
          pdf: data.pdf || null,
          url: data.url || null,
          tags: data.tags,
          status: data.status,
          scheduled_at: data.scheduled_at || null,
        })
        .eq("id", id!);

      if (error) throw error;

      toast.success("Post updated successfully");
      navigate("/posts");
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error(error.message || "Failed to update post");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!post) return null;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Edit Post</h1>
          <p className="text-muted-foreground">Update your post details</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Post Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    name="title"
                    placeholder="Post title"
                    defaultValue={post.title}
                    required
                    maxLength={200}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type_of_post">Type of Post</Label>
                  <Select name="type_of_post" defaultValue={post.type_of_post || ""}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text Only</SelectItem>
                      <SelectItem value="image">Image</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="article">Article</SelectItem>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="shorts">Shorts/Reels</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Platforms</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {platformOptions.map((platform) => (
                    <div key={platform.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={platform.value}
                        checked={platforms.includes(platform.value)}
                        onCheckedChange={(checked) =>
                          handlePlatformChange(platform.value, checked as boolean)
                        }
                      />
                      <Label htmlFor={platform.value} className="cursor-pointer">
                        {platform.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="account_type">Account Type</Label>
                <Select name="account_type" defaultValue={post.account_type || ""}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="company">Company</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="text">Content Text</Label>
                <Textarea
                  id="text"
                  name="text"
                  placeholder="Post content..."
                  defaultValue={post.text || ""}
                  rows={6}
                  maxLength={5000}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Post description..."
                  defaultValue={post.description || ""}
                  rows={3}
                  maxLength={2000}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="image">Image URL</Label>
                  <Input
                    id="image"
                    name="image"
                    type="url"
                    placeholder="https://example.com/image.jpg"
                    defaultValue={post.image || ""}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="video">Video URL</Label>
                  <Input
                    id="video"
                    name="video"
                    type="url"
                    placeholder="https://example.com/video.mp4"
                    defaultValue={post.video || ""}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pdf">PDF URL</Label>
                  <Input
                    id="pdf"
                    name="pdf"
                    type="url"
                    placeholder="https://example.com/document.pdf"
                    defaultValue={post.pdf || ""}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="url">Article URL</Label>
                  <Input
                    id="url"
                    name="url"
                    type="url"
                    placeholder="https://example.com/article"
                    defaultValue={post.url || ""}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Add a tag"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <Button type="button" onClick={handleAddTag} variant="outline">
                    Add
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.map((tag) => (
                      <div
                        key={tag}
                        className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-sm flex items-center gap-2"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-destructive"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="status">Status *</Label>
                  <Select name="status" defaultValue={post.status} required>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scheduled_at">Scheduled Date</Label>
                  <Input
                    id="scheduled_at"
                    name="scheduled_at"
                    type="datetime-local"
                    defaultValue={
                      post.scheduled_at
                        ? new Date(post.scheduled_at).toISOString().slice(0, 16)
                        : ""
                    }
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="submit" disabled={loading}>
                  {loading ? "Updating..." : "Update Post"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/posts")}
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