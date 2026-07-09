import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { AnalyticsPanel } from "@/pages/Analytics";
import { 
  FileText, 
  Calendar, 
  History,
  CheckCircle2, 
  PlusCircle, 
  Users, 
  Link2, 
  User,
  BookOpen,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Search,
  RotateCcw,
  BarChart3,
  ShieldCheck,
  Images as ImagesIcon,
  LayoutTemplate,
  Settings as SettingsIcon,
  History as HistoryIcon,
  Linkedin,
  Facebook,
  Instagram,
  Youtube,
  Twitter,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SOCIAL_STATUS_PUBLISHED, SOCIAL_STATUS_SCHEDULED } from "@/types/social";
import { RecentActivityFeed, type ActivityItem } from "@/components/posts/RecentActivityFeed";
import { fetchPublishJobsForWorkspace } from "@/lib/api/queue";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Stats {
  totalPosts: number;
  scheduledPosts: number;
  publishedPosts: number;
  totalStories: number;
  scheduledStories: number;
  publishedStories: number;
  queuedPostJobs: number;
  failedPostJobs: number;
  queuedStoryJobs: number;
  failedStoryJobs: number;
}

type DashboardTab = "posts" | "stories" | "analytics";

interface BaseQuickAction {
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  adminOnly?: boolean;
  comingSoon?: boolean;
}

type QuickAction =
  | (BaseQuickAction & { kind: "tab"; tab: DashboardTab })
  | (BaseQuickAction & { kind: "navigate"; path: string });

const platformIcons: Record<string, React.ElementType> = {
  linkedin: Linkedin,
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
  twitter: Twitter,
  x: Twitter,
};

const platformColors: Record<string, string> = {
  linkedin: "text-[#0A66C2]",
  facebook: "text-[#1877F2]",
  instagram: "text-[#E4405F]",
  youtube: "text-[#FF0000]",
  twitter: "text-[#1DA1F2]",
  x: "text-foreground dark:text-foreground",
};

