import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useListPages, getListPagesQueryKey,
  useCreatePage,
  useUpdatePage,
  useListAccounts, getListAccountsQueryKey,
  useGetAccountAvailablePages, getGetAccountAvailablePagesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Search, Zap, TrendingUp, Clock, ChevronRight,
  Instagram, Youtube, Globe, Trash2, MoreHorizontal, X,
  Calendar, CheckCircle2, XCircle, AlertCircle, RefreshCw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo",
  "Asia/Kolkata", "Australia/Sydney",
];

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  instagram: <Instagram className="h-4 w-4" />,
  youtube: <Youtube className="h-4 w-4" />,
  tiktok: <Globe className="h-4 w-4" />,
};

const SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
};

type Step = 1 | 2;

const defaultStep2 = {
  sourceType: "youtube" as "instagram" | "youtube" | "tiktok",
  sourceIdentity: "",
  postsPerDay: 3,
  scheduleLogic: "fixed" as "fixed" | "random",
  timezone: "UTC",
  timeSlots: [] as string[],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getNextScheduledPost(
  timeSlots: string[],
  timezone: string,
  scheduleLogic: string,
  postsPerDay: number,
  lastPostedAt?: string | null,
): string {
  if (scheduleLogic === "random") {
    if (!lastPostedAt) return "Soon";
    const intervalHours = 24 / (postsPerDay > 0 ? postsPerDay : 1);
    const nextMs = new Date(lastPostedAt).getTime() + intervalHours * 3600 * 1000;
    const diffMins = Math.round((nextMs - Date.now()) / 60000);
    if (diffMins <= 0) return "Soon";
    if (diffMins < 60) return `In ${diffMins}m`;
    return `In ${Math.round(diffMins / 60)}h`;
  }

  if (!timeSlots.length) return "No schedule";

  try {
    const nowInTz = new Date(
      new Date().toLocaleString("en-US", { timeZone: timezone }),
    );
    const nowMins = nowInTz.getHours() * 60 + nowInTz.getMinutes();

    const slotMins = timeSlots
      .map((s) => {
        const [h, m] = s.split(":").map(Number);
        return h * 60 + m;
      })
      .sort((a, b) => a - b);

    const nextSlotMins = slotMins.find((m) => m > nowMins) ?? slotMins[0];
    const diffMins = nextSlotMins > nowMins
      ? nextSlotMins - nowMins
      : 24 * 60 - nowMins + nextSlotMins;

    if (diffMins < 60) return `In ${diffMins}m`;
    return `In ${Math.round(diffMins / 60)}h`;
  } catch {
    return timeSlots[0] ?? "—";
  }
}

function validateSourceIdentity(type: string, identity: string): string | null {
  const val = identity.trim();
  if (!val) return "Source handle or URL is required";
  if (type === "youtube") {
    if (!val.startsWith("@") && !val.startsWith("http") && !val.startsWith("UC")) {
      return "YouTube: enter @channel, a channel URL, or a Channel ID (starts with UC)";
    }
  } else if (type === "instagram") {
    if (!val.startsWith("@") && !val.startsWith("http")) {
      return "Instagram: enter @username or a profile URL";
    }
  } else if (type === "tiktok") {
    if (!val.startsWith("@") && !val.startsWith("http")) {
      return "TikTok: enter @username or a profile URL";
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PagesManagement() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [search, setSearch] = useState("");

  const { data: pages, isLoading } = useListPages(
    { status: "all" },
    { query: { queryKey: getListPagesQueryKey({ status: "all" }) } }
  );
  const { data: accounts } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });

  const createPage = useCreatePage();
  const updatePage = useUpdatePage();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [step1, setStep1] = useState({ accountId: "", fbPageId: "" });
  const [step2, setStep2] = useState(defaultStep2);
  const [newWizardSlot, setNewWizardSlot] = useState("09:00");
  const [step2Errors, setStep2Errors] = useState<Record<string, string>>({});

  // Remove automation confirmation
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: accountPages } = useGetAccountAvailablePages(
    step1.accountId,
    { query: { queryKey: getGetAccountAvailablePagesQueryKey(step1.accountId), enabled: !!step1.accountId } }
  );

  const selectedPage = accountPages?.find((p) => p.fbPageId === step1.fbPageId);

  // Only show pages that have automation configured
  const automatedPages = (pages ?? []).filter((p) => p.automationEnabled);

  const filtered = automatedPages.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const activeCount = automatedPages.filter((p) => p.status === "active").length;
  const pausedCount = automatedPages.filter((p) => p.status === "paused").length;

  // ---------------------------------------------------------------------------
  // Wizard helpers
  // ---------------------------------------------------------------------------

  function resetWizard() {
    setStep(1);
    setStep1({ accountId: "", fbPageId: "" });
    setStep2(defaultStep2);
    setStep2Errors({});
    setNewWizardSlot("09:00");
  }

  function handleWizardOpen() {
    resetWizard();
    setWizardOpen(true);
  }

  function handleNext() {
    if (!step1.accountId) {
      toast({ title: "Please select a Facebook account", variant: "destructive" });
      return;
    }
    if (!step1.fbPageId) {
      toast({ title: "Please select a Facebook page", variant: "destructive" });
      return;
    }
    setStep(2);
  }

  function validateStep2(): boolean {
    const errors: Record<string, string> = {};

    const sourceErr = validateSourceIdentity(step2.sourceType, step2.sourceIdentity);
    if (sourceErr) errors.sourceIdentity = sourceErr;

    if (step2.scheduleLogic === "fixed" && step2.timeSlots.length === 0) {
      errors.timeSlots = "Add at least one posting time for Fixed schedule";
    }

    if (step2.postsPerDay < 1 || step2.postsPerDay > 20) {
      errors.postsPerDay = "Posts per day must be between 1 and 20";
    }

    setStep2Errors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleCreate() {
    if (!selectedPage) return;
    if (!validateStep2()) return;

    createPage.mutate(
      {
        data: {
          fbPageId: selectedPage.fbPageId,
          name: selectedPage.name,
          category: selectedPage.category,
          accountId: step1.accountId,
          sourceType: step2.sourceType,
          sourceIdentity: step2.sourceIdentity.trim(),
          postsPerDay: step2.postsPerDay,
          scheduleLogic: step2.scheduleLogic,
          timezone: step2.timezone,
          timeSlots: step2.timeSlots,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAccountAvailablePagesQueryKey(step1.accountId) });
          toast({ title: "Automation configured successfully" });
          setWizardOpen(false);
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "Failed to add automation";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  }

  function handleWizardAddSlot() {
    if (!newWizardSlot) return;
    if (step2.timeSlots.includes(newWizardSlot)) {
      toast({ title: "This time slot is already added", variant: "destructive" });
      return;
    }
    if (step2.timeSlots.length >= 10) return;
    setStep2((s) => ({ ...s, timeSlots: [...s.timeSlots, newWizardSlot].sort() }));
    setStep2Errors((e) => ({ ...e, timeSlots: "" }));
    setNewWizardSlot("09:00");
  }

  function handleWizardRemoveSlot(slot: string) {
    setStep2((s) => ({ ...s, timeSlots: s.timeSlots.filter((t) => t !== slot) }));
  }

  function handleToggle(id: string, enabled: boolean) {
    updatePage.mutate(
      { pageId: id, data: { automationEnabled: enabled } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() });
          toast({ title: enabled ? "Automation enabled" : "Automation paused" });
        },
        onError: () => {
          toast({ title: "Failed to update automation", variant: "destructive" });
        },
      }
    );
  }

  function handleRemoveAutomation(id: string, name: string) {
    setRemoveTarget({ id, name });
  }

  function confirmRemoveAutomation() {
    if (!removeTarget) return;
    updatePage.mutate(
      { pageId: removeTarget.id, data: { automationEnabled: false } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() });
          // Also invalidate available-pages so this page reappears in the wizard
          queryClient.invalidateQueries({ queryKey: ["getAccountAvailablePages"] });
          toast({ title: `Automation removed for "${removeTarget.name}"` });
          setRemoveTarget(null);
        },
        onError: () => {
          toast({ title: "Failed to remove automation", variant: "destructive" });
        },
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Page Automation</h1>
            <p className="text-muted-foreground mt-1">
              Manage your automated Facebook page posting schedules.
            </p>
          </div>
          <Button onClick={handleWizardOpen} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Automation
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{isLoading ? "—" : automatedPages.length}</p>
                <p className="text-sm text-muted-foreground">Total Automations</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-xl">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{isLoading ? "—" : activeCount}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="p-3 bg-yellow-500/10 rounded-xl">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{isLoading ? "—" : pausedCount}</p>
                <p className="text-sm text-muted-foreground">Paused</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search automations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Tabs value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="paused">Paused</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : !filtered.length ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="bg-primary/10 p-4 rounded-full mb-4">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-bold mb-1">
              {search || statusFilter !== "all" ? "No automations match your filter" : "No automations configured"}
            </h3>
            <p className="text-muted-foreground max-w-sm mb-6">
              {search || statusFilter !== "all"
                ? "Try changing your search or filter."
                : "Click 'Add Automation' to start automatically posting videos from YouTube, Instagram, or TikTok to your Facebook pages."}
            </p>
            {!search && statusFilter === "all" && (
              <Button onClick={handleWizardOpen} className="gap-2">
                <Plus className="h-4 w-4" />
                Add First Automation
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((page) => {
              const nextPost = getNextScheduledPost(
                page.timeSlots ?? [],
                page.timezone,
                page.scheduleLogic,
                page.postsPerDay,
                page.lastPostedAt,
              );

              return (
                <Card
                  key={page.id}
                  className="group relative hover:shadow-md transition-shadow"
                >
                  <CardContent className="p-5 space-y-4">
                    {/* Page header */}
                    <div className="flex items-start justify-between">
                      <div
                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                        onClick={() => navigate(`/pages/${page.id}`)}
                      >
                        <Avatar className="h-11 w-11 border shadow-sm flex-shrink-0">
                          <AvatarImage src={page.profilePicture} />
                          <AvatarFallback className="text-sm font-bold">
                            {page.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm leading-tight line-clamp-1">{page.name}</p>
                          <p className="text-xs text-muted-foreground">{page.category || "Facebook Page"}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {page.status === "active" ? (
                          <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-[11px]">Active</Badge>
                        ) : page.status === "paused" ? (
                          <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-[11px]">Paused</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[11px]">Error</Badge>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/pages/${page.id}`)}>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Edit Settings
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleRemoveAutomation(page.id, page.name)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove Automation
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Source info */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border">
                      <span className="text-muted-foreground flex-shrink-0">
                        {page.sourceType ? SOURCE_ICONS[page.sourceType] : <Globe className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-medium">
                          {page.sourceType ? SOURCE_LABELS[page.sourceType] : "No source"}
                        </span>
                        {page.sourceIdentity && (
                          <span className="text-xs text-muted-foreground ml-1.5 truncate block">
                            {page.sourceIdentity}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {page.postsPerDay}×/day
                      </span>
                    </div>

                    {/* Schedule info */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground mb-0.5">Schedule</p>
                        <p className="font-medium capitalize">
                          {page.scheduleLogic === "fixed" ? "Fixed Times" : "Random"}
                          {" · "}{page.timezone}
                        </p>
                        {page.scheduleLogic === "fixed" && page.timeSlots && page.timeSlots.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {page.timeSlots.slice(0, 4).map((s) => (
                              <span key={s} className="px-1.5 py-0.5 rounded bg-muted border text-[10px] font-mono">
                                {s}
                              </span>
                            ))}
                            {page.timeSlots.length > 4 && (
                              <span className="text-muted-foreground text-[10px]">+{page.timeSlots.length - 4} more</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div>
                          <p className="text-muted-foreground mb-0.5">Last Post</p>
                          <p className="font-medium">{formatRelativeTime(page.lastPostedAt)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Next Post</p>
                          <p className="font-medium text-primary">{page.status === "active" ? nextPost : "Paused"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Stats + toggle */}
                    <div className="flex items-center justify-between pt-1 border-t">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span className="font-semibold">{page.totalPosted}</span>
                          <span className="text-muted-foreground">posted</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-red-500">
                          <XCircle className="h-3.5 w-3.5" />
                          <span className="font-semibold">{page.totalFailed}</span>
                          <span className="text-muted-foreground">failed</span>
                        </div>
                      </div>
                      <div
                        className="flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Switch
                          checked={page.status === "active"}
                          onCheckedChange={(c) => handleToggle(page.id, c)}
                          disabled={updatePage.isPending}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Add Automation Wizard                                               */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center gap-1">
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${step === 1 ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"}`}>1</span>
                <span className="text-xs text-muted-foreground">Select Page</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center gap-1">
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${step === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>2</span>
                <span className="text-xs text-muted-foreground">Configure</span>
              </div>
            </div>
            <DialogTitle>{step === 1 ? "Select a Facebook Page" : "Configure Automation"}</DialogTitle>
          </DialogHeader>

          {step === 1 ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Facebook Account</Label>
                <Select
                  value={step1.accountId}
                  onValueChange={(v) => setStep1({ accountId: v, fbPageId: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select connected account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts?.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {step1.accountId && (
                <div className="space-y-2">
                  <Label>Page to Automate</Label>
                  {!accountPages?.length ? (
                    <div className="flex items-center gap-2 py-4 px-3 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span>No available pages — all pages for this account are already automated, or the account has no pages.</span>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {accountPages.map((p) => (
                        <div
                          key={p.fbPageId}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            step1.fbPageId === p.fbPageId
                              ? "border-primary bg-primary/5"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => setStep1((s) => ({ ...s, fbPageId: p.fbPageId }))}
                        >
                          <Avatar className="h-9 w-9 flex-shrink-0">
                            <AvatarImage src={p.profilePicture} />
                            <AvatarFallback className="text-xs">{p.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.category || "Facebook Page"}</p>
                          </div>
                          {step1.fbPageId === p.fbPageId && (
                            <div className="w-4 h-4 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setWizardOpen(false)}>Cancel</Button>
                <Button onClick={handleNext} disabled={!step1.accountId || !step1.fbPageId}>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Selected page preview */}
              {selectedPage && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    <AvatarImage src={selectedPage.profilePicture} />
                    <AvatarFallback className="text-xs">{selectedPage.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">{selectedPage.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedPage.category}</p>
                  </div>
                </div>
              )}

              {/* Content source + posts per day */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Content Source</Label>
                  <Select
                    value={step2.sourceType}
                    onValueChange={(v: any) => {
                      setStep2((s) => ({ ...s, sourceType: v, sourceIdentity: "" }));
                      setStep2Errors((e) => ({ ...e, sourceIdentity: "" }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="youtube">
                        <span className="flex items-center gap-2"><Youtube className="h-4 w-4" />YouTube</span>
                      </SelectItem>
                      <SelectItem value="instagram">
                        <span className="flex items-center gap-2"><Instagram className="h-4 w-4" />Instagram</span>
                      </SelectItem>
                      <SelectItem value="tiktok">
                        <span className="flex items-center gap-2"><Globe className="h-4 w-4" />TikTok</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Posts Per Day</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={step2.postsPerDay}
                    onChange={(e) => {
                      setStep2((s) => ({ ...s, postsPerDay: parseInt(e.target.value) || 1 }));
                      setStep2Errors((er) => ({ ...er, postsPerDay: "" }));
                    }}
                    className={step2Errors.postsPerDay ? "border-destructive" : ""}
                  />
                  {step2Errors.postsPerDay && (
                    <p className="text-xs text-destructive">{step2Errors.postsPerDay}</p>
                  )}
                </div>
              </div>

              {/* Source identity */}
              <div className="space-y-2">
                <Label>
                  {step2.sourceType === "youtube"
                    ? "YouTube Channel Handle or URL"
                    : step2.sourceType === "instagram"
                    ? "Instagram Username or URL"
                    : "TikTok Username or URL"}
                </Label>
                <Input
                  placeholder={
                    step2.sourceType === "youtube"
                      ? "@YourChannel or https://youtube.com/@channel"
                      : step2.sourceType === "instagram"
                      ? "@username or https://instagram.com/username"
                      : "@username or https://tiktok.com/@username"
                  }
                  value={step2.sourceIdentity}
                  onChange={(e) => {
                    setStep2((s) => ({ ...s, sourceIdentity: e.target.value }));
                    setStep2Errors((er) => ({ ...er, sourceIdentity: "" }));
                  }}
                  className={step2Errors.sourceIdentity ? "border-destructive" : ""}
                />
                {step2Errors.sourceIdentity ? (
                  <p className="text-xs text-destructive">{step2Errors.sourceIdentity}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {step2.sourceType === "youtube"
                      ? "e.g. @MrBeast, https://youtube.com/@MrBeast, or UC channel ID"
                      : step2.sourceType === "instagram"
                      ? "e.g. @natgeo or https://instagram.com/natgeo"
                      : "e.g. @charlidamelio or https://tiktok.com/@charlidamelio"}
                  </p>
                )}
              </div>

              {/* Schedule logic + timezone */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Schedule Logic</Label>
                  <Select
                    value={step2.scheduleLogic}
                    onValueChange={(v: any) => {
                      setStep2((s) => ({ ...s, scheduleLogic: v, timeSlots: [] }));
                      setStep2Errors((er) => ({ ...er, timeSlots: "" }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed Times</SelectItem>
                      <SelectItem value="random">Random (auto-spaced)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select
                    value={step2.timezone}
                    onValueChange={(v) => setStep2((s) => ({ ...s, timezone: v }))}
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
              </div>

              {/* Time slots (only for fixed schedule) */}
              {step2.scheduleLogic === "fixed" && (
                <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
                  <div>
                    <Label className="flex items-center gap-1.5 text-sm">
                      <Clock className="h-3.5 w-3.5" />
                      Posting Times
                      <span className="text-muted-foreground font-normal text-xs">
                        — in {step2.timezone}
                      </span>
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Videos will post at exactly these times. Add up to 10 slots.
                    </p>
                  </div>

                  {step2Errors.timeSlots && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {step2Errors.timeSlots}
                    </p>
                  )}

                  {step2.timeSlots.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {step2.timeSlots.map((slot) => (
                        <div
                          key={slot}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-background text-xs font-mono font-semibold"
                        >
                          {slot}
                          <button
                            type="button"
                            onClick={() => handleWizardRemoveSlot(slot)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No times added yet — add at least one below.</p>
                  )}

                  {step2.timeSlots.length < 10 && (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="time"
                        value={newWizardSlot}
                        onChange={(e) => setNewWizardSlot(e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleWizardAddSlot}
                        disabled={!newWizardSlot}
                        className="h-8 gap-1 text-xs"
                      >
                        <Plus className="h-3 w-3" />
                        Add Time
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {step2.scheduleLogic === "random" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-400">
                  <Calendar className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Random mode will automatically space {step2.postsPerDay} post{step2.postsPerDay !== 1 ? "s" : ""} evenly throughout the day, posting approximately every{" "}
                    <strong>{Math.round(24 / step2.postsPerDay)} hours</strong>.
                  </span>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={handleCreate} disabled={createPage.isPending}>
                  {createPage.isPending ? "Saving..." : "Add Automation"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* Remove Automation Confirmation                                       */}
      {/* ------------------------------------------------------------------ */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Automation?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>
                This will stop automation for <strong>"{removeTarget?.name}"</strong> and clear its schedule.
              </span>
              <br />
              <span className="text-green-700 dark:text-green-400 font-medium">
                ✓ The Facebook page will stay connected.
              </span>
              <br />
              <span className="text-green-700 dark:text-green-400 font-medium">
                ✓ Your Facebook account tokens will NOT be revoked.
              </span>
              <br />
              <span className="text-muted-foreground">
                You can re-add automation for this page at any time.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmRemoveAutomation}
            >
              Remove Automation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
