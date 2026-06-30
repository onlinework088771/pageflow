import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Calendar, Clock, Video, CheckCircle, XCircle, Loader2,
  Globe, ChevronRight, Film, Image, Type, FileText, Layers,
  Zap, Trash2, PlayCircle, CheckCircle2, AlertCircle, RefreshCw,
  Users, Hash, Plus, CalendarClock,
} from "lucide-react";
import { authFetch, apiUrl, TIMEZONES } from "@/components/schedule-management-utils";

/* ─── Types ─────────────────────────────────────────────────────────── */

type ContentType = "reel" | "video" | "image" | "text";
type UploadMode = "single" | "bulk";
type ScheduledVideoStatus = "pending" | "processing" | "posted" | "failed";

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
  status: ScheduledVideoStatus;
  errorMessage?: string;
  postedCount: number;
  createdAt: string;
}

interface UploadedFile {
  file: File;
  id: string;
  preview?: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function computeSchedule(
  count: number,
  postsPerDay: number,
  startDate: string,
  startTime: string,
): string[] {
  if (!startDate || !startTime || count === 0) return [];
  const dates: string[] = [];
  const [y, m, d] = startDate.split("-").map(Number);
  const [h, min] = startTime.split(":").map(Number);
  let fileIdx = 0;
  let dayOffset = 0;
  while (fileIdx < count) {
    const perDay = Math.min(postsPerDay, count - fileIdx);
    for (let slot = 0; slot < perDay; slot++) {
      const dt = new Date(y, m - 1, d + dayOffset);
      const totalMin = h * 60 + min + slot * 30;
      dt.setHours(Math.floor(totalMin / 60), totalMin % 60, 0, 0);
      dates.push(dt.toISOString());
      fileIdx++;
    }
    dayOffset++;
  }
  return dates;
}

function fmtDate(iso: string, tz = "UTC") {
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

function uid() {
  return Math.random().toString(36).slice(2);
}

function detectContentType(v: { videoPath?: string; videoUrl?: string }): ContentType {
  if (!v.videoPath && !v.videoUrl) return "text";
  const src = v.videoPath || v.videoUrl || "";
  const ext = src.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return "image";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "reel";
  return "video";
}

const CONTENT_TYPES: { id: ContentType; label: string; icon: React.ElementType; accept: string; hint: string }[] = [
  { id: "reel", label: "Reel", icon: Film, accept: "video/*", hint: "Short vertical video" },
  { id: "video", label: "Video", icon: Video, accept: "video/*", hint: "Standard video post" },
  { id: "image", label: "Image", icon: Image, accept: "image/*", hint: "Photo / graphic post" },
  { id: "text", label: "Text", icon: Type, accept: "", hint: "Text-only post" },
];

/* ─── Step Indicator ─────────────────────────────────────────────────── */

const STEPS = [
  "Account",
  "Pages",
  "Content Type",
  "Upload",
  "Scheduler",
  "Details",
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  done
                    ? "bg-primary border-primary text-primary-foreground"
                    : active
                    ? "border-primary text-primary bg-primary/10"
                    : "border-muted-foreground/30 text-muted-foreground/50 bg-transparent"
                }`}
              >
                {done ? <CheckCircle className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-[9px] font-medium uppercase tracking-wide whitespace-nowrap ${active ? "text-primary" : done ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-6 sm:w-10 mx-1 mb-4 rounded-full transition-colors ${done ? "bg-primary" : "bg-muted-foreground/20"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Schedule Manager ───────────────────────────────────────────────── */

function statusBadge(status: ScheduledVideoStatus) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="text-yellow-600 border-yellow-400 bg-yellow-50 dark:bg-yellow-950"><Clock className="h-2.5 w-2.5 mr-1" />Pending</Badge>;
    case "processing":
      return <Badge variant="outline" className="text-blue-600 border-blue-400 bg-blue-50 dark:bg-blue-950"><Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />Processing</Badge>;
    case "posted":
      return <Badge variant="outline" className="text-green-600 border-green-400 bg-green-50 dark:bg-green-950"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />Completed</Badge>;
    case "failed":
      return <Badge variant="outline" className="text-red-600 border-red-400 bg-red-50 dark:bg-red-950"><AlertCircle className="h-2.5 w-2.5 mr-1" />Failed</Badge>;
  }
}

interface ManagerProps {
  videos: ScheduledVideo[];
  loading: boolean;
  postingNow: Set<string>;
  onPostNow: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  getPageName: (id: string) => string;
  isFiltered?: boolean;
  filterSummary?: string[];
}

function ScheduleManagerSection({ videos, loading, postingNow, onPostNow, onDelete, onRefresh, getPageName, isFiltered, filterSummary }: ManagerProps) {
  const tabs = [
    { key: "all", label: "All", statuses: ["pending", "processing", "posted", "failed"] },
    { key: "pending", label: "Pending", statuses: ["pending", "processing"] },
    { key: "completed", label: "Completed", statuses: ["posted"] },
    { key: "failed", label: "Failed", statuses: ["failed"] },
  ] as const;

  const counts = {
    all: videos.length,
    pending: videos.filter((v) => v.status === "pending" || v.status === "processing").length,
    completed: videos.filter((v) => v.status === "posted").length,
    failed: videos.filter((v) => v.status === "failed").length,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-primary" />
            Schedule Manager
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        {filterSummary && filterSummary.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Showing:</span>
            {filterSummary.map((part, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {part}
                </span>
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all">
          <TabsList className="w-full mb-4 grid grid-cols-4 h-9">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className="text-xs px-1 gap-1">
                {tab.label}
                {counts[tab.key] > 0 && (
                  <Badge variant="secondary" className="text-[9px] px-1 h-4 min-w-[18px] justify-center">
                    {counts[tab.key]}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((tab) => {
            const filtered = videos.filter((v) => (tab.statuses as readonly string[]).includes(v.status));
            return (
              <TabsContent key={tab.key} value={tab.key} className="mt-0">
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                    <CalendarClock className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      {isFiltered
                        ? "No scheduled posts found for the current filters."
                        : `No ${tab.key === "all" ? "" : tab.label.toLowerCase() + " "}posts yet`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filtered.map((video) => (
                      <div key={video.id} className="flex gap-3 p-3 rounded-xl border border-border/60 bg-card hover:bg-muted/30 transition-colors">
                        {/* Thumbnail */}
                        <div className="h-14 w-20 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border/30">
                          {video.thumbnailUrl ? (
                            <img src={video.thumbnailUrl} alt={video.title} className="h-full w-full object-cover" />
                          ) : (
                            <Video className="h-5 w-5 text-muted-foreground/40" />
                          )}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold truncate">{video.title}</p>
                            {statusBadge(video.status)}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3 inline mr-1" />
                            {fmtDate(video.scheduledAt, video.timezone)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            <Users className="h-3 w-3 inline mr-1" />
                            {video.pageIds.length === 1 ? getPageName(video.pageIds[0]) : `${video.pageIds.length} pages`}
                          </p>
                          {video.errorMessage && (
                            <p className="text-xs text-red-500 truncate">{video.errorMessage}</p>
                          )}
                        </div>
                        {/* Actions */}
                        <div className="flex flex-col gap-1 shrink-0">
                          {(video.status === "pending" || video.status === "failed") && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-primary hover:bg-primary/10"
                              title="Post Now"
                              onClick={() => onPostNow(video.id)}
                              disabled={postingNow.has(video.id)}
                            >
                              {postingNow.has(video.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Delete"
                            onClick={() => onDelete(video.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */

export default function UploadScheduler() {
  const { toast } = useToast();
  const { data: accounts, isLoading: accountsLoading } = useListAccounts({});
  const { data: allPages, isLoading: pagesLoading } = useListPages({});

  /* Wizard step: 0..5 */
  const [step, setStep] = useState(0);

  /* Step 1 – Account */
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  /* Step 2 – Pages */
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);

  /* Step 3 – Content type */
  const [contentType, setContentType] = useState<ContentType>("reel");

  /* Step 4 – Upload */
  const [uploadMode, setUploadMode] = useState<UploadMode>("single");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [textContent, setTextContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  /* Step 5 – Scheduler */
  const [postsPerDay, setPostsPerDay] = useState(1);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("10:00");
  const [timezone, setTimezone] = useState("America/New_York");

  /* Step 6 – Details */
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");

  /* Scheduling state */
  const [scheduling, setScheduling] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(0);

  /* Schedule manager */
  const [videos, setVideos] = useState<ScheduledVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [postingNow, setPostingNow] = useState<Set<string>>(new Set());

  /* ── Fetch scheduled videos ─────────────────────────────────────── */
  const fetchVideos = useCallback(async () => {
    try {
      const resp = await authFetch(apiUrl("/scheduled-videos"));
      if (resp.ok) setVideos(await resp.json());
    } catch {
    } finally {
      setLoadingVideos(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
    const t = setInterval(fetchVideos, 8_000);
    return () => clearInterval(t);
  }, [fetchVideos]);

  /* ── Derived ────────────────────────────────────────────────────── */
  const accountPages = selectedAccountId
    ? (allPages ?? []).filter((p) => p.accountId === selectedAccountId && (p.status === "active" || p.status === "paused"))
    : [];

  // ── Filter Schedule Manager videos based on wizard selection state ──
  // Filter order: Account → Selected Pages → Content Type (only when at step 2+)
  const managerVideos = useMemo(() => {
    let items = videos;

    // 1. Filter by selected Facebook Account
    if (selectedAccountId) {
      const accountPageIds = new Set(
        (allPages ?? [])
          .filter((p) => p.accountId === selectedAccountId)
          .map((p) => p.id)
      );
      items = items.filter((v) => v.pageIds.some((pid) => accountPageIds.has(pid)));
    }

    // 2. Filter by explicitly selected pages (user has checked specific pages)
    if (selectedPageIds.length > 0) {
      const pageSet = new Set(selectedPageIds);
      items = items.filter((v) => v.pageIds.some((pid) => pageSet.has(pid)));
    }

    // 3. Filter by content type — only when user is at or past the content type step
    if (step >= 2) {
      items = items.filter((v) => detectContentType(v) === contentType);
    }

    return items;
  }, [videos, selectedAccountId, selectedPageIds, contentType, step, allPages]);

  // True whenever any wizard filter is actively narrowing the list
  const managerIsFiltered = !!(selectedAccountId || selectedPageIds.length > 0 || step >= 2);

  // Build the live filter summary chips: Account → Page(s) → Content Type
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (selectedAccountId) {
      const acc = accounts?.find((a) => a.id === selectedAccountId);
      if (acc) parts.push(acc.name);
    }
    if (selectedPageIds.length > 0) {
      if (selectedPageIds.length === 1) {
        const pg = allPages?.find((p) => p.id === selectedPageIds[0]);
        if (pg) parts.push(pg.name);
      } else {
        parts.push(`${selectedPageIds.length} Pages`);
      }
    }
    if (step >= 2) {
      parts.push(contentType.charAt(0).toUpperCase() + contentType.slice(1));
    }
    return parts;
  }, [selectedAccountId, selectedPageIds, contentType, step, accounts, allPages]);

  const allSelected = accountPages.length > 0 && accountPages.every((p) => selectedPageIds.includes(p.id));

  const fileCount = contentType === "text" ? 1 : uploadedFiles.length;
  const schedule = computeSchedule(fileCount || 1, postsPerDay, startDate, startTime);
  const scheduleDays = schedule.length > 0
    ? Math.ceil(fileCount / postsPerDay)
    : 0;

  const acceptAttr = CONTENT_TYPES.find((c) => c.id === contentType)?.accept ?? "*/*";

  /* ── Handlers ───────────────────────────────────────────────────── */
  function togglePage(id: string) {
    setSelectedPageIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedPageIds((prev) => prev.filter((id) => !accountPages.some((p) => p.id === id)));
    } else {
      setSelectedPageIds((prev) => [...new Set([...prev, ...accountPages.map((p) => p.id)])]);
    }
  }

  function addFiles(newFiles: File[]) {
    const mapped: UploadedFile[] = newFiles.map((f) => ({
      file: f,
      id: uid(),
      preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }));
    if (uploadMode === "single") {
      setUploadedFiles(mapped.slice(0, 1));
    } else {
      setUploadedFiles((prev) => [...prev, ...mapped]);
    }
  }

  function removeFile(id: string) {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleScheduleAll() {
    /* Validate */
    if (!selectedAccountId) { toast({ title: "Select an account", variant: "destructive" }); return; }
    if (selectedPageIds.length === 0) { toast({ title: "Select at least one page", variant: "destructive" }); return; }
    if (!title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    if (contentType !== "text" && uploadedFiles.length === 0) {
      toast({ title: "Upload at least one file", variant: "destructive" }); return;
    }
    if (!startDate || !startTime) { toast({ title: "Set a start date and time", variant: "destructive" }); return; }

    const fullCaption = [caption.trim(), hashtags.trim()].filter(Boolean).join("\n\n");
    const scheduleDates = computeSchedule(fileCount, postsPerDay, startDate, startTime);

    setScheduling(true);
    setScheduledCount(0);
    let created = 0;

    try {
      if (contentType === "text") {
        const fd = new FormData();
        fd.append("title", title.trim());
        if (fullCaption) fd.append("description", fullCaption);
        fd.append("postType", "text");
        fd.append("pageIds", JSON.stringify(selectedPageIds));
        fd.append("scheduledAt", scheduleDates[0]);
        fd.append("timezone", timezone);
        const resp = await authFetch(apiUrl("/scheduled-videos"), { method: "POST", body: fd });
        if (resp.ok) {
          const v = await resp.json();
          setVideos((prev) => [v, ...prev]);
          created++;
          setScheduledCount(created);
        }
      } else {
        for (let i = 0; i < uploadedFiles.length; i++) {
          const { file } = uploadedFiles[i];
          const fd = new FormData();
          fd.append("title", uploadedFiles.length > 1 ? `${title.trim()} (${i + 1})` : title.trim());
          if (fullCaption) fd.append("description", fullCaption);
          fd.append("postType", contentType);
          fd.append("pageIds", JSON.stringify(selectedPageIds));
          fd.append("scheduledAt", scheduleDates[i] ?? scheduleDates[scheduleDates.length - 1]);
          fd.append("timezone", timezone);
          fd.append("video", file);
          const resp = await authFetch(apiUrl("/scheduled-videos"), { method: "POST", body: fd });
          if (resp.ok) {
            const v = await resp.json();
            setVideos((prev) => [v, ...prev]);
            created++;
            setScheduledCount(created);
          }
        }
      }

      if (created === 0) {
        toast({ title: "Scheduling failed", description: "The server rejected the upload. Check your file type and try again.", variant: "destructive" });
      } else {
        toast({
          title: "Scheduled!",
          description: `${created} post${created !== 1 ? "s" : ""} scheduled across ${scheduleDays} day${scheduleDays !== 1 ? "s" : ""}.`,
        });

        /* Reset wizard */
        setStep(0);
        setSelectedAccountId(null);
        setSelectedPageIds([]);
        setContentType("reel");
        setUploadMode("single");
        setUploadedFiles([]);
        setTextContent("");
        setTitle("");
        setCaption("");
        setHashtags("");
        setPostsPerDay(1);
        setStartDate(new Date().toISOString().split("T")[0]);
        setStartTime("10:00");
      }
    } catch (err: any) {
      toast({ title: "Scheduling failed", description: err.message, variant: "destructive" });
    } finally {
      setScheduling(false);
    }
  }

  async function handlePostNow(id: string) {
    setPostingNow((prev) => new Set(prev).add(id));
    try {
      const resp = await authFetch(apiUrl(`/scheduled-videos/${id}/post-now`), { method: "POST" });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Failed");
      toast({ title: "Posting now!", description: "Status will update shortly." });
      setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, status: "processing" } : v)));
      setTimeout(fetchVideos, 3000);
      setTimeout(fetchVideos, 8000);
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setPostingNow((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  async function handleDelete(id: string) {
    try {
      const resp = await authFetch(apiUrl(`/scheduled-videos/${id}`), { method: "DELETE" });
      if (!resp.ok && resp.status !== 204) throw new Error("Delete failed");
      setVideos((prev) => prev.filter((v) => v.id !== id));
      toast({ title: "Deleted" });
    } catch {
      toast({ title: "Error deleting post", variant: "destructive" });
    }
  }

  function getPageName(id: string) {
    return allPages?.find((p) => p.id === id)?.name ?? `Page ${id.slice(0, 6)}`;
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Video Scheduler</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload content and auto-schedule posts across days and pages.
          </p>
        </div>

        {/* Wizard Card */}
        <Card>
          <CardHeader className="pb-4 border-b">
            <StepIndicator current={step} />
          </CardHeader>

          <CardContent className="pt-6 space-y-6">

            {/* ── STEP 0: Select Account ────────────────────────────── */}
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold text-base">Select Facebook Account</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Choose the account you want to post from.</p>
                </div>
                {accountsLoading ? (
                  <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                ) : !accounts?.length ? (
                  <p className="text-sm text-muted-foreground py-4">No accounts connected. Go to FB Accounts first.</p>
                ) : (
                  <div className="space-y-2">
                    {accounts.filter((a) => a.status === "connected").map((acc) => {
                      const active = selectedAccountId === acc.id;
                      return (
                        <div
                          key={acc.id}
                          onClick={() => setSelectedAccountId(acc.id)}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${active ? "border-primary bg-primary/8 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/40"}`}
                        >
                          <Avatar className="h-10 w-10 shrink-0">
                            <AvatarImage src={acc.profilePicture ?? undefined} />
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">{acc.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{acc.name}</p>
                            <p className="text-xs text-muted-foreground">{acc.pagesCount} page(s)</p>
                          </div>
                          {active ? <CheckCircle className="h-4 w-4 text-primary shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex justify-end pt-2">
                  <Button disabled={!selectedAccountId} onClick={() => setStep(1)}>
                    Next: Select Pages <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 1: Select Pages ─────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold text-base">Select Pages</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Choose which pages to post to.</p>
                </div>
                {pagesLoading ? (
                  <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
                ) : accountPages.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No active pages for this account.</p>
                ) : (
                  <div className="border rounded-xl overflow-hidden">
                    <div
                      onClick={toggleAll}
                      className="flex items-center gap-3 px-4 py-3 bg-muted/50 border-b cursor-pointer hover:bg-muted/70 transition-colors"
                    >
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                      <span className="text-sm font-semibold flex-1">Select All</span>
                      <Badge variant="outline" className="text-[10px]">{accountPages.length}</Badge>
                    </div>
                    <div className="max-h-52 overflow-y-auto divide-y divide-border/40">
                      {accountPages.map((page) => (
                        <div
                          key={page.id}
                          onClick={() => togglePage(page.id)}
                          className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-muted/30 ${selectedPageIds.includes(page.id) ? "bg-primary/5" : ""}`}
                        >
                          <Checkbox checked={selectedPageIds.includes(page.id)} onCheckedChange={() => togglePage(page.id)} />
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarImage src={page.profilePicture ?? undefined} />
                            <AvatarFallback className="text-[9px]">{page.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm truncate flex-1">{page.name}</span>
                          {page.followersCount ? <span className="text-xs text-muted-foreground shrink-0">{page.followersCount.toLocaleString()}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedPageIds.length > 0 && (
                  <p className="text-xs text-primary font-medium">{selectedPageIds.length} page(s) selected</p>
                )}
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
                  <Button disabled={selectedPageIds.length === 0} onClick={() => setStep(2)}>
                    Next: Content Type <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Content Type ─────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold text-base">Select Content Type</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">What kind of content are you posting?</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {CONTENT_TYPES.map(({ id, label, icon: Icon, hint }) => {
                    const active = contentType === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setContentType(id)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all ${active ? "border-primary bg-primary/8 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="text-[10px] text-muted-foreground text-center leading-tight">{hint}</p>
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                  <Button onClick={() => setStep(3)}>
                    Next: Upload <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 3: Upload ───────────────────────────────────── */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold text-base">Upload Content</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {contentType === "text" ? "Text posts don't need a file upload." : "Upload one or multiple files for bulk scheduling."}
                  </p>
                </div>

                {contentType !== "text" && (
                  <>
                    {/* Mode toggle */}
                    <div className="flex gap-2">
                      {(["single", "bulk"] as UploadMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => { setUploadMode(mode); setUploadedFiles([]); }}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${uploadMode === mode ? "border-primary bg-primary/8 text-primary" : "border-border hover:border-primary/30 text-muted-foreground"}`}
                        >
                          {mode === "single" ? <FileText className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                          {mode === "single" ? "Single Upload" : "Bulk Upload"}
                        </button>
                      ))}
                    </div>

                    {/* Drop zone */}
                    <div
                      className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={() => uploadMode === "single" ? fileInputRef.current?.click() : bulkInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const files = Array.from(e.dataTransfer.files);
                        addFiles(files);
                      }}
                    >
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm font-medium text-muted-foreground">
                        {uploadMode === "bulk" ? "Drop multiple files here or click to browse" : "Drop a file here or click to browse"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {acceptAttr.includes("video") ? "MP4, MOV, AVI up to 500MB" : acceptAttr.includes("image") ? "JPG, PNG, GIF, WebP" : "Any file"}
                      </p>
                    </div>

                    <input ref={fileInputRef} type="file" accept={acceptAttr} className="hidden"
                      onChange={(e) => addFiles(Array.from(e.target.files ?? []))} />
                    <input ref={bulkInputRef} type="file" accept={acceptAttr} multiple className="hidden"
                      onChange={(e) => addFiles(Array.from(e.target.files ?? []))} />

                    {/* File list */}
                    {uploadedFiles.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{uploadedFiles.length} file(s) ready</p>
                          {uploadMode === "bulk" && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => bulkInputRef.current?.click()}>
                              <Plus className="h-3 w-3" /> Add More
                            </Button>
                          )}
                        </div>
                        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                          {uploadedFiles.map(({ id, file, preview }) => (
                            <div key={id} className="flex items-center gap-2.5 p-2 bg-muted/40 rounded-lg">
                              <div className="h-9 w-12 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                                {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <Video className="h-4 w-4 text-muted-foreground/50" />}
                              </div>
                              <span className="text-xs truncate flex-1">{file.name}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">{(file.size / 1_048_576).toFixed(1)}MB</span>
                              <button onClick={() => removeFile(id)} className="text-muted-foreground hover:text-destructive shrink-0">
                                <XCircle className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {contentType === "text" && (
                  <div className="space-y-2">
                    <Label>Text Content</Label>
                    <textarea
                      rows={5}
                      placeholder="Write your post text here..."
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      className="flex w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    />
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                  <Button
                    disabled={contentType !== "text" && uploadedFiles.length === 0}
                    onClick={() => setStep(4)}
                  >
                    Next: Scheduler <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 4: Scheduler Settings ───────────────────────── */}
            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <h2 className="font-semibold text-base">Auto Continue Scheduler</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Set how many posts per day and when to start. Files are automatically spread across days.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><PlayCircle className="h-3.5 w-3.5" />Posts Per Day</Label>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setPostsPerDay((p) => Math.max(1, p - 1))}>-</Button>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={postsPerDay}
                        onChange={(e) => setPostsPerDay(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                        className="text-center font-semibold"
                      />
                      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setPostsPerDay((p) => Math.min(20, p + 1))}>+</Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Start Date</Label>
                    <Input
                      type="date"
                      value={startDate}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Start Time</Label>
                    <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </div>
                </div>

                {/* Schedule Preview */}
                {fileCount > 0 && startDate && startTime && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">Schedule Preview</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div className="bg-background rounded-lg p-2.5 border">
                        <p className="text-muted-foreground">Total Posts</p>
                        <p className="font-bold text-lg">{fileCount}</p>
                      </div>
                      <div className="bg-background rounded-lg p-2.5 border">
                        <p className="text-muted-foreground">Days Needed</p>
                        <p className="font-bold text-lg">{scheduleDays}</p>
                      </div>
                      <div className="bg-background rounded-lg p-2.5 border">
                        <p className="text-muted-foreground">Pages</p>
                        <p className="font-bold text-lg">{selectedPageIds.length}</p>
                      </div>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {schedule.slice(0, 6).map((iso, i) => (
                        <p key={i} className="text-xs text-muted-foreground">
                          Post {i + 1}: <span className="text-foreground font-medium">{fmtDate(iso, timezone)}</span>
                        </p>
                      ))}
                      {schedule.length > 6 && (
                        <p className="text-xs text-muted-foreground italic">...and {schedule.length - 6} more</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
                  <Button onClick={() => setStep(5)}>
                    Next: Details <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 5: Title / Caption / Hashtags ──────────────── */}
            {step === 5 && (
              <div className="space-y-5">
                <div>
                  <h2 className="font-semibold text-base">Post Details</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    These will be applied to all {fileCount} scheduled post{fileCount !== 1 ? "s" : ""}.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Title <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="e.g. Morning Motivation Reel"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  {fileCount > 1 && (
                    <p className="text-xs text-muted-foreground">For bulk uploads, posts will be numbered: "{title || "Title"} (1)", "(2)", etc.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Caption
                    <span className="text-muted-foreground font-normal text-xs ml-1">(optional)</span>
                  </Label>
                  <textarea
                    rows={3}
                    placeholder="Write a caption for all posts..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    className="flex w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5" />
                    Hashtags
                    <span className="text-muted-foreground font-normal text-xs ml-1">(optional)</span>
                  </Label>
                  <Input
                    placeholder="#motivation #viral #fyp"
                    value={hashtags}
                    onChange={(e) => setHashtags(e.target.value)}
                  />
                </div>

                {/* Summary card before confirming */}
                <div className="bg-muted/50 border rounded-xl p-4 space-y-2 text-sm">
                  <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Summary</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Account</span>
                    <span className="font-medium truncate">{accounts?.find((a) => a.id === selectedAccountId)?.name ?? "—"}</span>
                    <span className="text-muted-foreground">Pages</span>
                    <span className="font-medium">{selectedPageIds.length}</span>
                    <span className="text-muted-foreground">Content Type</span>
                    <span className="font-medium capitalize">{contentType}</span>
                    <span className="text-muted-foreground">Total Posts</span>
                    <span className="font-medium">{fileCount}</span>
                    <span className="text-muted-foreground">Posts/Day</span>
                    <span className="font-medium">{postsPerDay}</span>
                    <span className="text-muted-foreground">Days</span>
                    <span className="font-medium">{scheduleDays}</span>
                    <span className="text-muted-foreground">Starts</span>
                    <span className="font-medium">{startDate} at {startTime}</span>
                    <span className="text-muted-foreground">Timezone</span>
                    <span className="font-medium truncate">{timezone}</span>
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(4)}>Back</Button>
                  <Button
                    onClick={handleScheduleAll}
                    disabled={scheduling || !title.trim()}
                    className="gap-2 min-w-[160px]"
                  >
                    {scheduling ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Scheduling {scheduledCount}/{fileCount}...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        Schedule {fileCount} Post{fileCount !== 1 ? "s" : ""}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

          </CardContent>
        </Card>

        {/* Schedule Manager — filtered by current wizard selection */}
        <ScheduleManagerSection
          videos={managerVideos}
          loading={loadingVideos}
          postingNow={postingNow}
          onPostNow={handlePostNow}
          onDelete={handleDelete}
          onRefresh={fetchVideos}
          getPageName={getPageName}
          isFiltered={managerIsFiltered}
          filterSummary={filterSummary}
        />

      </div>
    </Layout>
  );
}
