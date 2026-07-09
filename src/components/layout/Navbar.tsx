import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, Crown } from "lucide-react";
import { TenantSwitcher } from "./TenantSwitcher";

export function Navbar() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [profileName, setProfileName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [profileLoading, setProfileLoading] = useState(true);
  const fetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (user && fetchedForRef.current !== user.id) {
      fetchedForRef.current = user.id;
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("name, avatar_url")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfileName(data.name || "");
        setAvatarUrl(data.avatar_url || "");
      }
    } finally {
      setProfileLoading(false);
    }
  };

  const getInitials = (name: string) => {
    // Always use email as safe fallback — never an empty "U"
    const fallback = user?.email?.[0]?.toUpperCase() ?? "?";
    if (!name) return fallback;
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Use email-based values immediately so the pill is never blank on first render
  const displayName = profileName || user?.email?.split("@")[0] || "User";
  const displayEmail = user?.email ?? "";

  return (
    <header className="h-16 border-b border-border/60 bg-card/80 backdrop-blur-sm flex items-center px-4 sticky top-0 z-50 shadow-sm">
      {/* Left: sidebar trigger + tenant switcher */}
      <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
      <div className="ml-3">
        <TenantSwitcher />
      </div>

      {/* Spacer */}
      <div className="flex-1" />


      {/* Right: user profile pill */}
      {profileLoading ? (
        /* Skeleton — same dimensions as the real pill so layout never shifts */
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-1.5 shadow-sm">
          {/* Avatar skeleton */}
          <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
          {/* Text skeleton */}
          <div className="hidden sm:flex flex-col gap-1.5">
            <div className="h-3 w-24 rounded bg-muted animate-pulse" />
            <div className="h-2.5 w-36 rounded bg-muted/70 animate-pulse" />
          </div>
          {/* Chevron skeleton */}
          <div className="hidden sm:block h-3 w-3 rounded bg-muted/50 animate-pulse" />
        </div>
      ) : (
        <button
          onClick={() => navigate("/profile")}
          className="group flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 hover:bg-accent/60 hover:border-primary/30 px-3 py-1.5 transition-all duration-200 shadow-sm hover:shadow-md"
          aria-label="Go to profile"
        >
          {/* Avatar */}
          <Avatar className="h-8 w-8 ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all">
            <AvatarImage src={avatarUrl} alt={displayName} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {getInitials(profileName)}
            </AvatarFallback>
          </Avatar>

          {/* Name + email stack */}
          <div className="hidden sm:flex flex-col items-start leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate max-w-[140px]">
                {displayName}
              </span>
              {isAdmin && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/20">
                  <Crown className="h-2.5 w-2.5" />
                  Admin
                </span>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">
              {displayEmail}
            </span>
          </div>

          {/* Chevron */}
          <ChevronRight className="hidden sm:block h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </button>
      )}
    </header>
  );
}
