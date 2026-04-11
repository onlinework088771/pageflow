import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useListPages, getListPagesQueryKey,
  useCreatePage, useDeletePage, useUpdatePage,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Search, Files, Users, TrendingUp, Clock, ChevronRight,
  Instagram, Youtube, Globe, Trash2, MoreHorizontal,
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

type Step = 1 | 2;

const defaultStep2 = {
  sourceType: "instagram" as "instagram" | "youtube" | "tiktok",
  sourceIdentity: "",
  postsPerDay: 3,
  scheduleLogic: "fixed" as "fixed" | "random",
  timezone: "UTC",
};

export default function PagesManagement() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [search, setSearch] = useState("");

  const { data: pages, isLoading } = useListPages(
    { status: statusFilter },
    { query: { queryKey: getListPagesQueryKey({ status: statusFilter }) } }
  );
  const { data: accounts } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });

  const createPage = useCreatePage();
  const deletePage = useDeletePage();
  const updatePage = useUpdatePage();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [step1, setStep1] = useState({ accountId: "", fbPageId: "" });
  const [step2, setStep2] = useState(defaultStep2);

  const { data: accountPages } = useGetAccountAvailablePages(
    step1.accountId,
    { query: { queryKey: getGetAccountAvailablePagesQueryKey(step1.accountId), enabled: !!step1.accountId } }
  );

  const selectedPage = accountPages?.find((p) => p.fbPageId === step1.fbPageId);

  function resetWizard() {
    setStep(1);
    setStep1({ accountId: "", fbPageId: "" });
    setStep2(defaultStep2);
  }

  function handleWizardOpen() {
    resetWizard();
    setWizardOpen(true);
  }

  function handleNext() {
    if (!step1.accountId || !step1.fbPageId) {
      toast({ title: "Please select an account and a page", variant: "destructive" });
      return;
    }
    setStep(2);
  }

  function handleCreate() {
    if (!selectedPage) return;
    createPage.mutate(
      {
        data: {
          fbPageId: selectedPage.fbPageId,
          name: selectedPage.name,
          category: selectedPage.category,
          accountId: step1.accountId,
          sourceType: step2.sourceType,
          sourceIdentity: step2.sourceIdentity,
          postsPerDay: step2.postsPerDay,
          scheduleLogic: step2.scheduleLogic,
          timezone: step2.timezone,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() });
          toast({ title: "Page added successfully" });
          setWizardOpen(false);
        },
        onError: () => {
          toast({ title: "Failed to add page", variant: "destructive" });
        },
      }
    );
  }

  function handleToggle(id: string, enabled: boolean) {
    updatePage.mutate(
      { pageId: id, data: { automationEnabled: enabled } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() });
        },
      }
    );
  }

  function handleDelete(id: string) {
    if (!confirm("Remove this page from management?")) return;
    deletePage.mutate(
      { pageId: id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() });
          toast({ title: "Page removed" });
        },
      }
    );
  }

  const filtered = (pages ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const active = pages?.filter((p) => p.status === "active").length ?? 0;
  const paused = pages?.filter((p) => p.status === "paused").length ?? 0;
  const total = pages?.length ?? 0;

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pages</h1>
            <p className="text-muted-foreground mt-1">
              Manage and automate your Facebook pages.
            </p>
          </div>
          <Button onClick={handleWizardOpen} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Page
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                <Files className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{isLoading ? "—" : total}</p>
                <p className="text-sm text-muted-foreground">Total Pages</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-xl">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{isLoading ? "—" : active}</p>
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
                <p className="text-2xl font-bold">{isLoading ? "—" : paused}</p>
                <p className="text-sm text-muted-foreground">Paused</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search pages..."
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

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : !filtered.length ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="bg-primary/10 p-4 rounded-full mb-4">
              <Files className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-bold mb-1">No Pages Found</h3>
            <p className="text-muted-foreground max-w-sm mb-6">
              {search
                ? "No pages match your search."
                : statusFilter === "all"
                ? "You haven't added any pages yet."
                : `No ${statusFilter} pages.`}
            </p>
            {!search && statusFilter === "all" && (
              <Button onClick={handleWizardOpen} className="gap-2">
                <Plus className="h-4 w-4" />
                Add First Page
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((page) => (
              <Card
                key={page.id}
                className="group relative cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/pages/${page.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12 border shadow-sm">
                        <AvatarImage src={page.profilePicture} />
                        <AvatarFallback className="text-sm font-bold">
                          {page.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold text-sm leading-tight line-clamp-1">{page.name}</p>
                        <p className="text-xs text-muted-foreground">{page.category || "Facebook Page"}</p>
                        {(page.followersCount ?? 0) > 0 && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Users className="h-3 w-3" />
                            {(page.followersCount ?? 0).toLocaleString()} followers
                          </p>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(page.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove Page
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center mb-4 bg-muted/40 rounded-lg p-2">
                    <div>
                      <p className="text-sm font-bold text-green-600">{page.totalPosted}</p>
                      <p className="text-[10px] text-muted-foreground">Posted</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-blue-600">{page.totalPending}</p>
                      <p className="text-[10px] text-muted-foreground">Pending</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-red-500">{page.totalFailed}</p>
                      <p className="text-[10px] text-muted-foreground">Failed</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {page.status === "active" ? (
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-[11px]">
                          Active
                        </Badge>
                      ) : page.status === "paused" ? (
                        <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-[11px]">
                          Paused
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[11px]">
                          Error
                        </Badge>
                      )}
                      {page.sourceType && (
                        <span className="text-muted-foreground">
                          {SOURCE_ICONS[page.sourceType]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={page.automationEnabled}
                        onCheckedChange={(c) => handleToggle(page.id, c)}
                        disabled={updatePage.isPending}
                      />
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-lg">
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
                  <Label>Page to Manage</Label>
                  {!accountPages?.length ? (
                    <p className="text-sm text-muted-foreground py-2">No pages found for this account.</p>
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
                          <Avatar className="h-9 w-9">
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
              {selectedPage && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={selectedPage.profilePicture} />
                    <AvatarFallback className="text-xs">{selectedPage.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">{selectedPage.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedPage.category}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Content Source</Label>
                  <Select
                    value={step2.sourceType}
                    onValueChange={(v: any) => setStep2((s) => ({ ...s, sourceType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="youtube">YouTube</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
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
                    onChange={(e) => setStep2((s) => ({ ...s, postsPerDay: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Source Handle / URL</Label>
                <Input
                  placeholder={
                    step2.sourceType === "instagram"
                      ? "@username"
                      : step2.sourceType === "youtube"
                      ? "@channel or URL"
                      : "@tiktok_handle"
                  }
                  value={step2.sourceIdentity}
                  onChange={(e) => setStep2((s) => ({ ...s, sourceIdentity: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Schedule Logic</Label>
                  <Select
                    value={step2.scheduleLogic}
                    onValueChange={(v: any) => setStep2((s) => ({ ...s, scheduleLogic: v }))}
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

              <DialogFooter>
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={handleCreate} disabled={createPage.isPending}>
                  {createPage.isPending ? "Adding..." : "Add Page"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
