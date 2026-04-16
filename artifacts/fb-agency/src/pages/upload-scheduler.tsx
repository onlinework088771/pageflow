import { useState, useRef, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { useListPages, useListAccounts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Upload, Calendar, Clock, Trash2, Video, CheckCircle, XCircle, Loader2, Play, Globe, Zap, User, ChevronRight } from "lucide-react";
import { getAuthToken } from "@/contexts/auth-context";
import { FacebookPostPreview } from "@/components/facebook-post-preview";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

interface ScheduledVideo {
  id: string;
  title: string;
  description?: string;
  videoUrl?: string;
  videoPath?: string;
  thumbnailUrl?: string;
  pageIds: string[];
  scheduledAt: string;
  timezone: string;
  status: "pending" | "processing" | "posted" | "failed";
  errorMessage?: string;
  postedCount: number;
  createdAt: string;
}

function apiUrl(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/api${path}`;
}

async function authFetch(url: string, options: RequestInit = {}) {
  const token = getAuthToken();
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function StatusBadge({ status }: { status: ScheduledVideo["status"] }) {
  const configs: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    pending: { label: "Scheduled", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
    processing: { label: "Posting...", variant: "default", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    posted: { label: "Posted", variant: "outline", icon: <CheckCircle className="h-3 w-3 text-green-500" /> },
    failed: { label: "Failed", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
  };
  const cfg = configs[status] ?? configs.pending;
  return (
    <Badge variant={cfg.variant} className="flex items-center gap-1">
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

export default function UploadScheduler() {
  const { toast } = useToast();
  const { data: accounts, isLoading: accountsLoading } = useListAccounts({});
  const { data: allPages, isLoading: pagesLoading } = useListPages({});

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [scheduledVideos, setScheduledVideos] = useState<ScheduledVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [postingNow, setPostingNow] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    title: "",
    description: "",
    selectedPageIds: [] as string[],
    date: "",
    time: "",
    timezone: "America/New_York",
    videoUrl: "",
  });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchScheduledVideos = useCallback(async () => {
    try {
      const resp = await authFetch(apiUrl("/scheduled-videos"));
      if (resp.ok) {
        const data = await resp.json();
        setScheduledVideos(data);
      }
    } catch {
    } finally {
      setLoadingVideos(false);
    }
  }, []);

  useEffect(() => {
    fetchScheduledVideos();
    const interval = setInterval(fetchScheduledVideos, 5_000);
    return () => clearInterval(interval);
  }, [fetchScheduledVideos]);

  async function handlePostNow(id: string) {
    setPostingNow((prev) => new Set(prev).add(id));
    try {
      const resp = await authFetch(apiUrl(`/scheduled-videos/${id}/post-now`), { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to post");
      toast({ title: "Posting started!", description: "The video is being posted to Facebook now. Status will update shortly." });
      setScheduledVideos((prev) =>
        prev.map((v) => (v.id === id ? { ...v, status: "processing" } : v)),
      );
      setTimeout(fetchScheduledVideos, 2000);
      setTimeout(fetchScheduledVideos, 6000);
      setTimeout(fetchScheduledVideos, 12000);
      setTimeout(fetchScheduledVideos, 25000);
    } catch (err: any) {
      toast({ title: "Post failed", description: err.message, variant: "destructive" });
    } finally {
      setPostingNow((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function togglePage(pageId: string) {
    setForm((f) => ({
      ...f,
      selectedPageIds: f.selectedPageIds.includes(pageId)
        ? f.selectedPageIds.filter((id) => id !== pageId)
        : [...f.selectedPageIds, pageId],
    }));
  }

  const accountPages = selectedAccountId
    ? (allPages ?? []).filter((p) => p.accountId === selectedAccountId && (p.status === "active" || p.status === "paused"))
    : [];

  const allAccountPagesSelected =
    accountPages.length > 0 && accountPages.every((p) => form.selectedPageIds.includes(p.id));

  function toggleSelectAll() {
    if (allAccountPagesSelected) {
      setForm((f) => ({
        ...f,
        selectedPageIds: f.selectedPageIds.filter((id) => !accountPages.some((p) => p.id === id)),
      }));
    } else {
      const newIds = accountPages.map((p) => p.id);
      setForm((f) => ({
        ...f,
        selectedPageIds: [...new Set([...f.selectedPageIds, ...newIds])],
      }));
    }
  }

  function handleSelectAccount(accountId: string) {
    setSelectedAccountId(accountId);
    setForm((f) => ({ ...f, selectedPageIds: [] }));
  }

  async function handleSchedule() {
    if (!form.title.trim()) {
      toast({ title: "Title required", description: "Please enter a video title.", variant: "destructive" });
      return;
    }
    if (form.selectedPageIds.length === 0) {
      toast({ title: "Select pages", description: "Choose at least one Facebook page.", variant: "destructive" });
      return;
    }
    if (!form.date || !form.time) {
      toast({ title: "Schedule time required", description: "Pick a date and time.", variant: "destructive" });
      return;
    }
    if (!videoFile && !form.videoUrl.trim()) {
      toast({ title: "Video required", description: "Upload a video file or paste a video URL.", variant: "destructive" });
      return;
    }

    const scheduledAt = new Date(`${form.date}T${form.time}`).toISOString();

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("title", form.title);
      if (form.description.trim()) formData.append("description", form.description.trim());
      formData.append("pageIds", JSON.stringify(form.selectedPageIds));
      formData.append("scheduledAt", scheduledAt);
      formData.append("timezone", form.timezone);
      if (form.videoUrl.trim()) formData.append("videoUrl", form.videoUrl.trim());
      if (videoFile) formData.append("video", videoFile);

      const resp = await authFetch(apiUrl("/scheduled-videos"), {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to schedule video");
      }

      const newVideo = await resp.json();
      setScheduledVideos((prev) => [newVideo, ...prev]);
      setForm({ title: "", description: "", selectedPageIds: [], date: "", time: "", timezone: "America/New_York", videoUrl: "" });
      setVideoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: "Video scheduled!", description: `"${newVideo.title}" will post to ${newVideo.pageIds.length} page(s).` });
    } catch (err: any) {
      toast({ title: "Failed to schedule", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleScheduleAndPost() {
    if (!form.title.trim()) {
      toast({ title: "Title required", description: "Please enter a video title.", variant: "destructive" });
      return;
    }
    if (form.selectedPageIds.length === 0) {
      toast({ title: "Select pages", description: "Choose at least one Facebook page.", variant: "destructive" });
      return;
    }
    if (!videoFile && !form.videoUrl.trim()) {
      toast({ title: "Video required", description: "Upload a video file or paste a video URL.", variant: "destructive" });
      return;
    }

    const scheduledAt = new Date().toISOString();
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("title", form.title);
      if (form.description.trim()) formData.append("description", form.description.trim());
      formData.append("pageIds", JSON.stringify(form.selectedPageIds));
      formData.append("scheduledAt", scheduledAt);
      formData.append("timezone", form.timezone);
      if (form.videoUrl.trim()) formData.append("videoUrl", form.videoUrl.trim());
      if (videoFile) formData.append("video", videoFile);

      const resp = await authFetch(apiUrl("/scheduled-videos"), {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create post");
      }

      const newVideo = await resp.json();
      setScheduledVideos((prev) => [newVideo, ...prev]);
      setForm({ title: "", description: "", selectedPageIds: [], date: "", time: "", timezone: "America/New_York", videoUrl: "" });
      setVideoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      toast({ title: "Posting now...", description: "Your video is being posted to the selected pages." });

      const postResp = await authFetch(apiUrl(`/scheduled-videos/${newVideo.id}/post-now`), { method: "POST" });
      if (postResp.ok) {
        setScheduledVideos((prev) =>
          prev.map((v) => (v.id === newVideo.id ? { ...v, status: "processing" } : v)),
        );
        setTimeout(fetchScheduledVideos, 2000);
        setTimeout(fetchScheduledVideos, 6000);
        setTimeout(fetchScheduledVideos, 12000);
        setTimeout(fetchScheduledVideos, 25000);
      }
    } catch (err: any) {
      toast({ title: "Failed to post", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const resp = await authFetch(apiUrl(`/scheduled-videos/${id}`), { method: "DELETE" });
      if (!resp.ok && resp.status !== 204) throw new Error("Delete failed");
      setScheduledVideos((prev) => prev.filter((v) => v.id !== id));
      toast({ title: "Deleted", description: "Scheduled video removed." });
    } catch {
      toast({ title: "Error", description: "Could not delete the scheduled video.", variant: "destructive" });
    }
  }

  function formatScheduledAt(iso: string, tz: string) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: tz,
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function getPageName(pageId: string) {
    return allPages?.find((p) => p.id === pageId)?.name ?? `Page ${pageId}`;
  }

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Upload Scheduler</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manually upload videos and schedule them to post on your Facebook pages at exact times.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4 text-primary" />
                Schedule New Upload
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Video Title</Label>
                <Input
                  placeholder="Enter a title for this video..."
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Caption / Description
                  <span className="text-muted-foreground font-normal text-xs ml-1.5">(optional)</span>
                </Label>
                <textarea
                  rows={3}
                  placeholder={"Your post caption with #hashtags\n\nFor YouTube URLs, caption is auto-generated from title + tags if left empty."}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label>Upload Video File</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {videoFile ? (
                    <div className="flex items-center gap-2 justify-center">
                      <Video className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium truncate max-w-[180px]">{videoFile.name}</span>
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setVideoFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Click to upload MP4, MOV, AVI</p>
                      <p className="text-xs text-muted-foreground mt-1">Up to 500 MB</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="space-y-2">
                <Label>Or Paste Video URL</Label>
                <Input
                  placeholder="https://example.com/video.mp4"
                  value={form.videoUrl}
                  onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Schedule Date & Time
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={form.date}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  />
                  <Input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" /> Timezone
                </Label>
                <Select value={form.timezone} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}>
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

              <div className="space-y-3">
                <Label>Post to Pages</Label>

                {/* Step 1: Select Account */}
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Step 1 — Select Account</p>
                  {accountsLoading ? (
                    <div className="space-y-2">
                      {[1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
                    </div>
                  ) : !accounts || accounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No accounts connected. Go to FB Accounts first.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {accounts.filter((a) => a.status === "connected").map((account) => {
                        const isSelected = selectedAccountId === account.id;
                        return (
                          <div
                            key={account.id}
                            onClick={() => handleSelectAccount(account.id)}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                              isSelected
                                ? "border-primary bg-primary/8 shadow-sm"
                                : "border-border hover:border-primary/40 hover:bg-muted/40"
                            }`}
                          >
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarImage src={account.profilePicture ?? undefined} />
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                {account.name.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{account.name}</p>
                              <p className="text-xs text-muted-foreground">{account.pagesCount} page(s)</p>
                            </div>
                            {isSelected ? (
                              <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Step 2: Select Pages */}
                {selectedAccountId && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Step 2 — Select Pages</p>
                    {pagesLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                      </div>
                    ) : accountPages.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No active pages for this account.</p>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        {/* Select All */}
                        <div
                          onClick={toggleSelectAll}
                          className="flex items-center gap-3 px-3 py-2.5 bg-muted/40 border-b cursor-pointer hover:bg-muted/60 transition-colors"
                        >
                          <Checkbox
                            checked={allAccountPagesSelected}
                            onCheckedChange={toggleSelectAll}
                          />
                          <span className="text-sm font-semibold flex-1">Select All Pages</span>
                          <Badge variant="outline" className="text-[10px]">{accountPages.length}</Badge>
                        </div>
                        {/* Page list */}
                        <div className="max-h-44 overflow-y-auto">
                          {accountPages.map((page) => (
                            <div
                              key={page.id}
                              className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors ${
                                form.selectedPageIds.includes(page.id) ? "bg-primary/5" : ""
                              }`}
                              onClick={() => togglePage(page.id)}
                            >
                              <Checkbox
                                checked={form.selectedPageIds.includes(page.id)}
                                onCheckedChange={() => togglePage(page.id)}
                              />
                              <Avatar className="h-6 w-6 shrink-0">
                                <AvatarImage src={page.profilePicture ?? undefined} />
                                <AvatarFallback className="text-[9px]">
                                  {page.name.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm truncate flex-1">{page.name}</span>
                              {page.followersCount ? (
                                <span className="text-xs text-muted-foreground shrink-0">{page.followersCount.toLocaleString()}</span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {form.selectedPageIds.length > 0 && (
                      <p className="text-xs text-primary font-medium">{form.selectedPageIds.length} page(s) selected</p>
                    )}
                  </div>
                )}

                {!selectedAccountId && accounts && accounts.length > 0 && (
                  <p className="text-xs text-muted-foreground italic">Select an account above to choose pages.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={handleSchedule} disabled={uploading}>
                  {uploading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scheduling...</>
                  ) : (
                    <><Calendar className="h-4 w-4 mr-2" />Schedule</>
                  )}
                </Button>
                <Button onClick={handleScheduleAndPost} disabled={uploading}>
                  {uploading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Posting...</>
                  ) : (
                    <><Zap className="h-4 w-4 mr-2" />Post Now</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardContent className="flex-1 flex flex-col pt-5 pb-4">
              <FacebookPostPreview
                title={form.title}
                caption={form.description}
                videoFile={videoFile}
                videoUrl={form.videoUrl}
                pageName={
                  form.selectedPageIds.length > 0
                    ? (allPages?.find((p) => p.id === form.selectedPageIds[0])?.name ?? "Your Page Name")
                    : accounts?.find((a) => a.id === selectedAccountId)?.name ?? "Your Page Name"
                }
                pageAvatar={
                  form.selectedPageIds.length > 0
                    ? (allPages?.find((p) => p.id === form.selectedPageIds[0])?.profilePicture ?? undefined)
                    : undefined
                }
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Scheduled Videos</h2>
              <Badge variant="secondary">{scheduledVideos.length} scheduled</Badge>
            </div>

            {loadingVideos ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
              </div>
            ) : scheduledVideos.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Video className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium text-muted-foreground">No scheduled videos yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Use the form to upload and schedule your first video.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {scheduledVideos.map((v) => (
                  <Card key={v.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="h-14 w-20 rounded-md bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {v.thumbnailUrl ? (
                            <img src={v.thumbnailUrl} alt={v.title} className="h-full w-full object-cover" />
                          ) : (
                            <Play className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-sm truncate">{v.title}</p>
                            <StatusBadge status={v.status} />
                          </div>
                          {v.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{v.description}</p>
                          )}
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <Clock className="h-3 w-3" />
                            <span>{formatScheduledAt(v.scheduledAt, v.timezone)}</span>
                            <span className="text-muted-foreground/60">({v.timezone})</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {v.pageIds.slice(0, 3).map((pid) => (
                              <Badge key={pid} variant="outline" className="text-[10px] px-1.5 py-0">
                                {getPageName(pid)}
                              </Badge>
                            ))}
                            {v.pageIds.length > 3 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                +{v.pageIds.length - 3} more
                              </Badge>
                            )}
                          </div>
                          {v.errorMessage && (
                            <p className="text-xs text-destructive mt-2 bg-destructive/10 rounded px-2 py-1">{v.errorMessage}</p>
                          )}
                          {v.status === "posted" && (
                            <p className="text-xs text-green-600 mt-1">
                              Posted to {v.postedCount} page{v.postedCount !== 1 ? "s" : ""}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5 flex-shrink-0 items-end">
                          {(v.status === "pending" || v.status === "failed") && (
                            <Button
                              size="sm"
                              variant={v.status === "failed" ? "outline" : "default"}
                              className="h-7 text-xs gap-1 whitespace-nowrap"
                              disabled={postingNow.has(v.id) || v.status === "processing"}
                              onClick={() => handlePostNow(v.id)}
                            >
                              {postingNow.has(v.id) ? (
                                <><Loader2 className="h-3 w-3 animate-spin" />Posting...</>
                              ) : (
                                <><Zap className="h-3 w-3" />Post Now</>
                              )}
                            </Button>
                          )}
                          {v.status === "processing" && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" /> Posting...
                            </span>
                          )}
                          {(v.status === "pending" || v.status === "failed") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDelete(v.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
        </div>
      </div>
    </Layout>
  );
}
