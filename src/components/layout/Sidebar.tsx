import {
  LayoutDashboard,
  FileText,
  Image,
  UserCircle,
  Users,
  LogOut,
  CalendarDays,
  Images,
  BarChart3,
  CheckSquare,
  Settings,
  LayoutTemplate,
  History,
} from "lucide-react";
import { Fragment, useState, type ElementType } from "react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { state } = useSidebar();
  const { signOut, isAdmin } = useAuth();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const collapsed = state === "collapsed";

  const approvalsEnabled = import.meta.env.VITE_ENABLE_APPROVALS === "true";

  type SectionItem = {
    title: string;
    icon: ElementType;
    url?: string;
    onClick?: () => void;
    comingSoon?: boolean;
  };

  const publishItems = [
    { title: "History", url: "/history", icon: History },
    approvalsEnabled ? { title: "Approvals", url: "/approvals", icon: CheckSquare } : null,
  ].filter(Boolean) as SectionItem[];

  const navSections: Array<{ label: string; items: SectionItem[] }> = [
    {
      label: "Plan",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "Calendar", url: "/calendar", icon: CalendarDays },
      ],
    },
    {
      label: "Content",
      items: [
        { title: "Posts", url: "/posts", icon: FileText },
        { title: "Stories", url: "/stories", icon: Image },
        { title: "Templates", url: "/templates", icon: LayoutTemplate },
        { title: "Library", url: "/library", icon: Images },
      ],
    },
    {
      label: "Publish",
      items: publishItems,
    },
    {
      label: "Settings",
      items: [
        { title: "Accounts", url: "/accounts", icon: UserCircle },
        { title: "Settings", url: "/settings", icon: Settings },
      ],
    },
    {
      label: "Coming Soon",
      items: [
        { title: "Analytics", icon: BarChart3, comingSoon: true },
      ],
    },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-3">
        {!collapsed && <h1 className="text-xl font-bold text-primary">Admin Panel</h1>}
        {collapsed && <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">A</div>}
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {navSections.map((section, idx) => (
          <Fragment key={section.label}>
            {idx > 0 && !collapsed && <SidebarSeparator />}
            <SidebarGroup>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      {item.comingSoon ? (
                        <SidebarMenuButton
                          onClick={() => toast({ title: "Coming Soon", description: `${item.title} is coming soon!` })}
                          tooltip={`${item.title} (Coming Soon)`}
                          className="opacity-60 cursor-not-allowed hover:bg-transparent"
                        >
                          <item.icon className="h-4 w-4 text-muted-foreground" />
                          {!collapsed && (
                            <div className="flex items-center justify-between w-full">
                              <span className="text-muted-foreground">{item.title}</span>
                              <span className="text-[10px] bg-primary/10 text-primary font-semibold px-1.5 py-0.5 rounded ml-2 scale-90 origin-right">
                                Soon
                              </span>
                            </div>
                          )}
                        </SidebarMenuButton>
                      ) : item.url ? (
                        <SidebarMenuButton asChild tooltip={item.title}>
                          <NavLink
                            to={item.url}
                            end
                            className="hover:bg-sidebar-accent"
                            activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                          >
                            <item.icon className="h-4 w-4" />
                            {!collapsed && <span>{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton onClick={item.onClick} tooltip={item.title}>
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </Fragment>
        ))}
      </SidebarContent>

      <SidebarSeparator />
      
      <SidebarFooter className="p-4">
        <SidebarMenu>
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Users">
                <NavLink
                  to="/admin/users"
                  end
                  className="hover:bg-sidebar-accent"
                  activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                >
                  <Users className="h-4 w-4" />
                  {!collapsed && <span>Users</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
              <SidebarMenuButton 
                onClick={() => setSignOutOpen(true)} 
                tooltip="Sign Out"
                className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                {!collapsed && <span className="font-semibold">Sign Out</span>}
              </SidebarMenuButton>
              <AlertDialogContent className="z-[100]">
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign out?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You will be signed out of your account.
                  </AlertDialogDescription>
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
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
