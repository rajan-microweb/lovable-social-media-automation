import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Bell, 
  Shield, 
  Palette, 
  Globe, 
  CreditCard, 
  History, 
  Users, 
  Key, 
  Mail, 
  Settings as SettingsIcon,
  Moon,
  Sun,
  Laptop,
  CheckCircle2,
  ExternalLink,
  Save
} from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";

export function SettingsPanel() {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const { theme, setTheme, accentColor, setAccentColor } = useTheme();
  const [activeTab, setActiveTab] = useState("general");
  const [loading, setLoading] = useState(false);

  // settings State
  const [settings, setSettings] = useState({
    wsName: "SocialPro Automation",
    wsSlug: "my-brand",
    language: "en",
    timezone: "utc",
    compactSidebar: false,
    emailFailures: true,
    emailSummary: true,
    emailQueue: false,
    appAlerts: true,
    appPush: false
  });

  const updateSetting = (key: keyof typeof settings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    setLoading(false);
    
    toast({
      title: "Settings Saved",
      description: "Your workspace preferences have been updated successfully.",
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <SettingsIcon className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold tracking-widest text-primary uppercase">Workspace</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1 text-lg">Manage your workspace configuration and preferences.</p>
        </div>
        <div className="flex items-center gap-3">
           <Button variant="ghost" className="h-10 hover:bg-muted" onClick={() => navigate("/history")}>
             <History className="h-4 w-4 mr-2" />
             View Logs
           </Button>
           <Button 
            className="h-10 px-6 font-bold shadow-lg shadow-primary/20" 
            onClick={handleSave}
            disabled={loading}
           >
             {loading ? <Save className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
             Save Changes
           </Button>
        </div>
      </div>

      <Tabs defaultValue="general" value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex overflow-x-auto pb-2 scrollbar-hide">
          <TabsList className="bg-muted/50 p-1 rounded-xl h-12 w-full md:w-auto flex justify-start">
            <TabsTrigger value="general" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
              <Globe className="h-4 w-4 mr-2" /> General
            </TabsTrigger>
            <TabsTrigger value="appearance" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
              <Palette className="h-4 w-4 mr-2" /> Appearance
            </TabsTrigger>
            <TabsTrigger value="notifications" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
              <Bell className="h-4 w-4 mr-2" /> Notifications
            </TabsTrigger>
            <TabsTrigger value="members" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
              <Users className="h-4 w-4 mr-2" /> Members
            </TabsTrigger>
            <TabsTrigger value="security" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
              <Shield className="h-4 w-4 mr-2" /> Security & API
            </TabsTrigger>
            <TabsTrigger value="billing" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
              <CreditCard className="h-4 w-4 mr-2" /> Billing
            </TabsTrigger>
          </TabsList>
        </div>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6 mt-0">
          <div className="grid gap-6">
            <Card className="border-none shadow-md bg-card/60 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Workspace Profile</CardTitle>
                <CardDescription>Configure your organization's primary identity.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="ws-name">Workspace Name</Label>
                    <Input 
                      id="ws-name" 
                      value={settings.wsName} 
                      onChange={(e) => updateSetting("wsName", e.target.value)}
                      placeholder="Acme Inc." 
                      className="h-11 rounded-lg" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ws-slug">Workspace URL</Label>
                    <div className="flex items-center gap-2">
                      <div className="bg-muted h-11 px-3 flex items-center rounded-lg text-sm font-medium border text-muted-foreground whitespace-nowrap">
                        socialpro.ai/
                      </div>
                      <Input 
                        id="ws-slug" 
                        value={settings.wsSlug} 
                        onChange={(e) => updateSetting("wsSlug", e.target.value)}
                        placeholder="slug" 
                        className="h-11 rounded-lg" 
                      />
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Primary Contact Email</Label>
                  <Input value={user?.email || ""} className="h-11 rounded-lg" disabled />
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Contact our support to change your primary account email.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Default Language</Label>
                    <Select value={settings.language} onValueChange={(v) => updateSetting("language", v)}>
                      <SelectTrigger className="h-11 rounded-lg">
                        <SelectValue placeholder="Select Language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English (US)</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="de">Deutsch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Timezone</Label>
                    <Select value={settings.timezone} onValueChange={(v) => updateSetting("timezone", v)}>
                      <SelectTrigger className="h-11 rounded-lg">
                        <SelectValue placeholder="Select Timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="utc">UTC (GMT+0)</SelectItem>
                        <SelectItem value="est">EST (GMT-5)</SelectItem>
                        <SelectItem value="pst">PST (GMT-8)</SelectItem>
                        <SelectItem value="ist">IST (GMT+5:30)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground italic">Required for accurate publishing schedules.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-card/60 backdrop-blur-sm border-l-4 border-l-primary">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Accounts & Integrations</CardTitle>
                  <CardDescription>Manage your connected social media channels.</CardDescription>
                </div>
                <Button variant="outline" size="sm" className="h-9 font-bold rounded-lg" onClick={() => navigate("/accounts")}>
                  Manage Accounts <ExternalLink className="h-3 ml-2" />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {["Instagram", "Facebook", "LinkedIn", "Twitter"].map((platform) => (
                    <div key={platform} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/30 border border-border/40 min-w-[160px]">
                      <div className="h-8 w-8 rounded-full bg-background flex items-center justify-center text-primary border border-primary/20">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <span className="font-semibold text-sm">{platform}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Appearance Settings */}
        <TabsContent value="appearance" className="space-y-6 mt-0">
          <Card className="border-none shadow-md bg-card/60 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Interface Customization</CardTitle>
              <CardDescription>Make the dashboard feel more like your own.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="space-y-4">
                <Label className="text-base font-bold">Theme Mode</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                   <div 
                    className={cn(
                      "cursor-pointer group rounded-xl overflow-hidden border-2 transition-all p-4 flex flex-col items-center gap-3 bg-muted/20",
                      theme === "light" ? "border-primary bg-background shadow-md" : "border-transparent opacity-60 hover:opacity-100"
                    )}
                    onClick={() => setTheme("light")}
                   >
                      <div className="h-24 w-full bg-white rounded-lg border p-2 flex flex-col gap-2">
                        <div className="h-2 w-1/2 bg-gray-100 rounded" />
                        <div className="h-2 w-3/4 bg-gray-100 rounded" />
                        <div className="mt-auto flex gap-1">
                          <div className="h-4 w-4 rounded bg-primary" />
                          <div className="h-4 w-4 rounded bg-gray-200" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Sun className="h-3 w-3" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Light Mode</span>
                      </div>
                   </div>
                   
                   <div 
                    className={cn(
                      "cursor-pointer group rounded-xl overflow-hidden border-2 transition-all p-4 flex flex-col items-center gap-3 bg-muted/20",
                      theme === "dark" ? "border-primary bg-background shadow-md" : "border-transparent opacity-60 hover:opacity-100"
                    )}
                    onClick={() => setTheme("dark")}
                   >
                      <div className="h-24 w-full bg-slate-900 rounded-lg border border-slate-800 p-2 flex flex-col gap-2">
                        <div className="h-2 w-1/2 bg-slate-800 rounded" />
                        <div className="h-2 w-3/4 bg-slate-800 rounded" />
                        <div className="mt-auto flex gap-1">
                          <div className="h-4 w-4 rounded bg-primary" />
                          <div className="h-4 w-4 rounded bg-slate-800" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Moon className="h-3 w-3" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Dark mode</span>
                      </div>
                   </div>

                   <div 
                    className={cn(
                      "cursor-pointer group rounded-xl overflow-hidden border-2 transition-all p-4 flex flex-col items-center gap-3 bg-muted/20",
                      theme === "system" ? "border-primary bg-background shadow-md" : "border-transparent opacity-60 hover:opacity-100"
                    )}
                    onClick={() => setTheme("system")}
                   >
                      <div className="h-24 w-full bg-gradient-to-br from-white to-slate-900 rounded-lg border p-2 flex items-center justify-center">
                        <Laptop className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Laptop className="h-3 w-3" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">System</span>
                      </div>
                   </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-bold">Accent Color</Label>
                    <p className="text-sm text-muted-foreground">The primary highlight color used throughout the app.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  {["#2563eb", "#d946ef", "#f97316", "#10b981", "#ef4444", "#8b5cf6"].map((color) => (
                    <button 
                      key={color} 
                      className={cn(
                        "h-12 w-12 rounded-full transition-all flex items-center justify-center p-0.5 border-4 border-background",
                        accentColor === color ? "ring-2 ring-primary scale-110 shadow-lg" : "hover:scale-105 opacity-80 hover:opacity-100"
                      )} 
                      style={{ backgroundColor: color }} 
                      onClick={() => setAccentColor(color)}
                    >
                      {accentColor === color && <CheckCircle2 className="h-5 w-5 text-white drop-shadow-sm" />}
                    </button>
                  ))}
                  <button className="h-12 w-12 rounded-full bg-muted border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground hover:bg-muted/80 transition-colors">
                    +
                  </button>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-bold">Compact Sidebar</Label>
                  <p className="text-sm text-muted-foreground">Uses smaller icons and hides text to save screen space.</p>
                </div>
                <Switch 
                  checked={settings.compactSidebar} 
                  onCheckedChange={(checked) => updateSetting("compactSidebar", checked)} 
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Settings */}
        <TabsContent value="notifications" className="space-y-6 mt-0">
          <Card className="border-none shadow-md bg-card/60 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Communication Center</CardTitle>
              <CardDescription>Control how we keep you informed about your automation activity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="font-bold flex items-center gap-2 text-primary">
                  <Mail className="h-4 w-4" /> Email Alerts
                </h3>
                <div className="space-y-4 pt-2">
                   <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Publishing Failures</Label>
                        <p className="text-xs text-muted-foreground">Immediately notify when a post fails to publish.</p>
                      </div>
                      <Switch 
                        checked={settings.emailFailures} 
                        onCheckedChange={(v) => updateSetting("emailFailures", v)} 
                      />
                   </div>
                   <Separator className="opacity-40" />
                   <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Daily Summary</Label>
                        <p className="text-xs text-muted-foreground">Receive a recap of all activity every 24 hours.</p>
                      </div>
                      <Switch 
                        checked={settings.emailSummary} 
                        onCheckedChange={(v) => updateSetting("emailSummary", v)} 
                      />
                   </div>
                   <Separator className="opacity-40" />
                   <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Queue Reminders</Label>
                        <p className="text-xs text-muted-foreground">Notify when the queue is running low on content.</p>
                      </div>
                      <Switch 
                        checked={settings.emailQueue} 
                        onCheckedChange={(v) => updateSetting("emailQueue", v)} 
                      />
                   </div>
                </div>
              </div>

              <div className="pt-6 space-y-4">
                <h3 className="font-bold flex items-center gap-2 text-primary">
                   <Bell className="h-4 w-4" /> App Notifications
                </h3>
                <div className="space-y-4 pt-2">
                   <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>In-App Alerts</Label>
                        <p className="text-xs text-muted-foreground">Show global warnings within the dashboard.</p>
                      </div>
                      <Switch 
                        checked={settings.appAlerts} 
                        onCheckedChange={(v) => updateSetting("appAlerts", v)} 
                      />
                   </div>
                   <Separator className="opacity-40" />
                   <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Desktop Push</Label>
                        <p className="text-xs text-muted-foreground">Receive native OS notifications via your browser.</p>
                      </div>
                      <Switch 
                        checked={settings.appPush} 
                        onCheckedChange={(v) => updateSetting("appPush", v)} 
                      />
                   </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Settings */}
        <TabsContent value="members" className="space-y-6 mt-0">
          <Card className="border-none shadow-md bg-card/60 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Team Management</CardTitle>
                <CardDescription>Collaborate with your coworkers on this workspace.</CardDescription>
              </div>
              <Button size="sm" className="font-bold rounded-lg px-4" disabled={!isAdmin}>
                + Invite Member
              </Button>
            </CardHeader>
            <CardContent>
               <div className="overflow-hidden rounded-xl border border-border/40 bg-muted/10">
                 <table className="w-full text-sm">
                   <thead>
                     <tr className="text-left text-muted-foreground border-b border-border/40 bg-muted/30">
                       <th className="font-bold h-12 px-4 whitespace-nowrap text-[10px] uppercase tracking-widest">User</th>
                       <th className="font-bold h-12 px-4 whitespace-nowrap text-[10px] uppercase tracking-widest">Role</th>
                       <th className="font-bold h-12 px-4 whitespace-nowrap text-[10px] uppercase tracking-widest">Status</th>
                       <th className="font-bold h-12 px-4 whitespace-nowrap text-[10px] uppercase tracking-widest text-right">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-border/20">
                      <tr className="hover:bg-muted/5 transition-colors">
                        <td className="py-4 px-4 font-semibold flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm uppercase border border-primary/20">
                            {user?.email?.charAt(0) || "U"}
                          </div>
                          <div className="flex flex-col">
                             <span className="text-sm font-bold">{user?.email || "You"}</span>
                             <span className="text-[10px] text-muted-foreground opacity-70">primary@workspace.io</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                           <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-tight border border-primary/20">Owner</span>
                        </td>
                        <td className="py-4 px-4">
                           <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                              <span className="text-xs font-bold text-green-600">Active</span>
                           </div>
                        </td>
                        <td className="py-4 px-4 text-right">
                           <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                             <History className="h-3.5 w-3.5 opacity-40 hover:opacity-100 transition-opacity" />
                           </Button>
                        </td>
                      </tr>
                   </tbody>
                 </table>
               </div>
               {!isAdmin && (
                 <div className="mt-4 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 flex gap-4 text-orange-600 items-center">
                    <Shield className="h-5 w-5 shrink-0" />
                    <p className="text-xs font-semibold">You must be a <strong>Workspace Admin</strong> to invite others or manage roles.</p>
                 </div>
               )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security / API Settings */}
        <TabsContent value="security" className="space-y-6 mt-0">
          <div className="grid gap-6">
            <Card className="border-none shadow-md bg-card/60 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Privacy & Security</CardTitle>
                <CardDescription>Protect your workspace and sensitive data.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                 <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="font-bold text-base">Two-Factor Authentication</Label>
                      <p className="text-sm text-muted-foreground">Add an extra layer of security to your login process.</p>
                    </div>
                    <Badge variant="outline" className="h-7 px-4 bg-muted/50 border-border/60">Disabled</Badge>
                 </div>
                 <Separator />
                 <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="font-bold text-base">Log out of all devices</Label>
                      <p className="text-sm text-muted-foreground">Reset your current sessions everywhere except this browser.</p>
                    </div>
                    <Button variant="outline" size="sm" className="h-9 px-6 font-bold border-muted-foreground/30 hover:bg-muted">Log out sessions</Button>
                 </div>
              </CardContent>
            </Card>

            {/* Developers & API section removed temporarily */}
          </div>
        </TabsContent>

        {/* Billing Overview */}
        <TabsContent value="billing" className="space-y-6 mt-0">
          <Card className="border-none shadow-xl bg-card/60 backdrop-blur-sm border-t-4 border-t-primary overflow-hidden">
            <CardHeader className="bg-gradient-to-br from-primary/10 to-transparent pb-8 pt-10 px-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                   <div className="flex items-center gap-3 mb-2">
                     <Badge className="bg-primary text-primary-foreground font-black px-4 h-6 text-[10px] tracking-widest uppercase shadow-lg shadow-primary/20">ACTIVE</Badge>
                     <span className="text-xs font-bold text-primary italic">Renews next month</span>
                   </div>
                   <CardTitle className="text-4xl font-black tracking-tight">Pro Evolution</CardTitle>
                   <CardDescription className="text-base font-medium">Scale your social footprint without limits.</CardDescription>
                </div>
                <div className="flex flex-col items-end">
                   <div className="text-4xl font-black">$49<span className="text-lg text-muted-foreground font-medium">/mo</span></div>
                   <p className="text-[10px] font-bold uppercase tracking-widest mt-1 opacity-50">Monthly subscription</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-10 p-8">
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  <div className="p-6 rounded-2xl bg-muted/30 border border-border/40 shadow-sm flex flex-col gap-1">
                     <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-50">Publish Limit</p>
                     <p className="text-2xl font-black">Unlimited</p>
                     <p className="text-xs text-muted-foreground mt-1">Posts and stories per month</p>
                  </div>
                  <div className="p-6 rounded-2xl bg-muted/30 border border-border/40 shadow-sm flex flex-col gap-1">
                     <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-50">Next Bill Date</p>
                     <p className="text-2xl font-black">May 14, 2026</p>
                     <p className="text-xs text-muted-foreground mt-1">Automatic charge via Visa</p>
                  </div>
                  <div className="p-6 rounded-2xl bg-muted/30 border border-border/40 shadow-sm flex flex-col gap-1">
                     <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-50">Team Seats</p>
                     <p className="text-2xl font-black">5 / 10</p>
                     <p className="text-xs text-muted-foreground mt-1">Active workspace members</p>
                  </div>
               </div>
               
               <Separator />

               <div className="flex flex-col lg:flex-row items-center justify-between gap-8 p-6 rounded-3xl bg-background/40 border border-border/60 shadow-inner">
                  <div className="flex items-center gap-6">
                     <div className="h-16 w-16 rounded-2xl bg-primary/20 flex items-center justify-center text-primary rotate-3 shadow-lg">
                        <CreditCard className="h-8 w-8" />
                     </div>
                     <div className="flex flex-col">
                        <span className="font-black text-lg tracking-tight">Payment Method</span>
                        <div className="flex items-center gap-2 mt-1">
                           <span className="px-2 py-0.5 bg-muted rounded text-[10px] font-bold font-mono">VISA</span>
                           <span className="text-sm text-muted-foreground font-medium">Ending in 4242</span>
                        </div>
                     </div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" size="default" className="h-11 px-8 font-black rounded-xl border-2 hover:bg-muted transition-all">Update Card</Button>
                    <Button variant="ghost" size="default" className="h-11 px-6 font-bold text-muted-foreground rounded-xl">View Invoices</Button>
                  </div>
               </div>
            </CardContent>
            <CardFooter className="bg-muted/30 py-6 px-10 rounded-b-xl flex flex-col sm:flex-row justify-between items-center gap-4">
               <div className="flex items-center gap-2">
                 <div className="h-2 w-2 rounded-full bg-primary" />
                 <span className="text-xs font-bold italic text-muted-foreground">Need a custom enterprise quote for 50+ members?</span>
               </div>
               <Button variant="link" className="text-primary h-auto p-0 font-black text-sm uppercase tracking-wider hover:no-underline hover:opacity-80 transition-all">Contact Sales Support</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function Settings() {
  return (
    <DashboardLayout>
      <div className="py-6 px-4 md:px-0">
        <SettingsPanel />
      </div>
    </DashboardLayout>
  );
}
