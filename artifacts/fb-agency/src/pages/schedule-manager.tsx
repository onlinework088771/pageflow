import { useState, useEffect, useCallback, useMemo } from "react";
import { Layout } from "@/components/layout";
import { useListAccounts, useListPages } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronRight, RefreshCw, CalendarClock, Users, Clock, CheckCircle2,
  AlertCircle, Loader2, Trash2, Zap, Pencil, Copy, Video, Film,
  Image as ImageIcon, Type, Search, X, Calendar, Globe, TrendingUp,
  Facebook, BarChart2, ArrowLeft,
} from "lucide-react";
import { authFetch, apiUrl, TIMEZONES } from "@/components/schedule-management-utils";
import { useAuth } from "@/contexts/auth-context";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type SVStatus = "pending" | "processing" | "posted" | "failed";
type ContentType = "reel" | "video" | "image" | "text";
type DateFilter = "all" | "today" | "tomorrow" | "week" | "month" | "custom";
type View = "accounts" | "pages" | "dashboard";

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
  status: SVStatus;
  errorMessage?: string;
  postedCount: number;
  createdAt: string;
}

interface PageStats {
  pending: number;
  published: number;
  failed: number;
  total: number;
  successRate: number;
  lastPosted?: string;
  nextScheduled?: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function fmtDate(iso: string, tz = "UTC") {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium", timeStyle: "short", timeZone: tz,
    }).format(new Date(iso));
  } catch { return iso; }
}

function fmtDateOnly(iso: string) {
  try { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso)); }
  catch { return iso; }
}

function fmtTimeOnly(iso: string, tz = "UTC") {
  try { return new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: tz }).format(new Date(iso)); }
  catch { return iso; }
}

function numFmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function detectContentType(v: ScheduledVideo): ContentType {
  if (!v.videoPath && !v.videoUrl) return "text";
  const src = v.videoPath || v.videoUrl || "";
  const ext = src.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return "image";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "reel";
  return "video";
}

function computeStats(videos: ScheduledVideo[]): PageStats {
  const pending = videos.filter((v) => v.status === "pending" || v.status === "processing").length;
  const published = videos.filter((v) => v.status === "posted").length;
  const failed = videos.filter((v) => v.status === "failed").length;
  const total = videos.length;
  const successRate = total > 0 ? Math.round((published / total) * 100) : 0;
  const postedItems = videos.filter((v) => v.status === "posted").sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const upcomingItems = videos.filter((v) => v.status === "pending" && new Date(v.scheduledAt) > new Date()).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return {
    pending, published, failed, total, successRate,
    lastPosted: postedItems[0]?.scheduledAt,
    nextScheduled: upcomingItems[0]?.scheduledAt,
  };
}

function applyDateFilter(videos: ScheduledVideo[], filter: DateFilter, customStart?: string, customEnd?: string): ScheduledVideo[] {
  if (filter === "all") return videos;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const afterTomorrow = new Date(today); afterTomorrow.setDate(today.getDate() + 2);
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
  const monthEnd = new Date(today); monthEnd.setMonth(today.getMonth() + 1);

  return videos.filter((v) => {
    const d = new Date(v.scheduledAt);
    if (filter === "today") return d >= today && d < tomorrow;
    if (filter === "tomorrow") return d >= tomorrow && d < afterTomorrow;
    if (filter === "week") return d >= today && d < weekEnd;
    if (filter === "month") return d >= today && d < monthEnd;
    if (filter === "custom" && customStart && customEnd) {
      const s = new Date(customStart); const e = new Date(customEnd); e.setDate(e.getDate() + 1);
      return d >= s && d < e;
    }
    return true;
  });
}

