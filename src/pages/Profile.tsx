import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
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
import {
  Pencil, Save, X, Camera, Loader2, Copy, LogOut, RefreshCw,
  Trash2, UserRound, PlugZap, Check, Crown, Mail, Hash,
  Link2, ShieldCheck, Upload, ImagePlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PLATFORM_COLORS: Record<string, string> = {
  linkedin:  "bg-[#0077B5]/15 text-[#0077B5] border-[#0077B5]/30",
  facebook:  "bg-[#1877F2]/15 text-[#1877F2] border-[#1877F2]/30",
  instagram: "bg-gradient-to-r from-[#F58529]/15 via-[#DD2A7B]/15 to-[#8134AF]/15 text-[#DD2A7B] border-[#DD2A7B]/30",
  twitter:   "bg-[#1DA1F2]/15 text-[#1DA1F2] border-[#1DA1F2]/30",
  x:         "bg-foreground/10 text-foreground border-foreground/20",
  openai:    "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
};

const platformColor = (p: string) =>
  PLATFORM_COLORS[p.toLowerCase()] ?? "bg-primary/10 text-primary border-primary/20";

// ── Inline copy button ──────────────────────────────────────────────────────
function CopyButton({ text, label }: { text: string; label: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: "Copied!", description: `${label} copied to clipboard.` });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Clipboard access was blocked.", variant: "destructive" });
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-md hover:bg-primary/10"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3 hover:border-primary/30 hover:shadow-sm transition-all">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-semibold truncate">{value}</p>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
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

  // Avatar
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarRemoveOpen, setAvatarRemoveOpen] = useState(false);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [avatarDragActive, setAvatarDragActive] = useState(false);

  // Integrations
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [activePlatforms, setActivePlatforms] = useState<string[]>([]);

  useEffect(() => { void fetchProfile(); }, [user?.id]);
  useEffect(() => { if (user) void fetchIntegrationsSummary(); }, [user?.id]);

  const fetchProfile = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (error) throw error;
      if (data) { setProfile(data); setEditedName(data.name); }
    } catch { toast({ title: "Error", description: "Failed to load profile", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const fetchIntegrationsSummary = async () => {
    if (!user) return;
    setIntegrationsLoading(true);
    try {
      const { data, error } = await supabase
        .from("platform_integrations").select("platform_name")
        .eq("user_id", user.id).eq("status", "active");
      if (error) throw error;
      setActivePlatforms((data || []).map((r: any) => String(r.platform_name || "").toLowerCase()).filter(Boolean));
    } catch { toast({ title: "Error", description: "Failed to load integrations.", variant: "destructive" }); }
    finally { setIntegrationsLoading(false); }
  };

  const handleSaveName = async () => {
    if (!user) return;
    const trimmed = editedName.trim();
    if (!trimmed) { toast({ title: "Name required", description: "Please enter a valid name.", variant: "destructive" }); return; }
    setSavingName(true);
    try {
      const { error } = await supabase.from("profiles").update({ name: trimmed }).eq("id", user.id);
      if (error) throw error;
      setProfile((prev) => (prev ? { ...prev, name: trimmed } : null));
      setIsEditingName(false);
      toast({ title: "Saved ✓", description: "Your name was updated." });
    } catch { toast({ title: "Error", description: "Failed to update name.", variant: "destructive" }); }
    finally { setSavingName(false); }
  };

  const validateAvatarFile = (file: File) => {
    if (!file.type.startsWith("image/")) { toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" }); return false; }
    if (file.size > 5 * 1024 * 1024) { toast({ title: "File too large", description: "Image must be ≤ 5 MB.", variant: "destructive" }); return false; }
    return true;
  };

  const resetAvatarSelection = () => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setSelectedAvatarFile(null); setAvatarPreviewUrl(null); setAvatarDragActive(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectAvatarFile = (file: File) => {
    if (!validateAvatarFile(file)) return;
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setSelectedAvatarFile(file); setAvatarPreviewUrl(URL.createObjectURL(file));
  };

  useEffect(() => () => { if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl); }, [avatarPreviewUrl]);

  const handleUploadAvatar = async () => {
    if (!user || !selectedAvatarFile) return;
    setUploadingAvatar(true);
    try {
      if (profile?.avatar_url) {
        const old = profile.avatar_url.split("/").pop();
        if (old) await supabase.storage.from("post-media").remove([`avatars/${user.id}/${old}`]);
      }
      const ext = selectedAvatarFile.name.split(".").pop();
      const path = `avatars/${user.id}/${Date.now()}.${ext || "jpg"}`;
      const { error: upErr } = await supabase.storage.from("post-media").upload(path, selectedAvatarFile);
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("post-media").getPublicUrl(path);
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
      if (updErr) throw updErr;
      setProfile((prev) => (prev ? { ...prev, avatar_url: publicUrl } : null));
      resetAvatarSelection(); setAvatarSheetOpen(false);
      toast({ title: "Updated ✓", description: "Profile picture updated." });
    } catch { toast({ title: "Error", description: "Failed to upload picture.", variant: "destructive" }); }
    finally { setUploadingAvatar(false); }
  };

  const handleRemoveAvatar = async () => {
    if (!user || !profile?.avatar_url) return;
    try {
      const old = profile.avatar_url.split("/").pop();
      if (old) await supabase.storage.from("post-media").remove([`avatars/${user.id}/${old}`]);
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
      if (error) throw error;
      setProfile((prev) => (prev ? { ...prev, avatar_url: null } : null));
      toast({ title: "Removed", description: "Profile picture removed." });
    } catch { toast({ title: "Error", description: "Failed to remove picture.", variant: "destructive" }); }
    finally { setAvatarRemoveOpen(false); }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const profileCompletion = useMemo(() => {
    if (!profile) return 0;
    const fields = [!!profile.name?.trim(), !!profile.avatar_url, !!profile.email?.trim()];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [profile]);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
        <div className="h-56 rounded-2xl bg-muted/40" />
        <div className="grid grid-cols-3 gap-4">
          {[0,1,2].map(i => <div key={i} className="h-16 rounded-xl bg-muted/30" />)}
        </div>
        <div className="h-48 rounded-2xl bg-muted/30" />
      </div>
    );
  }

  const avatarSrc = avatarPreviewUrl || profile?.avatar_url || "";

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">

      {/* ── Hero card ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        {/* Gradient banner */}
        <div className="h-28 bg-gradient-to-br from-primary/20 via-primary/10 to-purple-500/10" />

        {/* Content row */}
        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            {/* Avatar + name */}
            <div className="flex items-end gap-4 -mt-12">
              <div className="relative shrink-0">
                <Avatar className="h-24 w-24 ring-4 ring-card shadow-xl">
                  {avatarSrc && <AvatarImage src={avatarSrc} alt={profile?.name || "User"} />}
                  <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                    {profile?.name ? getInitials(profile.name) : user?.email?.[0]?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => setAvatarSheetOpen(true)}
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-110"
                  aria-label="Change photo"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mb-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold tracking-tight">{profile?.name || "User"}</h1>
                  {isAdmin ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/25">
                      <Crown className="h-3 w-3" /> Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                      <ShieldCheck className="h-3 w-3" /> Client
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate("/accounts")}>
                <Link2 className="h-4 w-4 mr-2" /> Integrations
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <LogOut className="h-4 w-4 mr-2" /> Sign out
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sign out?</AlertDialogTitle>
                    <AlertDialogDescription>You will be signed out of your account.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void signOut()}>
                      Sign out
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Profile completion */}
          <div className="mt-5 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-medium">Profile completion</span>
              <span className={`font-bold ${profileCompletion === 100 ? "text-emerald-600" : "text-primary"}`}>
                {profileCompletion}%
              </span>
            </div>
            <Progress value={profileCompletion} className="h-2" />
            {profileCompletion < 100 && (
              <p className="text-xs text-muted-foreground">
                {!profile?.avatar_url && "Add a profile photo · "}
                {!profile?.name?.trim() && "Set your name"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Stat chips ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={UserRound}  label="Display name"           value={profile?.name || "—"}                       color="bg-primary/10 text-primary" />
        <StatCard icon={PlugZap}    label="Connected platforms"    value={`${activePlatforms.length} active`}           color="bg-violet-500/10 text-violet-600" />
        <StatCard icon={ShieldCheck} label="Role"                  value={isAdmin ? "Administrator" : "Client"}         color="bg-amber-500/10 text-amber-600" />
      </div>

      {/* ── Profile details card ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/60 px-6 py-4 bg-muted/20">
          <UserRound className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Profile details</h2>
        </div>

        <div className="divide-y divide-border/50">
          {/* Name row */}
          <div className="px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 flex-1 min-w-0">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Display Name</Label>
                {isEditingName ? (
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      id="name"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      placeholder="Enter your name"
                      disabled={savingName}
                      className="h-9 max-w-xs"
                      onKeyDown={(e) => { if (e.key === "Enter") void handleSaveName(); if (e.key === "Escape") { setEditedName(profile?.name || ""); setIsEditingName(false); } }}
                      autoFocus
                    />
                    <Button size="sm" onClick={() => void handleSaveName()} disabled={savingName}>
                      {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditedName(profile?.name || ""); setIsEditingName(false); }} disabled={savingName}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-foreground font-medium mt-1">{profile?.name || <span className="text-muted-foreground italic">Not set</span>}</p>
                )}
              </div>
              {!isEditingName && (
                <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setIsEditingName(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                </Button>
              )}
            </div>
          </div>

          {/* Email row */}
          <div className="px-6 py-5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email address</Label>
            <div className="flex items-center justify-between gap-3 mt-1">
              <div className="flex items-center gap-2 min-w-0">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-foreground font-medium truncate">{profile?.email}</span>
              </div>
              <CopyButton text={profile?.email || ""} label="Email" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Email changes are handled through authentication settings.</p>
          </div>

          {/* User ID row */}
          <div className="px-6 py-5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">User ID</Label>
            <div className="flex items-start justify-between gap-3 mt-1">
              <div className="flex items-start gap-2 min-w-0">
                <Hash className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <code className="text-xs text-muted-foreground font-mono break-all leading-5">{user?.id}</code>
              </div>
              <CopyButton text={user?.id || ""} label="User ID" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Connected integrations card ─────────────────────────────────── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-2">
            <PlugZap className="h-4 w-4 text-violet-600" />
            <h2 className="text-sm font-semibold">Connected integrations</h2>
            {activePlatforms.length > 0 && (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {activePlatforms.length}
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void fetchIntegrationsSummary()} disabled={integrationsLoading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${integrationsLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {activePlatforms.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/40">
                <PlugZap className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No integrations connected</p>
              <p className="text-xs text-muted-foreground">Connect your social accounts to start publishing.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {activePlatforms.map((p) => (
                <span
                  key={p}
                  className={`inline-flex items-center capitalize px-3 py-1.5 rounded-full text-xs font-semibold border ${platformColor(p)}`}
                >
                  {p}
                </span>
              ))}
            </div>
          )}

          <Button variant="outline" onClick={() => navigate("/accounts")} className="gap-2">
            <Link2 className="h-4 w-4" /> Manage integrations
          </Button>
        </div>
      </div>

      {/* ── Danger zone ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-destructive/20 px-6 py-4">
          <LogOut className="h-4 w-4 text-destructive" />
          <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
        </div>
        <div className="px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium">Sign out of your account</p>
            <p className="text-xs text-muted-foreground">You will need to log in again to access your dashboard.</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out?</AlertDialogTitle>
                <AlertDialogDescription>You will be signed out of your account.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void signOut()}>
                  Sign out
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* ── Avatar upload sheet ─────────────────────────────────────────── */}
      <Sheet open={avatarSheetOpen} onOpenChange={(open) => { setAvatarSheetOpen(open); if (!open) resetAvatarSelection(); }}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>Change profile photo</SheetTitle>
            <SheetDescription>Upload a new photo. PNG, JPG, GIF, WEBP — max 5 MB.</SheetDescription>
          </SheetHeader>

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            className={`mt-6 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 cursor-pointer transition-all ${
              avatarDragActive ? "border-primary bg-primary/5 scale-[1.01]" : "border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/30"
            }`}
            onDragEnter={(e) => { e.preventDefault(); setAvatarDragActive(true); }}
            onDragOver={(e) => { e.preventDefault(); setAvatarDragActive(true); }}
            onDragLeave={(e) => { e.preventDefault(); setAvatarDragActive(false); }}
            onDrop={(e) => { e.preventDefault(); setAvatarDragActive(false); const f = e.dataTransfer.files?.[0]; if (f) selectAvatarFile(f); }}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ImagePlus className="h-6 w-6" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Drag & drop or click to browse</p>
              <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, GIF, WEBP up to 5 MB</p>
            </div>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) selectAvatarFile(f); }} disabled={uploadingAvatar} />

          {/* Preview */}
          {avatarPreviewUrl && (
            <div className="mt-5 flex items-center gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              <Avatar className="h-16 w-16 ring-2 ring-primary/20">
                <AvatarImage src={avatarPreviewUrl} alt="Preview" />
                <AvatarFallback>{profile?.name ? getInitials(profile.name) : "U"}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium">New photo</p>
                <p className="text-xs text-muted-foreground truncate">{selectedAvatarFile?.name}</p>
                <p className="text-xs text-muted-foreground">{selectedAvatarFile ? `${(selectedAvatarFile.size / 1024).toFixed(0)} KB` : ""}</p>
              </div>
              <Button variant="ghost" size="icon" className="ml-auto shrink-0" onClick={resetAvatarSelection}><X className="h-4 w-4" /></Button>
            </div>
          )}

          <div className="flex-1" />

          <SheetFooter className="pt-4 flex gap-2">
            {profile?.avatar_url && (
              <Button variant="outline" className="text-destructive hover:text-destructive border-destructive/30" onClick={() => setAvatarRemoveOpen(true)} disabled={uploadingAvatar}>
                <Trash2 className="h-4 w-4 mr-2" /> Remove
              </Button>
            )}
            <Button className="flex-1" onClick={() => void handleUploadAvatar()} disabled={uploadingAvatar || !selectedAvatarFile}>
              {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload photo
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Remove avatar dialog ────────────────────────────────────────── */}
      <AlertDialog open={avatarRemoveOpen} onOpenChange={setAvatarRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove profile photo?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete your current profile picture.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void handleRemoveAvatar()}>
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
