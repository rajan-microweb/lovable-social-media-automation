import {
  LayoutDashboard,
  FileText,
  Image,
  UserCircle,
  Users,
  LogOut,
  CalendarDays,
  ClipboardList,
  Images,
  BarChart3,
  CheckSquare,
  Settings,
  LayoutTemplate,
} from "lucide-react";
import { Fragment, type ElementType } from "react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
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
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { state } = useSidebar();
  const { signOut, isAdmin } = useAuth();
  const collapsed = state === "collapsed";

  const approvalsEnabled = import.meta.env.VITE_ENABLE_APPROVALS === "true";

  const adminItems = isAdmin ? [{ title: "Users", url: "/admin/users", icon: Users }] : [];

  type SectionItem = {
    title: string;
    icon: ElementType;
    url?: string;
    onClick?: () => void;
  };

  const publishItems = [
    { title: "Queue", url: "/queue", icon: ClipboardList },
    approvalsEnabled ? { title: "Approvals", url: "/approvals", icon: CheckSquare } : null,
  ].filter(Boolean) as SectionItem[];

  const navSections: Array<{ label: string; items: SectionItem[] }> = [
    {
      label: "Plan",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "Calendar", url: "/calendar", icon: CalendarDays },
        { title: "Analytics", url: "/analytics", icon: BarChart3 },
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
        { title: "Sign Out", icon: LogOut, onClick: signOut },
      ],
    },
  ];

  if (adminItems.length > 0) {
    navSections.push({
      label: "Admin",
      items: adminItems as SectionItem[],
    });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="flex flex-col h-full">
          <SidebarHeader className="px-4 py-3">
            {!collapsed && <h1 className="text-xl font-bold text-primary">Admin Panel</h1>}
          </SidebarHeader>

          {!collapsed && <SidebarSeparator />}

          {navSections.map((section, idx) => (
            <Fragment key={section.label}>
              {idx > 0 && !collapsed && <SidebarSeparator />}
              <SidebarGroup>
                <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        {item.url ? (
                          <SidebarMenuButton asChild>
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
                          <SidebarMenuButton onClick={item.onClick}>
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
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
