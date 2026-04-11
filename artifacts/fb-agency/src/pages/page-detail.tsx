import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetPage, getGetPageQueryKey,
  useUpdatePage, useUpdatePageAutomation, useUpdatePageSource,
  useDeletePage, useListAccounts, getListAccountsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Users, TrendingUp, Clock, CheckCircle2, XCircle, AlertCircle,
  Instagram, Youtube, Globe, Trash2, Plus, X, Save,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo",
  "Asia/Kolkata", "Australia/Sydney",
];

const TIME_PRESETS = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00", "22:00",
];

const SOURCE_ICON: Record<string, React.ReactNode> = {
  instagram: <Instagram className="h-4 w-4" />,
  youtube: <Youtube className="h-4 w-4" />,
  tiktok: <Globe className="h-4 w-4" />,
};

export default function PageDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: page, isLoading } = useGetPage(params.id, {
    query: { queryKey: getGetPageQueryKey(params.id) },
  });
  const { data: accounts } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });

  const updatePage = useUpdatePage();
  const updateAutomation = useUpdatePageAutomation();
  const updateSource = useUpdatePageSource();
  const deletePage = useDeletePage();

  const [settingsTab, setSettingsTab] = useState("automation");

  const [automationForm, setAutomationForm] = useState<{
    postsPerDay: number;
    scheduleLogic: "fixed" | "random";
    timezone: string;
    timeSlots: string[];
  } | null>(null);

  const [sourceForm, setSourceForm] = useState<{
    sourceType: "instagram" | "youtube" | "tiktok";
    sourceIdentity: string;
  } | null>(null);

  const [newSlot, setNewSlot] = useState("09:00");

  function initAutomationForm() {
    if (!page) return;
    setAutomationForm({
      postsPerDay: page.postsPerDay,
      scheduleLogic: page.scheduleLogic as "fixed" | "random",
      timezone: page.timezone,
      timeSlots: page.timeSlots ?? [],
    });
  }

  function initSourceForm() {
    if (!page) return;
    setSourceForm({
      sourceType: (page.sourceType ?? "instagram") as "instagram" | "youtube" | "tiktok",
      sourceIdentity: page.sourceIdentity ?? "",
    });
  }

  function handleToggleAutomation(enabled: boolean) {
    updatePage.mutate(
      { pageId: params.id, data: { automationEnabled: enabled } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPageQueryKey(params.id) });
          toast({ title: `Automation ${enabled ? "enabled" : "paused"}` });
        },
      }
    );
  }

  function handleSaveAutomation() {
    if (!automationForm) return;
    updateAutomation.mutate(
      { pageId: params.id, data: automationForm },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPageQueryKey(params.id) });
          toast({ title: "Automation settings saved" });
          setAutomationForm(null);
        },
        onError: () => {
          toast({ title: "Failed to save settings", variant: "destructive" });
        },
      }
    );
  }

  function handleSaveSource() {
    if (!sourceForm) return;
    updateSource.mutate(
      { pageId: params.id, data: sourceForm },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPageQueryKey(params.id) });
          toast({ title: "Content source saved" });
          setSourceForm(null);
        },
        onError: () => {
          toast({ title: "Failed to save source", variant: "destructive" });
        },
      }
    );
  }

  function handleAddSlot() {
    if (!automationForm) return;
    if (automationForm.timeSlots.includes(newSlot)) return;
    setAutomationForm((f) => f ? { ...f, timeSlots: [...f.timeSlots, newSlot].sort() } : f);
  }

  function handleRemoveSlot(slot: string) {
    setAutomationForm((f) => f ? { ...f, timeSlots: f.timeSlots.filter((s) => s !== slot) } : f);
  }

  function handleDelete() {
    deletePage.mutate(
      { pageId: params.id },
      {
        onSuccess: () => {
          navigate("/pages");
          toast({ title: "Page removed" });
        },
      }
    );
  }

  const account = accounts?.find((a) => a.id === page?.accountId);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex flex-col gap-8 max-w-4xl mx-auto">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </Layout>
    );
  }

  if (!page) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold mb-2">Page Not Found</h2>
          <Button variant="outline" onClick={() => navigate("/pages")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Pages
          </Button>
        </div>
      </Layout>
    );
  }

  const af = automationForm ?? {
    postsPerDay: page.postsPerDay,
    scheduleLogic: page.scheduleLogic as "fixed" | "random",
    timezone: page.timezone,
    timeSlots: page.timeSlots ?? [],
  };

  const sf = sourceForm ?? {
    sourceType: (page.sourceType ?? "instagram") as "instagram" | "youtube" | "tiktok",
    sourceIdentity: page.sourceIdentity ?? "",
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6 max-w-4xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit -ml-2 gap-2 text-muted-foreground"
          onClick={() => navigate("/pages")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Pages
        </Button>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-5">
              <Avatar className="h-16 w-16 border-2 shadow-sm">
                <AvatarImage src={page.profilePicture} />
                <AvatarFallback className="text-lg font-bold">
                  {page.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold">{page.name}</h1>
                  {page.status === "active" ? (
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>
                  ) : page.status === "paused" ? (
                    <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Paused</Badge>
                  ) : (
                    <Badge variant="destructive">Error</Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-sm mt-1">
                  {page.category || "Facebook Page"} · ID: {page.fbPageId}
                </p>
                {(page.followersCount ?? 0) > 0 && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Users className="h-3.5 w-3.5" />
                    {(page.followersCount ?? 0).toLocaleString()} followers
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-sm text-muted-foreground">Automation</span>
                <Switch
                  checked={page.automationEnabled}
                  onCheckedChange={handleToggleAutomation}
                  disabled={updatePage.isPending}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6 flex items-center gap-4">
                  <div className="p-3 bg-green-500/10 rounded-xl">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{page.totalPosted}</p>
                    <p className="text-sm text-muted-foreground">Total Posted</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 flex items-center gap-4">
                  <div className="p-3 bg-blue-500/10 rounded-xl">
                    <Clock className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{page.totalPending}</p>
                    <p className="text-sm text-muted-foreground">Pending</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 flex items-center gap-4">
                  <div className="p-3 bg-red-500/10 rounded-xl">
                    <XCircle className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{page.totalFailed}</p>
                    <p className="text-sm text-muted-foreground">Failed</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Page Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Connected Account</span>
                  <span className="font-medium">{account?.name ?? "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Posts Per Day</span>
                  <span className="font-medium">{page.postsPerDay}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Schedule Logic</span>
                  <span className="font-medium capitalize">{page.scheduleLogic}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Timezone</span>
                  <span className="font-medium">{page.timezone}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Content Source</span>
                  <span className="font-medium flex items-center gap-1.5">
                    {page.sourceType ? (
                      <>
                        {SOURCE_ICON[page.sourceType]}
                        {page.sourceIdentity || page.sourceType}
                      </>
                    ) : "Not configured"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Scraping Status</span>
                  <Badge
                    className={
                      page.scrapingStatus === "active"
                        ? "bg-green-500/10 text-green-600 border-green-500/20"
                        : page.scrapingStatus === "done"
                        ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {page.scrapingStatus}
                  </Badge>
                </div>
                {page.timeSlots && page.timeSlots.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Time Slots</span>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {page.timeSlots.map((s) => (
                        <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <div className="flex gap-4">
              <div className="flex flex-col gap-1 w-44 flex-shrink-0">
                {(["automation", "source", "connections", "identity"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSettingsTab(tab)}
                    className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                      settingsTab === tab
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
                <div className="mt-auto pt-4">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full justify-start text-destructive gap-2">
                        <Trash2 className="h-4 w-4" />
                        Remove Page
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove this page?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove "{page.name}" from management. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground"
                          onClick={handleDelete}
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                {settingsTab === "automation" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Automation Settings</CardTitle>
                      <CardDescription>Configure how and when posts are published.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Posts Per Day</Label>
                          <Input
                            type="number"
                            min={1}
                            max={20}
                            value={af.postsPerDay}
                            onChange={(e) => {
                              if (!automationForm) initAutomationForm();
                              setAutomationForm((f) => f ? { ...f, postsPerDay: parseInt(e.target.value) || 1 } : f);
                            }}
                            onFocus={() => { if (!automationForm) initAutomationForm(); }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Schedule Logic</Label>
                          <Select
                            value={af.scheduleLogic}
                            onValueChange={(v: any) => {
                              if (!automationForm) initAutomationForm();
                              setAutomationForm((f) => f ? { ...f, scheduleLogic: v } : f);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fixed">Fixed Times</SelectItem>
                              <SelectItem value="random">Random within Window</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Timezone</Label>
                        <Select
                          value={af.timezone}
                          onValueChange={(v) => {
                            if (!automationForm) initAutomationForm();
                            setAutomationForm((f) => f ? { ...f, timezone: v } : f);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIMEZONES.map((tz) => (
                              <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Time Slots</Label>
                        <p className="text-xs text-muted-foreground">
                          Set specific times for posts (used with Fixed schedule logic).
                        </p>
                        <div className="flex flex-wrap gap-2 min-h-[36px]">
                          {af.timeSlots.map((slot) => (
                            <Badge key={slot} variant="secondary" className="gap-1 text-sm py-1">
                              {slot}
                              <button
                                onClick={() => {
                                  if (!automationForm) initAutomationForm();
                                  handleRemoveSlot(slot);
                                }}
                                className="hover:text-destructive transition-colors"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Select value={newSlot} onValueChange={setNewSlot}>
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TIME_PRESETS.map((t) => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (!automationForm) initAutomationForm();
                              handleAddSlot();
                            }}
                            className="gap-1"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </Button>
                        </div>
                      </div>

                      {automationForm && (
                        <div className="flex justify-end gap-2 pt-2 border-t">
                          <Button variant="outline" onClick={() => setAutomationForm(null)}>Discard</Button>
                          <Button onClick={handleSaveAutomation} disabled={updateAutomation.isPending} className="gap-2">
                            <Save className="h-4 w-4" />
                            {updateAutomation.isPending ? "Saving..." : "Save Changes"}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {settingsTab === "source" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Content Source</CardTitle>
                      <CardDescription>Configure where content is scraped from.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Platform</Label>
                        <Select
                          value={sf.sourceType}
                          onValueChange={(v: any) => {
                            if (!sourceForm) initSourceForm();
                            setSourceForm((f) => f ? { ...f, sourceType: v } : f);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="instagram">
                              <span className="flex items-center gap-2">
                                <Instagram className="h-4 w-4" /> Instagram
                              </span>
                            </SelectItem>
                            <SelectItem value="youtube">
                              <span className="flex items-center gap-2">
                                <Youtube className="h-4 w-4" /> YouTube
                              </span>
                            </SelectItem>
                            <SelectItem value="tiktok">
                              <span className="flex items-center gap-2">
                                <Globe className="h-4 w-4" /> TikTok
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Handle / URL</Label>
                        <Input
                          placeholder={
                            sf.sourceType === "instagram"
                              ? "@username"
                              : sf.sourceType === "youtube"
                              ? "@channel or URL"
                              : "@tiktok_handle"
                          }
                          value={sf.sourceIdentity}
                          onChange={(e) => {
                            if (!sourceForm) initSourceForm();
                            setSourceForm((f) => f ? { ...f, sourceIdentity: e.target.value } : f);
                          }}
                          onFocus={() => { if (!sourceForm) initSourceForm(); }}
                        />
                      </div>

                      {sourceForm && (
                        <div className="flex justify-end gap-2 pt-2 border-t">
                          <Button variant="outline" onClick={() => setSourceForm(null)}>Discard</Button>
                          <Button onClick={handleSaveSource} disabled={updateSource.isPending} className="gap-2">
                            <Save className="h-4 w-4" />
                            {updateSource.isPending ? "Saving..." : "Save Changes"}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {settingsTab === "connections" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Connections</CardTitle>
                      <CardDescription>Facebook account linked to this page.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {account ? (
                        <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/30">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={account.profilePicture} />
                            <AvatarFallback>{account.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-sm">{account.name}</p>
                            <p className="text-xs text-muted-foreground">{account.email ?? "No email"}</p>
                          </div>
                          <Badge className="ml-auto bg-green-500/10 text-green-600 border-green-500/20">
                            Connected
                          </Badge>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm py-4 text-center">No account linked.</p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {settingsTab === "identity" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Page Identity</CardTitle>
                      <CardDescription>Core information about this Facebook page.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/30">
                        <Avatar className="h-16 w-16">
                          <AvatarImage src={page.profilePicture} />
                          <AvatarFallback className="text-xl font-bold">
                            {page.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-bold text-lg">{page.name}</p>
                          <p className="text-sm text-muted-foreground">{page.category}</p>
                          {(page.followersCount ?? 0) > 0 && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                              <Users className="h-3.5 w-3.5" />
                              {(page.followersCount ?? 0).toLocaleString()} followers
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Facebook Page ID</span>
                          <code className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{page.fbPageId}</code>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Internal ID</span>
                          <code className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{page.id}</code>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Added On</span>
                          <span className="font-medium">
                            {new Date(page.createdAt).toLocaleDateString("en-US", {
                              year: "numeric", month: "short", day: "numeric",
                            })}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