function applySearch(videos: ScheduledVideo[], q: string): ScheduledVideo[] {
  if (!q.trim()) return videos;
  const lower = q.toLowerCase();
  return videos.filter((v) =>
    v.title.toLowerCase().includes(lower) ||
    (v.description ?? "").toLowerCase().includes(lower) ||
    fmtDateOnly(v.scheduledAt).toLowerCase().includes(lower)
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: SVStatus }) {
  const map: Record<SVStatus, { label: string; cls: string; Icon: React.ElementType }> = {
    pending:    { label: "Pending",    cls: "text-yellow-600 border-yellow-400 bg-yellow-50 dark:bg-yellow-950",   Icon: Clock },
    processing: { label: "Processing", cls: "text-blue-600   border-blue-400   bg-blue-50   dark:bg-blue-950",     Icon: Loader2 },
    posted:     { label: "Published",  cls: "text-green-600  border-green-400  bg-green-50  dark:bg-green-950",    Icon: CheckCircle2 },
    failed:     { label: "Failed",     cls: "text-red-600    border-red-400    bg-red-50    dark:bg-red-950",      Icon: AlertCircle },
  };
  const { label, cls, Icon } = map[status];
  return (
    <Badge variant="outline" className={`${cls} text-[10px] px-1.5 py-0.5 gap-1 shrink-0`}>
      <Icon className={`h-2.5 w-2.5 ${status === "processing" ? "animate-spin" : ""}`} />
      {label}
    </Badge>
  );
}

function ContentTypeBadge({ type }: { type: ContentType }) {
  const map: Record<ContentType, { label: string; cls: string; Icon: React.ElementType }> = {
    reel:  { label: "Reel",  cls: "text-pink-600   bg-pink-50   border-pink-300",   Icon: Film },
    video: { label: "Video", cls: "text-purple-600 bg-purple-50 border-purple-300", Icon: Video },
    image: { label: "Image", cls: "text-green-600  bg-green-50  border-green-300",  Icon: ImageIcon },
    text:  { label: "Text",  cls: "text-blue-600   bg-blue-50   border-blue-300",   Icon: Type },
  };
  const { label, cls, Icon } = map[type];
  return (
    <Badge variant="outline" className={`${cls} text-[10px] px-1.5 py-0.5 gap-1 shrink-0`}>
      <Icon className="h-2.5 w-2.5" />{label}
    </Badge>
  );
}

function StatCard({ label, value, sub, colorClass }: { label: string; value: string | number; sub?: string; colorClass?: string }) {
  return (
    <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-muted/40 border border-border/40">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      <span className={`text-xl font-bold ${colorClass ?? ""}`}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground truncate">{sub}</span>}
    </div>
  );
}

/* ─── Edit Dialog ────────────────────────────────────────────────────────── */

interface EditDialogProps {
  video: ScheduledVideo | null;
  onClose: () => void;
  onSaved: (v: ScheduledVideo) => void;
}

const FB_CAPTION_LIMIT = 63_206;
const TITLE_MAX = 255;

