import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

export default function Settings() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-muted-foreground">Settings and integrations hub.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/profile")}>
              Profile
            </Button>
            <Button variant="outline" onClick={() => navigate("/accounts")}>
              Integrations
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="py-8 space-y-3">
              <div>
                <h2 className="text-xl font-semibold">Profile</h2>
                <p className="text-muted-foreground text-sm">
                  Update name, avatar, and other account details.
                </p>
              </div>
              <Button onClick={() => navigate("/profile")} className="w-full">
                Open Profile
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-8 space-y-3">
              <div>
                <h2 className="text-xl font-semibold">Integrations</h2>
                <p className="text-muted-foreground text-sm">
                  Connect social accounts and manage tokens.
                </p>
              </div>
              <Button onClick={() => navigate("/accounts")} className="w-full">
                Open Accounts
              </Button>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardContent className="py-8 space-y-3">
              <div>
                <h2 className="text-xl font-semibold">Users</h2>
                <p className="text-muted-foreground text-sm">
                  Invite workspace members and manage their roles.
                </p>
              </div>
              <Button
                onClick={() => navigate("/settings/users")}
                className="w-full"
                disabled={!isAdmin}
              >
                Open Workspace Users
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

