import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NavLink } from "react-router-dom";
import { CreditCard, ScrollText, Users, UserCircle, Building2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const items = [
  { to: "/settings/organization", icon: Building2, title: "Organization", desc: "Name, timezone, and general settings.", adminOnly: false },
  { to: "/settings/users", icon: Users, title: "Members", desc: "Invite and manage teammates.", adminOnly: true },
  { to: "/settings/billing", icon: CreditCard, title: "Billing & Plans", desc: "Plan, usage, and invoices.", adminOnly: true },
  { to: "/settings/audit", icon: ScrollText, title: "Audit log", desc: "See recent actions and changes.", adminOnly: true },
  { to: "/accounts", icon: UserCircle, title: "Connected accounts", desc: "Social platform integrations.", adminOnly: false },
];

export default function Settings() {
  const { isAdmin } = useAuth();
  const visible = items.filter((i) => !i.adminOnly || isAdmin);
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your organization, members, billing, and integrations.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((it) => (
            <NavLink key={it.to} to={it.to}>
              <Card className="transition hover:border-primary hover:shadow-sm cursor-pointer">
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <it.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{it.title}</CardTitle>
                    <CardDescription className="text-xs">{it.desc}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </NavLink>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