function splitDescriptionAndHashtags(raw: string): { caption: string; hashtags: string } {
  const tags = (raw.match(/#[\w\u0080-\uFFFF]+/g) ?? []).join(" ");
  const caption = raw.replace(/#[\w\u0080-\uFFFF]+/g, "").replace(/\s{2,}/g, " ").trim();
  return { caption, hashtags: tags };
}

function EditDialog({ video, onClose, onSaved }: EditDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [dateVal, setDateVal] = useState("");
  const [timeVal, setTimeVal] = useState("");
  const [tz, setTz] = useState("America/New_York");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!video) return;
    setTitle(video.title);
    const { caption: cap, hashtags: tags } = splitDescriptionAndHashtags(video.description ?? "");
    setCaption(cap);
    setHashtags(tags);
    const d = new Date(video.scheduledAt);
    setDateVal(d.toISOString().split("T")[0]);
    setTimeVal(d.toTimeString().slice(0, 5));
    setTz(video.timezone || "America/New_York");
    setErrors({});
  }, [video]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Title is required.";
    else if (title.trim().length > TITLE_MAX) errs.title = `Title must be ${TITLE_MAX} characters or fewer.`;
    if (!dateVal || !timeVal) { errs.date = "Date and time are required."; }
    else {
      const [y, m, day] = dateVal.split("-").map(Number);
      const [h, min] = timeVal.split(":").map(Number);
      const dt = new Date(y, m - 1, day, h, min, 0, 0);
      if (dt <= new Date()) errs.date = "Scheduled date must be in the future.";
    }
    const fullDesc = [caption.trim(), hashtags.trim()].filter(Boolean).join("\n\n");
    if (fullDesc.length > FB_CAPTION_LIMIT) errs.caption = `Caption exceeds Facebook's limit of ${FB_CAPTION_LIMIT.toLocaleString()} characters.`;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!video) return;
    if (!validate()) return;
    const [y, m, day] = dateVal.split("-").map(Number);
    const [h, min] = timeVal.split(":").map(Number);
    const dt = new Date(y, m - 1, day, h, min, 0, 0);
    const fullDesc = [caption.trim(), hashtags.trim()].filter(Boolean).join("\n\n") || null;
    setSaving(true);
    try {
      const resp = await authFetch(apiUrl(`/scheduled-videos/${video.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: fullDesc, scheduledAt: dt.toISOString(), timezone: tz }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Save failed");
      const updated = await resp.json();
      onSaved(updated);
      toast({ title: "Schedule updated successfully." });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  const captionLen = [caption.trim(), hashtags.trim()].filter(Boolean).join("\n\n").length;

  return (
    <Dialog open={!!video} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" />Edit Scheduled Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Post Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Post title" maxLength={TITLE_MAX} />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
            <p className="text-[10px] text-muted-foreground text-right">{title.length}/{TITLE_MAX}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Caption</Label>
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write your post caption here…" rows={4} />
          </div>
          <div className="space-y-1.5">
            <Label>Hashtags</Label>
            <Textarea value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#hashtag1 #hashtag2 #hashtag3" rows={2} />
            <div className="flex items-center justify-between">
              {errors.caption
                ? <p className="text-xs text-destructive">{errors.caption}</p>
                : <span />}
              <p className={`text-[10px] text-right ml-auto ${captionLen > FB_CAPTION_LIMIT ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                {captionLen.toLocaleString()}/{FB_CAPTION_LIMIT.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={dateVal} onChange={(e) => setDateVal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Time</Label>
              <Input type="time" value={timeVal} onChange={(e) => setTimeVal(e.target.value)} />
            </div>
          </div>
          {errors.date && <p className="text-xs text-destructive -mt-2">{errors.date}</p>}
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Select value={tz} onValueChange={setTz}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-52">
                {TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Schedule Item Card ─────────────────────────────────────────────────── */

interface ScheduleItemCardProps {
  video: ScheduledVideo;
  postingNow: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPostNow: () => void;
  onRetry: () => void;
  onDuplicate: () => void;
}

function ScheduleItemCard({ video, postingNow, onEdit, onDelete, onPostNow, onRetry, onDuplicate }: ScheduleItemCardProps) {
  const ct = detectContentType(video);
  return (
    <div className="flex gap-3 p-3 sm:p-4 rounded-xl border border-border/60 bg-card hover:bg-muted/20 transition-colors group">
      <div className="h-16 w-24 sm:h-14 sm:w-20 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border/30">
        {video.thumbnailUrl ? (
          <img src={video.thumbnailUrl} alt={video.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1">
            {ct === "image" ? <ImageIcon className="h-5 w-5 text-muted-foreground/40" /> :
             ct === "text"  ? <Type className="h-5 w-5 text-muted-foreground/40" /> :
             ct === "reel"  ? <Film className="h-5 w-5 text-muted-foreground/40" /> :
             <Video className="h-5 w-5 text-muted-foreground/40" />}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-start gap-1.5">
          <ContentTypeBadge type={ct} />
          <StatusBadge status={video.status} />
        </div>
        <p className="text-sm font-semibold leading-tight line-clamp-1">{video.title}</p>
        {video.description && (
          <p className="text-xs text-muted-foreground line-clamp-1">{video.description}</p>
        )}
        {video.errorMessage && (
          <p className="text-xs text-red-500 line-clamp-1">{video.errorMessage}</p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />{fmtDateOnly(video.scheduledAt)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />{fmtTimeOnly(video.scheduledAt, video.timezone)}
          </span>
          <span className="flex items-center gap-1">
            <Globe className="h-3 w-3" />{video.timezone}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
        {(video.status === "pending") && (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-primary hover:bg-primary/10" title="Post Now" onClick={onPostNow} disabled={postingNow}>
            {postingNow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          </Button>
        )}
        {(video.status === "failed") && (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-orange-500 hover:bg-orange-500/10" title="Retry" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
        {video.status === "pending" && (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Edit" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Duplicate" onClick={onDuplicate}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Delete" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Dashboard View ─────────────────────────────────────────────────────── */

interface DashboardViewProps {
  pageId: string;
  pageName: string;
  pagePicture?: string | null;
  pageCategory?: string | null;
  pageFollowers?: number;
  allVideos: ScheduledVideo[];
  loading: boolean;
  onRefresh: () => void;
  onVideoUpdate: (v: ScheduledVideo) => void;
  onVideoDelete: (id: string) => void;
  onVideoAdd: (v: ScheduledVideo) => void;
}

function DashboardView({ pageId, pageName, pagePicture, pageCategory, pageFollowers, allVideos, loading, onRefresh, onVideoUpdate, onVideoDelete, onVideoAdd }: DashboardViewProps) {
  const { toast } = useToast();

  const pageVideos = useMemo(() => allVideos.filter((v) => v.pageIds.includes(pageId)), [allVideos, pageId]);

  const [activeTab, setActiveTab] = useState<"all" | "pending" | "published" | "failed">("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ctFilter, setCtFilter] = useState("all");
  const [searchRaw, setSearchRaw] = useState("");
  const [search, setSearch] = useState("");

  const [editVideo, setEditVideo] = useState<ScheduledVideo | null>(null);
  const [deleteVideo, setDeleteVideo] = useState<ScheduledVideo | null>(null);
  const [postingNow, setPostingNow] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw), 350);
    return () => clearTimeout(t);
  }, [searchRaw]);

  const tabFiltered = useMemo(() => {
    if (activeTab === "pending") return pageVideos.filter((v) => v.status === "pending" || v.status === "processing");
    if (activeTab === "published") return pageVideos.filter((v) => v.status === "posted");
    if (activeTab === "failed") return pageVideos.filter((v) => v.status === "failed");
    return pageVideos;
  }, [pageVideos, activeTab]);

  const filtered = useMemo(() => {
    let items = tabFiltered;
    items = applyDateFilter(items, dateFilter, customStart, customEnd);
    if (statusFilter !== "all") items = items.filter((v) => v.status === statusFilter);
    if (ctFilter !== "all") items = items.filter((v) => detectContentType(v) === ctFilter);
    items = applySearch(items, search);
    return items.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [tabFiltered, dateFilter, customStart, customEnd, statusFilter, ctFilter, search]);

  const stats = computeStats(pageVideos);

  const scheduleRange = useMemo(() => {
    const upcoming = filtered.filter((v) => v.status === "pending" || v.status === "processing");
    if (!upcoming.length) return null;
    const sorted = [...upcoming].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return { first: sorted[0].scheduledAt, last: sorted[sorted.length - 1].scheduledAt };
  }, [filtered]);

  const nextScheduledItem = useMemo(() => {
    const now = new Date().toISOString();
    return filtered
      .filter((v) => (v.status === "pending" || v.status === "processing") && v.scheduledAt > now)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0] ?? null;
  }, [filtered]);

  const tabs = [
    { key: "all", label: "All", count: pageVideos.length },
    { key: "pending", label: "Pending", count: pageVideos.filter((v) => v.status === "pending" || v.status === "processing").length },
    { key: "published", label: "Published", count: pageVideos.filter((v) => v.status === "posted").length },
    { key: "failed", label: "Failed", count: pageVideos.filter((v) => v.status === "failed").length },
  ] as const;

  async function handlePostNow(id: string) {
    setPostingNow((p) => new Set(p).add(id));
    try {
      const resp = await authFetch(apiUrl(`/scheduled-videos/${id}/post-now`), { method: "POST" });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Failed");
      onVideoUpdate({ ...pageVideos.find((v) => v.id === id)!, status: "processing" });
      toast({ title: "Posting now!", description: "Status will update shortly." });
      setTimeout(onRefresh, 4000);
      setTimeout(onRefresh, 9000);
    } catch (err: any) {
      toast({ title: "Failed to post", description: err.message, variant: "destructive" });
    } finally { setPostingNow((p) => { const n = new Set(p); n.delete(id); return n; }); }
  }

  async function handleRetry(v: ScheduledVideo) {
    try {
      const resp = await authFetch(apiUrl(`/scheduled-videos/${v.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: v.scheduledAt, timezone: v.timezone }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Failed");
      onVideoUpdate({ ...v, status: "pending", errorMessage: undefined });
      toast({ title: "Reset to Pending" });
    } catch (err: any) {
      toast({ title: "Retry failed", description: err.message, variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
    try {
      const resp = await authFetch(apiUrl(`/scheduled-videos/${id}`), { method: "DELETE" });
      if (!resp.ok && resp.status !== 204) throw new Error("Delete failed");
      onVideoDelete(id);
      toast({ title: "Deleted" });
    } catch {
      toast({ title: "Error deleting", variant: "destructive" });
    } finally { setDeleteVideo(null); }
  }

  async function handleDuplicate(v: ScheduledVideo) {
    try {
      const resp = await authFetch(apiUrl(`/scheduled-videos/${v.id}/duplicate`), { method: "POST" });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Failed");
      const newV = await resp.json();
      onVideoAdd(newV);
      toast({ title: "Duplicated!", description: "A copy was created." });
    } catch (err: any) {
      toast({ title: "Duplicate failed", description: err.message, variant: "destructive" });
    }
  }

  function clearFilters() {
    setDateFilter("all");
    setStatusFilter("all");
    setCtFilter("all");
    setCustomStart("");
    setCustomEnd("");
    setSearchRaw("");
  }

  const hasFilters = dateFilter !== "all" || statusFilter !== "all" || ctFilter !== "all" || search;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-3 p-4 rounded-xl border bg-card">
        <Avatar className="h-12 w-12 border shadow-sm shrink-0">
          <AvatarImage src={pagePicture ?? undefined} />
          <AvatarFallback className="font-bold text-sm">{pageName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base leading-tight truncate">{pageName}</p>
          <p className="text-xs text-muted-foreground">{pageCategory ?? "Facebook Page"}{pageFollowers ? ` · ${numFmt(pageFollowers)} followers` : ""}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Schedule Range + Next Scheduled */}
      {(scheduleRange || nextScheduledItem) && (
        <div className="flex flex-col sm:flex-row gap-2">
          {scheduleRange && (
            <div className="flex-1 flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/30">
              <Calendar className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Schedule Range</p>
                <p className="text-sm font-semibold leading-tight">
                  {fmtDateOnly(scheduleRange.first)}
                  {scheduleRange.first !== scheduleRange.last && (
                    <> <span className="text-muted-foreground">→</span> {fmtDateOnly(scheduleRange.last)}</>
                  )}
                </p>
              </div>
            </div>
          )}
          {nextScheduledItem && (
            <div className="flex-1 flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
              <CalendarClock className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Next Scheduled</p>
                <p className="text-sm font-semibold leading-tight">
                  {fmtDateOnly(nextScheduledItem.scheduledAt)}
                  <span className="text-muted-foreground"> • </span>
                  {fmtTimeOnly(nextScheduledItem.scheduledAt, nextScheduledItem.timezone)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatCard label="Pending" value={stats.pending} colorClass="text-yellow-600" />
        <StatCard label="Published" value={stats.published} colorClass="text-green-600" />
        <StatCard label="Failed" value={stats.failed} colorClass="text-red-600" />
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Success Rate" value={`${stats.successRate}%`} colorClass={stats.successRate >= 80 ? "text-green-600" : stats.successRate >= 50 ? "text-yellow-600" : "text-red-600"} />
        <StatCard
          label="Next Scheduled"
          value={stats.nextScheduled ? fmtTimeOnly(stats.nextScheduled) : "—"}
          sub={stats.nextScheduled ? fmtDateOnly(stats.nextScheduled) : undefined}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl border border-border/40 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-1 justify-center ${
              activeTab === tab.key ? "bg-background shadow-sm text-foreground border border-border/60" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === tab.key ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20"}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Search title, caption, or date…"
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
          />
          {searchRaw && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearchRaw("")}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
          <SelectTrigger className="h-9 w-full sm:w-36 text-xs"><SelectValue placeholder="Date" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Dates</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="tomorrow">Tomorrow</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-full sm:w-32 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="posted">Published</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ctFilter} onValueChange={setCtFilter}>
          <SelectTrigger className="h-9 w-full sm:w-32 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="reel">Reel</SelectItem>
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="image">Image</SelectItem>
            <SelectItem value="text">Text</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-xs gap-1 shrink-0" onClick={clearFilters}>
            <X className="h-3 w-3" />Clear
          </Button>
        )}
      </div>

      {/* Custom date range */}
      {dateFilter === "custom" && (
        <div className="flex flex-col sm:flex-row gap-2 p-3 rounded-xl bg-muted/30 border border-border/40">
          <div className="flex items-center gap-2 flex-1">
            <Label className="text-xs whitespace-nowrap">From</Label>
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="flex items-center gap-2 flex-1">
            <Label className="text-xs whitespace-nowrap">To</Label>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <CalendarClock className="h-10 w-10 text-muted-foreground/25" />
          <p className="text-sm font-medium text-muted-foreground">No posts match your filters</p>
          {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => (
            <ScheduleItemCard
              key={v.id}
              video={v}
              postingNow={postingNow.has(v.id)}
              onEdit={() => setEditVideo(v)}
              onDelete={() => setDeleteVideo(v)}
              onPostNow={() => handlePostNow(v.id)}
              onRetry={() => handleRetry(v)}
              onDuplicate={() => handleDuplicate(v)}
            />
          ))}
        </div>
      )}

      <EditDialog
        video={editVideo}
        onClose={() => setEditVideo(null)}
        onSaved={(updated) => { onVideoUpdate(updated); setEditVideo(null); }}
      />

      <AlertDialog open={!!deleteVideo} onOpenChange={(o) => { if (!o) setDeleteVideo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scheduled Post?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteVideo?.title}" will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteVideo && handleDelete(deleteVideo.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */

export default function ScheduleManager() {
  const { data: accounts, isLoading: accountsLoading } = useListAccounts({});
  const { data: allPages, isLoading: pagesLoading } = useListPages({});
  const [videos, setVideos] = useState<ScheduledVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const [view, setView] = useState<View>("accounts");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    try {
      const resp = await authFetch(apiUrl("/scheduled-videos"));
      if (resp.ok) setVideos(await resp.json());
    } catch { } finally { setVideosLoading(false); }
  }, []);

  // Admin-only reset action: removes every scheduled video (any status) by
  // calling the existing DELETE /scheduled-videos/:id endpoint once per item —
  // the same call the per-item Trash button uses. There is no separate
  // queue/job table in this app; scheduled_videos rows ARE the queue, so
  // clearing them removes all pending jobs too. Nothing else is touched.
  const handleDeleteAllSchedules = useCallback(async () => {
    if (!videos.length) return;
    setIsDeletingAll(true);
    let removed = 0;
    let failed = 0;
    for (const v of videos) {
      try {
        const resp = await authFetch(apiUrl(`/scheduled-videos/${v.id}`), { method: "DELETE" });
        if (resp.ok || resp.status === 204) removed += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setIsDeletingAll(false);
    setIsDeleteAllOpen(false);
    await fetchVideos();
    if (failed > 0) {
      toast({
        title: `Removed ${removed} schedule${removed === 1 ? "" : "s"}, ${failed} failed`,
        variant: "destructive",
      });
    } else {
      toast({ title: `Removed ${removed} schedule${removed === 1 ? "" : "s"}` });
    }
  }, [videos, fetchVideos, toast]);

  useEffect(() => {
    fetchVideos();
    const t = setInterval(fetchVideos, 10_000);
    return () => clearInterval(t);
  }, [fetchVideos]);

  const selectedAccount = accounts?.find((a) => a.id === selectedAccountId) ?? null;
  const accountPages = useMemo(
    () => (allPages ?? []).filter((p) => p.accountId === selectedAccountId),
    [allPages, selectedAccountId]
  );
  const selectedPage = accountPages.find((p) => p.id === selectedPageId) ?? null;

  function goToAccounts() { setView("accounts"); setSelectedAccountId(null); setSelectedPageId(null); }
  function goToPages(accountId: string) { setSelectedAccountId(accountId); setView("pages"); setSelectedPageId(null); }
  function goToDashboard(pageId: string) { setSelectedPageId(pageId); setView("dashboard"); }

  function getAccountStats(accountId: string) {
    const pageIds = (allPages ?? []).filter((p) => p.accountId === accountId).map((p) => p.id);
    const avs = videos.filter((v) => v.pageIds.some((pid) => pageIds.includes(pid)));
    return computeStats(avs);
  }

  function getPageStats(pageId: string) {
    return computeStats(videos.filter((v) => v.pageIds.includes(pageId)));
  }

  const loading = accountsLoading || pagesLoading || videosLoading;

  /* Breadcrumb */
  function Breadcrumb() {
    return (
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-5 flex-wrap">
        <button onClick={goToAccounts} className="hover:text-foreground transition-colors font-medium flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" />Schedule Manager
        </button>
        {selectedAccount && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <button onClick={() => view === "dashboard" ? goToPages(selectedAccount.id) : undefined} className={`hover:text-foreground transition-colors font-medium ${view === "dashboard" ? "cursor-pointer" : "text-foreground"}`}>
              {selectedAccount.name}
            </button>
          </>
        )}
        {selectedPage && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <span className="text-foreground font-medium">{selectedPage.name}</span>
          </>
        )}
      </nav>
    );
  }

  /* ── ACCOUNTS VIEW ────────────────────────────────────────────────── */
  if (view === "accounts") {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <CalendarClock className="h-6 w-6 text-primary" />Schedule Manager
              </h1>
              <p className="text-muted-foreground text-sm mt-1">Select a Facebook account to manage its scheduled posts page by page.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isAdmin && (
                <AlertDialog open={isDeleteAllOpen} onOpenChange={(o) => { if (!isDeletingAll) setIsDeleteAllOpen(o); }}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                      disabled={isDeletingAll || !videos.length}
                    >
                      {isDeletingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Delete All Schedules
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete all scheduled videos?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete ALL scheduled videos (Pending, Completed, and Failed history). This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeletingAll}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={(e) => { e.preventDefault(); handleDeleteAllSchedules(); }}
                        disabled={isDeletingAll}
                      >
                        {isDeletingAll && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                        Delete All
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchVideos}>
                <RefreshCw className="h-3.5 w-3.5" />Refresh
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
            </div>
          ) : !accounts?.length ? (
            <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
              <div className="bg-primary/10 p-4 rounded-full"><Facebook className="h-8 w-8 text-primary" /></div>
              <h3 className="text-lg font-bold">No Facebook Accounts</h3>
              <p className="text-muted-foreground text-sm max-w-sm">Connect a Facebook account in FB Accounts to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map((acc) => {
                const s = getAccountStats(acc.id);
                return (
                  <Card key={acc.id} className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group" onClick={() => goToPages(acc.id)}>
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-11 w-11 border shadow-sm">
                            <AvatarImage src={acc.profilePicture ?? undefined} />
                            <AvatarFallback className="text-sm font-bold bg-blue-500/10 text-blue-600">{acc.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-sm leading-tight line-clamp-1">{acc.name}</p>
                            <p className="text-xs text-muted-foreground">{acc.pagesCount ?? 0} page{acc.pagesCount !== 1 ? "s" : ""}</p>
                          </div>
                        </div>
                        <Badge className={acc.status === "connected" ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-red-500/10 text-red-600 border-red-500/20"} variant="outline">
                          {acc.status === "connected" ? "Connected" : acc.status}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                          <p className="text-base font-bold text-yellow-600">{s.pending}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Pending</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                          <p className="text-base font-bold text-green-600">{s.published}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Published</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                          <p className="text-base font-bold text-red-600">{s.failed}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Failed</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                          <p className="text-base font-bold">{s.total}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Total</p>
                        </div>
                      </div>

                      <div className="pt-2 border-t flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Click to manage pages</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </Layout>
    );
  }

  /* ── PAGES VIEW ───────────────────────────────────────────────────── */
  if (view === "pages") {
    const connectedPages = accountPages.filter((p) => p.status === "active" || p.status === "paused" || p.status === "connected");
    return (
      <Layout>
        <div className="space-y-6">
          <Breadcrumb />
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToAccounts}>
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Button>
                <h2 className="text-xl font-bold tracking-tight">{selectedAccount?.name}</h2>
              </div>
              <p className="text-muted-foreground text-sm">Select a page to manage its scheduled posts.</p>
            </div>
          </div>

          {pagesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
            </div>
          ) : !connectedPages.length ? (
            <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
              <div className="bg-primary/10 p-4 rounded-full"><Users className="h-8 w-8 text-primary" /></div>
              <h3 className="text-lg font-bold">No Pages Found</h3>
              <p className="text-muted-foreground text-sm max-w-sm">Sync pages for this account in FB Accounts first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {connectedPages.map((page) => {
                const s = getPageStats(page.id);
                return (
                  <Card key={page.id} className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group" onClick={() => goToDashboard(page.id)}>
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-11 w-11 border shadow-sm shrink-0">
                          <AvatarImage src={page.profilePicture ?? undefined} />
                          <AvatarFallback className="font-bold text-sm">{page.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm leading-tight line-clamp-1">{page.name}</p>
                          <p className="text-xs text-muted-foreground">{page.category ?? "Facebook Page"}</p>
                          <p className="text-xs text-muted-foreground">{numFmt(page.followersCount ?? 0)} followers</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                          <p className="text-base font-bold text-yellow-600">{s.pending}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Pending</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                          <p className="text-base font-bold text-green-600">{s.published}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Published</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                          <p className="text-base font-bold text-red-600">{s.failed}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Failed</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                          <p className="text-base font-bold">{s.successRate}%</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Success</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border-t pt-2">
                        <BarChart2 className="h-3 w-3" />
                        {s.nextScheduled ? `Next: ${fmtDate(s.nextScheduled)}` : "No upcoming posts"}
                        <ChevronRight className="h-3.5 w-3.5 ml-auto text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </Layout>
    );
  }

  /* ── DASHBOARD VIEW ───────────────────────────────────────────────── */
  return (
    <Layout>
      <div className="space-y-0">
        <Breadcrumb />
        <div className="flex items-center gap-2 mb-5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => selectedAccountId ? goToPages(selectedAccountId) : goToAccounts()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold tracking-tight">{selectedPage?.name ?? "Page Dashboard"}</h2>
            <p className="text-muted-foreground text-xs">Viewing schedule for this page only</p>
          </div>
        </div>

        <DashboardView
          pageId={selectedPageId!}
          pageName={selectedPage?.name ?? "Page"}
          pagePicture={selectedPage?.profilePicture}
          pageCategory={selectedPage?.category}
          pageFollowers={selectedPage?.followersCount}
          allVideos={videos}
          loading={videosLoading}
          onRefresh={fetchVideos}
          onVideoUpdate={(v) => setVideos((prev) => prev.map((x) => (x.id === v.id ? v : x)))}
          onVideoDelete={(id) => setVideos((prev) => prev.filter((x) => x.id !== id))}
          onVideoAdd={(v) => setVideos((prev) => [v, ...prev])}
        />
      </div>
    </Layout>
  );
}