function RecentItemsList({ 
  items, 
  loading, 
  type 
}: { 
  items: ActivityItem[]; 
  loading: boolean; 
  type: "post" | "story"; 
}) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card className="border-none shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 text-primary animate-spin" />
            <span className="ml-2 text-sm text-muted-foreground">Loading recent {type}s...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="border-none shadow-sm bg-muted/30">
        <CardContent className="p-8 text-center">
          <div className="flex flex-col items-center justify-center gap-2">
            {type === "post" ? (
              <FileText className="h-8 w-8 text-muted-foreground opacity-50" />
            ) : (
              <BookOpen className="h-8 w-8 text-muted-foreground opacity-50" />
            )}
            <h3 className="font-semibold text-base mt-2">No recent {type}s</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              You haven't created any {type}s yet. Click the button above to get started.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-sm">
      <CardContent className="p-4 space-y-3">
        {items.map((item) => {
          const Icon = item.type === "post" ? FileText : BookOpen;
          return (
            <div
              key={`${item.type}-${item.id}`}
              onClick={() => {
                if (item.type === "post") {
                  navigate(`/posts/${item.id}/edit`);
                } else {
                  navigate(`/stories/${item.id}/edit`);
                }
              }}
              className="group flex items-center justify-between p-3.5 rounded-xl border border-border/50 hover:border-primary/30 bg-card hover:bg-primary/[0.02] cursor-pointer transition-all duration-300 shadow-sm hover:shadow"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className={`p-2.5 rounded-xl ${
                  item.type === "post" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"
                } group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors duration-300">
                    {item.title || "Untitled"}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Updated {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                {/* Platform Icons */}
                <div className="flex items-center gap-1.5 bg-muted/40 px-2 py-1 rounded-lg">
                  {item.platforms && item.platforms.length > 0 ? (
                    item.platforms.map((platform) => {
                      const PlatformIcon = platformIcons[platform.toLowerCase()];
                      const colorClass = platformColors[platform.toLowerCase()] || "text-muted-foreground";
                      return PlatformIcon ? (
                        <PlatformIcon key={platform} className={`h-4 w-4 ${colorClass}`} />
                      ) : null;
                    })
                  ) : (
                    <span className="text-[10px] text-muted-foreground px-1">No channels</span>
                  )}
                </div>

                {/* Status Badge */}
                <Badge className={`capitalize shadow-none border ${
                  item.status === SOCIAL_STATUS_PUBLISHED
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : item.status === SOCIAL_STATUS_SCHEDULED
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                    : item.status === "failed"
                    ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                    : "bg-muted text-muted-foreground border-muted-foreground/20"
                } text-xs font-semibold px-2 py-0.5 rounded-lg`}>
                  {item.status}
                </Badge>

                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:translate-x-1" />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user, isAdmin, orgId } = useAuth();
  const navigate = useNavigate();
  const [profileName, setProfileName] = useState<string>("");
  const [activeTab, setActiveTab] = useState<DashboardTab>("posts");
  const [commandOpen, setCommandOpen] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalPosts: 0,
    scheduledPosts: 0,
    publishedPosts: 0,
    totalStories: 0,
    scheduledStories: 0,
    publishedStories: 0,
    queuedPostJobs: 0,
    failedPostJobs: 0,
    queuedStoryJobs: 0,
    failedStoryJobs: 0,
  });

  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [recentPosts, setRecentPosts] = useState<ActivityItem[]>([]);
  const [recentStories, setRecentStories] = useState<ActivityItem[]>([]);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(async () => {
    if (!user || !orgId) return;

    setStatsLoading(true);
    setActivityLoading(true);

    const fetchStats = async () => {
      try {
        const [postsRes, storiesRes, jobs] = await Promise.all([
          supabase.from("posts").select("status").eq("organization_id", orgId),
          supabase.from("stories").select("status").eq("organization_id", orgId),
          fetchPublishJobsForWorkspace(orgId),
        ]);

        const posts = postsRes.data || [];
        const stories = storiesRes.data || [];

        const queuedPostJobs = jobs.filter((j) =>
          j.content_type === "post" && ["queued", "publishing", "retrying"].includes(String(j.state))
        ).length;
        const failedPostJobs = jobs.filter((j) =>
          j.content_type === "post" && String(j.state) === "failed"
        ).length;

        const queuedStoryJobs = jobs.filter((j) =>
          j.content_type === "story" && ["queued", "publishing", "retrying"].includes(String(j.state))
        ).length;
        const failedStoryJobs = jobs.filter((j) =>
          j.content_type === "story" && String(j.state) === "failed"
        ).length;

        setStats({
          totalPosts: posts.length,
          scheduledPosts: posts.filter((p) => p.status === SOCIAL_STATUS_SCHEDULED).length,
          publishedPosts: posts.filter((p) => p.status === SOCIAL_STATUS_PUBLISHED).length,
          totalStories: stories.length,
          scheduledStories: stories.filter((s) => s.status === SOCIAL_STATUS_SCHEDULED).length,
          publishedStories: stories.filter((s) => s.status === SOCIAL_STATUS_PUBLISHED).length,
          queuedPostJobs,
          failedPostJobs,
          queuedStoryJobs,
          failedStoryJobs,
        });
      } catch (e) {
        console.error("Failed to load dashboard stats:", e);
        toast.error("Failed to load dashboard stats");
      }
    };

    const fetchActivity = async () => {
      try {
        const [postsRes, storiesRes] = await Promise.all([
          supabase
            .from("posts")
            .select("id,title,status,platforms,updated_at,created_at")
            .eq("organization_id", orgId)
            .order("updated_at", { ascending: false })
            .limit(10),
          supabase
            .from("stories")
            .select("id,title,status,platforms,updated_at,created_at")
            .eq("organization_id", orgId)
            .order("updated_at", { ascending: false })
            .limit(10),
        ]);

        const posts = postsRes.data ?? [];
        const stories = storiesRes.data ?? [];

        const classify = (row: {
          status: string;
          created_at: string;
          updated_at: string;
        }) => {
          if (row.status === SOCIAL_STATUS_PUBLISHED) return "Published";
          if (row.status === SOCIAL_STATUS_SCHEDULED) return "Scheduled";
          if (row.status === "failed") return "Published (failed)";

          const created = new Date(row.created_at).getTime();
          const updated = new Date(row.updated_at).getTime();
          if (Number.isFinite(created) && Number.isFinite(updated) && updated - created < 60_000) {
            return "Created";
          }
          return "Edited";
        };

        const mappedPosts: ActivityItem[] = posts.map((p: any) => ({
          id: p.id,
          type: "post" as const,
          title: `${classify(p)}: ${p.title || "Untitled"}`,
          status: p.status,
          platforms: p.platforms,
          updated_at: p.updated_at,
        }));

        const mappedStories: ActivityItem[] = stories.map((s: any) => ({
          id: s.id,
          type: "story" as const,
          title: `${classify(s)}: ${s.title || "Untitled"}`,
          status: s.status,
          platforms: s.platforms,
          updated_at: s.updated_at,
        }));

        setRecentPosts(mappedPosts);
        setRecentStories(mappedStories);

        const mappedCombined = [...mappedPosts, ...mappedStories].sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );

        setActivityItems(mappedCombined.slice(0, 12));
      } catch (e) {
        console.error("Failed to load recent activity:", e);
        toast.error("Failed to load recent activity");
        setActivityItems([]);
        setRecentPosts([]);
        setRecentStories([]);
      }
    };

    try {
      await Promise.all([fetchStats(), fetchActivity()]);
    } finally {
      setStatsLoading(false);
      setActivityLoading(false);
    }
  }, [user, orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshNonce]);

  useEffect(() => {
    const fetchProfileName = async () => {
      if (!user) return;
      try {
        const { data } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", user.id)
          .single();
        if (data && data.name) {
          setProfileName(data.name);
        }
      } catch (err) {
        console.error("Error fetching user profile name:", err);
      }
    };
    void fetchProfileName();
  }, [user]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key?.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const quickActions: QuickAction[] = [
    {
      title: "Create Post",
      description: "Schedule a new social media post",
      icon: PlusCircle,
      kind: "navigate",
      path: "/posts/create",
      gradient: "from-primary to-accent",
    },
    {
      title: "Create Story",
      description: "Schedule a new story",
      icon: Sparkles,
      kind: "navigate",
      path: "/stories/create",
      gradient: "from-chart-3 to-chart-4",
    },
    {
      title: "My Posts",
      description: "View and manage all your posts",
      icon: FileText,
      kind: "navigate",
      path: "/posts",
      gradient: "from-accent to-primary",
    },
    {
      title: "My Stories",
      description: "View and manage all your stories",
      icon: BookOpen,
      kind: "navigate",
      path: "/stories",
      gradient: "from-chart-4 to-chart-3",
    },
    {
      title: "History",
      description: "View published posts and failed attempts",
      icon: History,
      kind: "navigate",
      path: "/history",
      gradient: "from-chart-4 to-chart-5",
    },
    {
      title: "Analytics",
      description: "Engagement trends and publishing volume",
      icon: BarChart3,
      kind: "tab",
      tab: "analytics",
      gradient: "from-chart-3 to-chart-4",
      comingSoon: true,
    },
    {
      title: "Library",
      description: "Search, tag, and manage media assets",
      icon: ImagesIcon,
      kind: "navigate",
      path: "/library",
      gradient: "from-accent to-chart-4",
    },
    {
      title: "Templates",
      description: "Create reusable caption/text templates",
      icon: LayoutTemplate,
      kind: "navigate",
      path: "/templates",
      gradient: "from-chart-5 to-primary",
    },
    {
      title: "Settings",
      description: "Profile, integrations, and organization controls",
      icon: SettingsIcon,
      kind: "navigate",
      path: "/settings",
      gradient: "from-muted-foreground to-foreground",
      comingSoon: true,
    },
    {
      title: "Connected Accounts",
      description: "Manage your social media accounts",
      icon: Link2,
      kind: "navigate",
      path: "/accounts",
      gradient: "from-chart-5 to-chart-4",
    },
    {
      title: "My Profile",
      description: "View and edit your profile",
      icon: User,
      kind: "navigate",
      path: "/profile",
      gradient: "from-muted-foreground to-foreground",
    },
    {
      title: "User Management",
      description: "Manage users and roles",
      icon: Users,
      kind: "navigate",
      path: "/admin/users",
      gradient: "from-chart-5 to-destructive",
      adminOnly: true,
    },
  ];

  const filteredActions = quickActions.filter(
    (action) => !action.adminOnly || isAdmin
  );

  const postActionTitles = ["Create Post", "My Posts", "History", "Library", "Templates"];
  const postActions = filteredActions.filter(
    (action) => postActionTitles.includes(action.title)
  );
  
  const storyActionTitles = ["Create Story", "My Stories", "History", "Library", "Templates"];
  const storyActions = filteredActions.filter(
    (action) => storyActionTitles.includes(action.title)
  );

  const firstName = profileName ? profileName.trim().split(" ")[0] : "";
  const displayName = firstName || user?.email?.split("@")[0] || "User";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Welcome back! Here's an interactive overview of your content.</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCommandOpen(true)}>
              <Search className="h-4 w-4 mr-2" />
              Command
              <CommandShortcut className="ml-2">Ctrl K</CommandShortcut>
            </Button>
            <Button
              variant="outline"
              onClick={() => setRefreshNonce((n) => n + 1)}
              disabled={statsLoading || activityLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${statsLoading || activityLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Premium Greeting Banner */}
        <Card className="border-none bg-gradient-to-r from-primary/10 via-accent/5 to-background p-6 shadow-sm relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Welcome back, {displayName}! <Sparkles className="h-5 w-5 text-yellow-500 animate-pulse" />
            </h2>
            <p className="text-muted-foreground mt-1 text-sm md:text-base max-w-xl">
              Easily manage posts, track stories, and monitor publishing status in your social media automation account.
            </p>
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-primary/5 to-transparent pointer-events-none rounded-r-lg" />
        </Card>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DashboardTab)}>
          <TabsList className="inline-flex h-11 items-center justify-start rounded-xl bg-muted/60 p-1 text-muted-foreground w-full sm:w-auto">
            <TabsTrigger 
              value="posts" 
              className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex-1 sm:flex-initial"
            >
              Post
            </TabsTrigger>
            <TabsTrigger 
              value="stories" 
              className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex-1 sm:flex-initial"
            >
              Story
            </TabsTrigger>
            <TabsTrigger 
              value="analytics" 
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex-1 sm:flex-initial"
            >
              Analytics
              <span className="text-[10px] bg-primary/10 text-primary font-semibold px-1.5 py-0.5 rounded">
                Soon
              </span>
            </TabsTrigger>
          </TabsList>

          {/* Posts Tab Content */}
          <TabsContent value="posts" className="pt-6 space-y-8 animate-in fade-in-50 duration-300">
            <div>
              <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> Post Metrics
              </h2>
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 lg:grid-cols-4">
                {[
                  {
                    title: "Total Posts",
                    value: stats.totalPosts,
                    icon: FileText,
                    color: "text-primary",
                    bgColor: "bg-primary/10",
                  },
                  {
                    title: "Scheduled Posts",
                    value: stats.scheduledPosts,
                    icon: Calendar,
                    color: "text-blue-500 dark:text-blue-400",
                    bgColor: "bg-blue-500/10",
                  },
                  {
                    title: "Published Posts",
                    value: stats.publishedPosts,
                    icon: CheckCircle2,
                    color: "text-emerald-500 dark:text-emerald-400",
                    bgColor: "bg-emerald-500/10",
                  },
                  {
                    title: "Failed Posts",
                    value: stats.failedPostJobs,
                    icon: ShieldCheck,
                    color: "text-destructive",
                    bgColor: "bg-destructive/10",
                  },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <Card key={card.title} className="border-none shadow-sm bg-card hover:bg-accent/[0.02] border border-border/40 transition-all duration-300 hover:shadow">
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">{card.title}</p>
                            <p className="text-2xl sm:text-3xl font-bold mt-1 tracking-tight">{statsLoading ? "…" : card.value}</p>
                          </div>
                          <div className={`p-2.5 sm:p-3 rounded-xl ${card.bgColor} flex-shrink-0 ml-2`}>
                            <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${card.color}`} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-4 text-foreground">Post Actions</h2>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                {postActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Card
                      key={action.title}
                      className={`group cursor-pointer border-none shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden bg-card hover:bg-muted/10 border border-border/40 ${
                        action.comingSoon ? "opacity-75 cursor-not-allowed" : ""
                      }`}
                      onClick={() => {
                        if (action.comingSoon) {
                          toast(`${action.title} is coming soon!`);
                          return;
                        }
                        if (action.kind === "tab") {
                          setActiveTab(action.tab);
                          return;
                        }
                        navigate(action.path);
                      }}
                    >
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className={`flex-shrink-0 p-3 rounded-xl bg-gradient-to-br ${action.gradient} text-primary-foreground group-hover:scale-105 transition-transform duration-300 shadow-sm`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                            {action.title}
                          </h3>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{action.description}</p>
                        </div>
                        <div className="flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-300">
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">Recent Posts</h2>
                <Button variant="ghost" size="sm" onClick={() => navigate("/posts")} className="hover:bg-muted/50 text-muted-foreground hover:text-foreground">
                  View All <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
              <RecentItemsList items={recentPosts} loading={activityLoading} type="post" />
            </div>
          </TabsContent>

          {/* Stories Tab Content */}
          <TabsContent value="stories" className="pt-6 space-y-8 animate-in fade-in-50 duration-300">
            <div>
              <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-accent" /> Story Metrics
              </h2>
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 lg:grid-cols-4">
                {[
                  {
                    title: "Total Stories",
                    value: stats.totalStories,
                    icon: BookOpen,
                    color: "text-accent",
                    bgColor: "bg-accent/10",
                  },
                  {
                    title: "Scheduled Stories",
                    value: stats.scheduledStories,
                    icon: Calendar,
                    color: "text-blue-500 dark:text-blue-400",
                    bgColor: "bg-blue-500/10",
                  },
                  {
                    title: "Published Stories",
                    value: stats.publishedStories,
                    icon: CheckCircle2,
                    color: "text-emerald-500 dark:text-emerald-400",
                    bgColor: "bg-emerald-500/10",
                  },
                  {
                    title: "Failed Stories",
                    value: stats.failedStoryJobs,
                    icon: ShieldCheck,
                    color: "text-destructive",
                    bgColor: "bg-destructive/10",
                  },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <Card key={card.title} className="border-none shadow-sm bg-card hover:bg-accent/[0.02] border border-border/40 transition-all duration-300 hover:shadow">
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">{card.title}</p>
                            <p className="text-2xl sm:text-3xl font-bold mt-1 tracking-tight">{statsLoading ? "…" : card.value}</p>
                          </div>
                          <div className={`p-2.5 sm:p-3 rounded-xl ${card.bgColor} flex-shrink-0 ml-2`}>
                            <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${card.color}`} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-4 text-foreground">Story Actions</h2>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                {storyActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Card
                      key={action.title}
                      className={`group cursor-pointer border-none shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden bg-card hover:bg-muted/10 border border-border/40 ${
                        action.comingSoon ? "opacity-75 cursor-not-allowed" : ""
                      }`}
                      onClick={() => {
                        if (action.comingSoon) {
                          toast(`${action.title} is coming soon!`);
                          return;
                        }
                        if (action.kind === "tab") {
                          setActiveTab(action.tab);
                          return;
                        }
                        navigate(action.path);
                      }}
                    >
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className={`flex-shrink-0 p-3 rounded-xl bg-gradient-to-br ${action.gradient} text-primary-foreground group-hover:scale-105 transition-transform duration-300 shadow-sm`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                            {action.title}
                          </h3>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{action.description}</p>
                        </div>
                        <div className="flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-300">
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">Recent Stories</h2>
                <Button variant="ghost" size="sm" onClick={() => navigate("/stories")} className="hover:bg-muted/50 text-muted-foreground hover:text-foreground">
                  View All <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
              <RecentItemsList items={recentStories} loading={activityLoading} type="story" />
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="pt-6 animate-in fade-in-50 duration-300">
            <Card className="border-none bg-gradient-to-br from-card via-card to-accent/5 shadow-lg relative overflow-hidden">
              <CardContent className="p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
                {/* Background decorative elements */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                
                <div className="relative z-10 flex flex-col items-center max-w-md gap-5">
                  <div className="p-5 rounded-2xl bg-primary/10 text-primary animate-pulse shadow-sm border border-primary/20">
                    <BarChart3 className="h-10 w-10" />
                  </div>
                  
                  <div className="space-y-2">
                    <Badge variant="outline" className="px-3 py-1 text-xs font-semibold bg-primary/5 border-primary/20 text-primary uppercase tracking-wider animate-bounce">
                      Coming Soon
                    </Badge>
                    <h3 className="text-2xl font-bold tracking-tight text-foreground mt-2">
                      Analytics Dashboard
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed mt-2">
                      We are building a comprehensive analytics suite to track engagement trends, click-through rates, and publishing volume across all your connected channels. Stay tuned!
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
          <CommandInput placeholder="Search actions…" />
          <CommandList>
            <CommandEmpty>No actions found.</CommandEmpty>

            <CommandGroup heading="Dashboard">
              <CommandItem
                value="Posts Tab"
                onSelect={() => {
                  setActiveTab("posts");
                  setCommandOpen(false);
                }}
              >
                Posts Tab
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>

              <CommandItem
                value="Stories Tab"
                onSelect={() => {
                  setActiveTab("stories");
                  setCommandOpen(false);
                }}
              >
                Stories Tab
              </CommandItem>

              <CommandItem
                value="Analytics"
                onSelect={() => {
                  toast("Analytics is coming soon!");
                  setCommandOpen(false);
                }}
                className="opacity-50"
              >
                Analytics (Coming Soon)
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Create & Manage">
              <CommandItem
                value="Create Post"
                onSelect={() => {
                  navigate("/posts/create");
                  setCommandOpen(false);
                }}
              >
                Create Post
              </CommandItem>
              <CommandItem
                value="Create Story"
                onSelect={() => {
                  navigate("/stories/create");
                  setCommandOpen(false);
                }}
              >
                Create Story
              </CommandItem>
              <CommandItem
                value="My Posts"
                onSelect={() => {
                  navigate("/posts");
                  setCommandOpen(false);
                }}
              >
                My Posts
              </CommandItem>
              <CommandItem
                value="My Stories"
                onSelect={() => {
                  navigate("/stories");
                  setCommandOpen(false);
                }}
              >
                My Stories
              </CommandItem>
              <CommandItem
                value="Connected Accounts"
                onSelect={() => {
                  navigate("/accounts");
                  setCommandOpen(false);
                }}
              >
                Connected Accounts
              </CommandItem>
              <CommandItem
                value="Profile"
                onSelect={() => {
                  navigate("/profile");
                  setCommandOpen(false);
                }}
              >
                Profile
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Workspace tools">
              <CommandItem
                value="Library"
                onSelect={() => {
                  navigate("/library");
                  setCommandOpen(false);
                }}
              >
                Library
              </CommandItem>
              <CommandItem
                value="Templates"
                onSelect={() => {
                  navigate("/templates");
                  setCommandOpen(false);
                }}
              >
                Templates
              </CommandItem>
              <CommandItem
                value="Settings"
                onSelect={() => {
                  toast("Settings is coming soon!");
                  setCommandOpen(false);
                }}
                className="opacity-50"
              >
                Settings (Coming Soon)
              </CommandItem>
            </CommandGroup>

            {isAdmin ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Admin">
                  <CommandItem
                    value="User Management"
                    onSelect={() => {
                      navigate("/admin/users");
                      setCommandOpen(false);
                    }}
                  >
                    User Management
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </CommandDialog>
      </div>
    </DashboardLayout>
  );
}
