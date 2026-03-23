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
import { QueuePanel } from "@/pages/Queue";
import { AnalyticsPanel } from "@/pages/Analytics";
import { 
  FileText, 
  Calendar, 
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
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SOCIAL_STATUS_PUBLISHED, SOCIAL_STATUS_SCHEDULED } from "@/types/social";
import { RecentActivityFeed, type ActivityItem } from "@/components/posts/RecentActivityFeed";
import { fetchPublishJobsForWorkspace } from "@/lib/api/queue";
import { toast } from "sonner";

interface Stats {
  totalPosts: number;
  scheduledPosts: number;
  publishedPosts: number;
  totalStories: number;
  scheduledStories: number;
  publishedStories: number;
  queuedJobs: number;
  failedJobs: number;
}

type DashboardTab = "overview" | "queue" | "analytics";

interface BaseQuickAction {
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  adminOnly?: boolean;
}

type QuickAction =
  | (BaseQuickAction & { kind: "tab"; tab: Exclude<DashboardTab, "overview"> })
  | (BaseQuickAction & { kind: "navigate"; path: string });

export default function Dashboard() {
  const { user, isAdmin, workspaceId } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
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
    queuedJobs: 0,
    failedJobs: 0,
  });

  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(async () => {
    if (!user || !workspaceId) return;

    setStatsLoading(true);
    setActivityLoading(true);

    const fetchStats = async () => {
      try {
        const [postsRes, storiesRes, jobs] = await Promise.all([
          supabase.from("posts").select("status").eq("workspace_id", workspaceId),
          supabase.from("stories").select("status").eq("workspace_id", workspaceId),
          fetchPublishJobsForWorkspace(workspaceId),
        ]);

        const posts = postsRes.data || [];
        const stories = storiesRes.data || [];

        const queuedJobs = jobs.filter((j) =>
          ["queued", "publishing", "retrying"].includes(String(j.state))
        ).length;
        const failedJobs = jobs.filter((j) => String(j.state) === "failed").length;

        setStats({
          totalPosts: posts.length,
          scheduledPosts: posts.filter((p) => p.status === SOCIAL_STATUS_SCHEDULED).length,
          publishedPosts: posts.filter((p) => p.status === SOCIAL_STATUS_PUBLISHED).length,
          totalStories: stories.length,
          scheduledStories: stories.filter((s) => s.status === SOCIAL_STATUS_SCHEDULED).length,
          publishedStories: stories.filter((s) => s.status === SOCIAL_STATUS_PUBLISHED).length,
          queuedJobs,
          failedJobs,
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
            .eq("workspace_id", workspaceId)
            .order("updated_at", { ascending: false })
            .limit(10),
          supabase
            .from("stories")
            .select("id,title,status,platforms,updated_at,created_at")
            .eq("workspace_id", workspaceId)
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

        const mapped: ActivityItem[] = [
          ...posts.map((p: any) => ({
            id: p.id,
            type: "post",
            title: `${classify(p)}: ${p.title || "Untitled"}`,
            status: p.status,
            platforms: p.platforms,
            updated_at: p.updated_at,
          })),
          ...stories.map((s: any) => ({
            id: s.id,
            type: "story",
            title: `${classify(s)}: ${s.title || "Untitled"}`,
            status: s.status,
            platforms: s.platforms,
            updated_at: s.updated_at,
          })),
        ].sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );

        setActivityItems(mapped.slice(0, 12));
      } catch (e) {
        console.error("Failed to load recent activity:", e);
        toast.error("Failed to load recent activity");
        setActivityItems([]);
      }
    };

    try {
      await Promise.all([fetchStats(), fetchActivity()]);
    } finally {
      setStatsLoading(false);
      setActivityLoading(false);
    }
  }, [user, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshNonce]);

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

  const statCards = [
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
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
    },
    {
      title: "Published Posts",
      value: stats.publishedPosts,
      icon: CheckCircle2,
      color: "text-chart-3",
      bgColor: "bg-chart-3/10",
    },
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
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
    },
    {
      title: "Published Stories",
      value: stats.publishedStories,
      icon: CheckCircle2,
      color: "text-chart-3",
      bgColor: "bg-chart-3/10",
    },
    {
      title: "Queued Jobs",
      value: stats.queuedJobs,
      icon: RotateCcw,
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
    },
    {
      title: "Failed Jobs",
      value: stats.failedJobs,
      icon: ShieldCheck,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
  ];

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
      title: "Queue",
      description: "View publishing jobs and retry failures",
      icon: RotateCcw,
      kind: "tab",
      tab: "queue",
      gradient: "from-chart-4 to-chart-5",
    },
    {
      title: "Analytics",
      description: "Engagement trends and publishing volume",
      icon: BarChart3,
      kind: "tab",
      tab: "analytics",
      gradient: "from-chart-3 to-chart-4",
    },
    {
      title: "Approvals",
      description: "Review pending scheduled content",
      icon: ShieldCheck,
      kind: "navigate",
      path: "/approvals",
      gradient: "from-primary to-chart-3",
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
      description: "Profile, integrations, and workspace controls",
      icon: SettingsIcon,
      kind: "navigate",
      path: "/settings",
      gradient: "from-muted-foreground to-foreground",
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

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DashboardTab)}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="queue">
              Queue
              {stats.failedJobs > 0 ? (
                <Badge variant="destructive" className="ml-2">
                  {stats.failedJobs}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="pt-6">
            <div className="space-y-8">
              <div>
                <h2 className="text-lg font-semibold mb-4">Overview</h2>
                <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
                  {statCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <Card key={card.title} className="border-none shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${card.bgColor}`}>
                              <Icon className={`h-4 w-4 ${card.color}`} />
                            </div>
                            <div>
                              <p className="text-2xl font-bold">{statsLoading ? "…" : card.value}</p>
                              <p className="text-xs text-muted-foreground">{card.title}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <Card
                        key={action.title}
                        className="group cursor-pointer border-none shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden"
                        onClick={() => {
                          if (action.kind === "tab") {
                            setActiveTab(action.tab);
                            return;
                          }
                          navigate(action.path);
                        }}
                      >
                        <CardContent className="p-0">
                          <div className={`h-2 bg-gradient-to-r ${action.gradient}`} />
                          <div className="p-5">
                            <div className="flex items-start justify-between">
                              <div className={`p-3 rounded-xl bg-gradient-to-br ${action.gradient} text-primary-foreground`}>
                                <Icon className="h-5 w-5" />
                              </div>
                              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform group-hover:translate-x-1" />
                            </div>
                            <h3 className="font-semibold mt-4 group-hover:text-primary transition-colors">
                              {action.title}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">{action.description}</p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {!activityLoading && <RecentActivityFeed items={activityItems} loading={false} />}
            </div>
          </TabsContent>

          <TabsContent value="queue" className="pt-6">
            <QueuePanel />
          </TabsContent>

          <TabsContent value="analytics" className="pt-6">
            <AnalyticsPanel />
          </TabsContent>
        </Tabs>

        <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
          <CommandInput placeholder="Search actions…" />
          <CommandList>
            <CommandEmpty>No actions found.</CommandEmpty>

            <CommandGroup heading="Dashboard">
              <CommandItem
                value="Overview"
                onSelect={() => {
                  setActiveTab("overview");
                  setCommandOpen(false);
                }}
              >
                Overview
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
              <CommandItem
                value="Queue"
                onSelect={() => {
                  setActiveTab("queue");
                  setCommandOpen(false);
                }}
              >
                Queue
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
              <CommandItem
                value="Analytics"
                onSelect={() => {
                  setActiveTab("analytics");
                  setCommandOpen(false);
                }}
              >
                Analytics
                <CommandShortcut>↵</CommandShortcut>
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
                value="Approvals"
                onSelect={() => {
                  navigate("/approvals");
                  setCommandOpen(false);
                }}
              >
                Approvals
              </CommandItem>
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
                  navigate("/settings");
                  setCommandOpen(false);
                }}
              >
                Settings
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
