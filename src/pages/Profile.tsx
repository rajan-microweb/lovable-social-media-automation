import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Pencil, Save, X, Camera, Loader2, Copy, LogOut, RefreshCw, Trash2, UserRound, PlugZap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ProfilePanel() {
  const navigate = useNavigate();
  const { user, signOut, isAdmin } = useAuth();
  const { toast } = useToast();

  const [profile, setProfile] = useState<{ name: string; email: string; avatar_url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  // Name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Avatar upload with preview
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarRemoveOpen, setAvatarRemoveOpen] = useState(false);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [avatarDragActive, setAvatarDragActive] = useState(false);

  // Integrations summary
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [activePlatforms, setActivePlatforms] = useState<string[]>([]);

  useEffect(() => {
    void fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    void fetchIntegrationsSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchProfile = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (error) throw error;
      if (data) {
        setProfile(data);
        setEditedName(data.name);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast({
        title: "Error",
        description: "Failed to load profile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchIntegrationsSummary = async () => {
    if (!user) return;
    setIntegrationsLoading(true);
    try {
      const { data, error } = await supabase
        .from("platform_integrations")
        .select("platform_name")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (error) throw error;
      const platforms = (data || []).map((r: any) => String(r.platform_name || "").toLowerCase()).filter(Boolean);
      setActivePlatforms(platforms);
    } catch (error) {
      console.error("Error fetching integrations summary:", error);
      toast({ title: "Error", description: "Failed to load integrations.", variant: "destructive" });
    } finally {
      setIntegrationsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: `${label} copied to clipboard.` });
    } catch (e) {
      console.error(e);
      toast({ title: "Copy failed", description: "Clipboard access was blocked by the browser.", variant: "destructive" });
    }
  };

  const handleSaveName = async () => {
    if (!user) return;
    const trimmed = editedName.trim();
    if (!trimmed) {
      toast({ title: "Name required", description: "Please enter a valid name.", variant: "destructive" });
      return;
    }

    setSavingName(true);
    try {
      const { error } = await supabase.from("profiles").update({ name: trimmed }).eq("id", user.id);
      if (error) throw error;
      setProfile((prev) => (prev ? { ...prev, name: trimmed } : null));
      setIsEditingName(false);
      toast({ title: "Saved", description: "Your profile name was updated." });
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({ title: "Error", description: "Failed to update profile.", variant: "destructive" });
    } finally {
      setSavingName(false);
    }
  };

  const handleCancelName = () => {
    setEditedName(profile?.name || "");
    setIsEditingName(false);
  };

  const validateAvatarFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return false;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Image must be <= 5MB.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const resetAvatarSelection = () => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setSelectedAvatarFile(null);
    setAvatarPreviewUrl(null);
    setAvatarDragActive(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectAvatarFile = (file: File) => {
    if (!validateAvatarFile(file)) return;
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setSelectedAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
  };

  const handleAvatarFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    selectAvatarFile(file);
  };

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const handleUploadAvatar = async () => {
    if (!user || !selectedAvatarFile) return;

    try {
      setUploadingAvatar(true);

      // Delete old avatar if exists
      if (profile?.avatar_url) {
        const oldFilename = profile.avatar_url.split("/").pop();
        if (oldFilename) {
          await supabase.storage.from("post-media").remove([`avatars/${user.id}/${oldFilename}`]);
        }
      }

      const fileExt = selectedAvatarFile.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt || "jpg"}`;
      const filePath = `avatars/${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage.from("post-media").upload(filePath, selectedAvatarFile);
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("post-media").getPublicUrl(filePath);

      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
      if (updateError) throw updateError;

      setProfile((prev) => (prev ? { ...prev, avatar_url: publicUrl } : null));
      resetAvatarSelection();

      toast({ title: "Updated", description: "Profile picture updated successfully." });
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast({ title: "Error", description: "Failed to upload profile picture.", variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user || !profile?.avatar_url) return;

    try {
      const oldFilename = profile.avatar_url.split("/").pop();
      if (!oldFilename) {
        toast({ title: "Error", description: "Could not determine current avatar file.", variant: "destructive" });
        return;
      }

      await supabase.storage.from("post-media").remove([`avatars/${user.id}/${oldFilename}`]);
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
      if (error) throw error;

      setProfile((prev) => (prev ? { ...prev, avatar_url: null } : null));
      toast({ title: "Removed", description: "Your profile picture was removed." });
    } catch (error) {
      console.error("Error removing avatar:", error);
      toast({ title: "Error", description: "Failed to remove profile picture.", variant: "destructive" });
    } finally {
      setAvatarRemoveOpen(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const profileCompletion = useMemo(() => {
    if (!profile) return 0;
    let done = 0;
    const nameOk = Boolean(profile.name?.trim());
    const avatarOk = Boolean(profile.avatar_url);
    const emailOk = Boolean(profile.email?.trim());
    done += nameOk ? 1 : 0;
    done += avatarOk ? 1 : 0;
    done += emailOk ? 1 : 0;
    return Math.round((done / 3) * 100);
  }, [profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  const avatarSrc = avatarPreviewUrl || profile?.avatar_url || "";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
            <p className="text-muted-foreground">Update your photo and account details.</p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/accounts")} className="hidden sm:inline-flex">
              Manage integrations
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign out?</AlertDialogTitle>
                  <AlertDialogDescription>You will be signed out of your account.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void signOut()}
                  >
                    Sign out
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="pb-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="h-20 w-20">
                    {avatarSrc ? <AvatarImage src={avatarSrc} alt={profile?.name || "User"} /> : null}
                    <AvatarFallback className="text-lg">
                      {profile?.name ? getInitials(profile.name) : "U"}
                    </AvatarFallback>
                  </Avatar>

                  <div className="absolute -bottom-2 -right-2 flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-9 w-9 rounded-full"
                      onClick={() => setAvatarSheetOpen(true)}
                      disabled={uploadingAvatar}
                      aria-label="Change profile photo"
                    >
                      {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    </Button>

                    {profile?.avatar_url ? (
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-9 w-9 rounded-full"
                        onClick={() => setAvatarRemoveOpen(true)}
                        disabled={uploadingAvatar}
                        aria-label="Remove profile photo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-2xl">{profile?.name || "User"}</CardTitle>
                    <Badge variant={isAdmin ? "default" : "outline"}>{isAdmin ? "Admin" : "Client"}</Badge>
                  </div>
                  <CardDescription>{profile?.email}</CardDescription>
                </div>
              </div>

              <div className="min-w-[240px]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">Profile completion</p>
                  <p className="text-sm font-medium">{profileCompletion}%</p>
                </div>
                <Progress value={profileCompletion} className="mt-2" />
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" onClick={() => void copyToClipboard(profile?.email || "", "Email")}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy email
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void copyToClipboard(user?.id || "", "User ID")}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy ID
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {selectedAvatarFile ? (
              <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">New photo ready</p>
                    <p className="text-xs text-muted-foreground">{selectedAvatarFile.name}</p>
                  </div>
                  <Badge variant="secondary">Preview</Badge>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => void handleUploadAvatar()} disabled={uploadingAvatar}>
                    {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Upload
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      resetAvatarSelection();
                    }}
                    disabled={uploadingAvatar}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            <Accordion type="multiple" collapsible defaultValue={["profile"]}>
              <AccordionItem value="profile">
                <AccordionTrigger className="px-4 rounded-lg border border-border/50 bg-card hover:bg-muted/30 transition-colors">
                  <span className="inline-flex items-center gap-2">
                    <UserRound className="h-4 w-4" />
                    Profile details
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 w-full">
                        <Label htmlFor="name">Name</Label>
                        {!isEditingName ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsEditingName(true)}
                            className="self-center"
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Button>
                        ) : null}
                      </div>

                      {!isEditingName ? (
                        <p className="text-foreground">{profile?.name || "Not set"}</p>
                      ) : (
                        <div className="space-y-2">
                          <Input
                            id="name"
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            placeholder="Enter your name"
                            disabled={savingName}
                          />
                          <div className="flex gap-2">
                            <Button onClick={() => void handleSaveName()} disabled={savingName}>
                              {savingName ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                              Save
                            </Button>
                            <Button variant="outline" onClick={handleCancelName} disabled={savingName}>
                              <X className="h-4 w-4 mr-2" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label>Email</Label>
                        <Button variant="ghost" size="sm" onClick={() => void copyToClipboard(profile?.email || "", "Email")}>
                          <Copy className="h-4 w-4" />
                          Copy
                        </Button>
                      </div>
                      <p className="text-muted-foreground text-sm break-all">{profile?.email}</p>
                      <p className="text-xs text-muted-foreground">Email updates are handled by authentication.</p>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label>User ID</Label>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-muted-foreground text-xs font-mono break-all">{user?.id}</p>
                        <Button variant="outline" size="sm" onClick={() => void copyToClipboard(user?.id || "", "User ID")}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy
                        </Button>
                      </div>
                    </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="integrations">
                <AccordionTrigger className="px-4 rounded-lg border border-border/50 bg-card hover:bg-muted/30 transition-colors">
                  <span className="inline-flex items-center gap-2">
                    <PlugZap className="h-4 w-4" />
                    Connected integrations
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-sm text-muted-foreground">
                        {activePlatforms.length === 0
                          ? "No active integrations yet."
                          : `${activePlatforms.length} platform(s) connected.`}
                      </p>
                      <Button variant="outline" size="sm" onClick={() => void fetchIntegrationsSummary()} disabled={integrationsLoading}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${integrationsLoading ? "animate-spin" : ""}`} />
                        {integrationsLoading ? "Refreshing..." : "Refresh"}
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {activePlatforms.length > 0
                        ? activePlatforms.map((p) => (
                            <Badge key={p} variant="secondary" className="capitalize">
                              {p}
                            </Badge>
                          ))
                        : null}
                    </div>

                    <Button variant="default" onClick={() => navigate("/accounts")} className="w-full sm:w-auto">
                      Manage integrations
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        <Sheet
          open={avatarSheetOpen}
          onOpenChange={(open) => {
            setAvatarSheetOpen(open);
            if (!open) resetAvatarSelection();
          }}
        >
          <SheetContent side="right" className="w-full sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>Change profile photo</SheetTitle>
              <SheetDescription>
                Drag and drop an image or select a file. Click Upload to apply changes.
              </SheetDescription>
            </SheetHeader>

            <div
              className={`mt-6 rounded-xl border-2 border-dashed p-5 transition-colors ${
                avatarDragActive ? "border-primary bg-primary/5" : "border-border/60 bg-muted/20"
              }`}
              onDragEnter={(e) => {
                e.preventDefault();
                setAvatarDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setAvatarDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setAvatarDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setAvatarDragActive(false);
                const file = e.dataTransfer.files?.[0];
                if (!file) return;
                selectAvatarFile(file);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">Drop your image here</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, GIF, WEBP (max 5MB)</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}>
                  Choose file
                </Button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFileSelected}
              disabled={uploadingAvatar}
            />

            <div className="mt-6 space-y-3">
              <p className="text-sm font-medium">Preview</p>
              <div className="flex items-center gap-3">
                <Avatar className="h-14 w-14">
                  {avatarPreviewUrl ? <AvatarImage src={avatarPreviewUrl} alt="Preview" /> : null}
                  <AvatarFallback>{profile?.name ? getInitials(profile.name) : "U"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground truncate">
                    {selectedAvatarFile ? selectedAvatarFile.name : "No new file selected"}
                  </p>
                  <p className="text-xs text-muted-foreground">Upload applies the change.</p>
                </div>
              </div>
            </div>

            <SheetFooter className="mt-8">
              <div className="flex w-full items-center justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetAvatarSelection();
                    setAvatarSheetOpen(false);
                  }}
                  disabled={uploadingAvatar}
                >
                  Cancel
                </Button>
                <div className="flex gap-2">
                  {profile?.avatar_url ? (
                    <Button variant="destructive" onClick={() => setAvatarRemoveOpen(true)} disabled={uploadingAvatar}>
                      Remove
                    </Button>
                  ) : null}
                  <Button onClick={() => void handleUploadAvatar()} disabled={uploadingAvatar || !selectedAvatarFile}>
                    {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Upload
                  </Button>
                </div>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <AlertDialog open={avatarRemoveOpen} onOpenChange={setAvatarRemoveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove profile photo?</AlertDialogTitle>
              <AlertDialogDescription>This will delete the current avatar for your account.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={uploadingAvatar}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void handleRemoveAvatar()}
                disabled={uploadingAvatar}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
  );
}

export default function Profile() {
  return (
    <DashboardLayout>
      <ProfilePanel />
    </DashboardLayout>
  );
}
