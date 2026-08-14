import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, Clock, Play, History, CalendarClock, Pencil,
  Loader2, Zap, Trash2, Copy, Search, X, RotateCcw,
  AlertCircle, RefreshCw,
} from "lucide-react";
import { authFetch, apiUrl, TIMEZONES } from "./schedule-management-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduledVideo {
  id: string;
  title: string;
  description?: string;
  postType?: string;
  publishMode?: "video" | "reel";
  reelId?: string;
  publishedReelIds?: Record<string, string>;
  collaborationEnabled?: boolean;
  collaboratorPageIds?: string[];
  collaborationStatus?: "pending" | "invited" | "partial" | "failed" | "skipped";
  collaborationResults?: Record<string, any>;
  collaborationError?: string;
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

type StatusFilter = "all" | "pending" | "processing" | "posted" | "failed" | "missed";

interface ScheduleManagementProps {
  videos: ScheduledVideo[];
  loading: boolean;
  postingNow: Set<string>;
  onPostNow: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onUpdated: (video: ScheduledVideo) => void;
  getPageName: (id: string) => string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string, tz: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium", timeStyle: "short", timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function derivedStatus(v: ScheduledVideo): StatusFilter {
  if (v.status === "posted") return "posted";
  if (v.status === "processing") return "processing";
  if (v.status === "failed") return "failed";
  if (v.status === "pending" && new Date(v.scheduledAt) < new Date()) return "missed";
  return "pending";
}

const STATUS_CONFIG: Record<StatusFilter, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  all:        { label: "All",        color: "text-foreground",  bg: "bg-muted/40",              icon: CalendarClock },
  pending:    { label: "Pending",    color: "text-yellow-600",  bg: "bg-yellow-500/10",         icon: Clock },
  processing: { label: "Processing", color: "text-blue-600",    bg: "bg-blue-500/10",           icon: RefreshCw },
  posted:     { label: "Completed",  color: "text-green-600",   bg: "bg-green-500/10",          icon: CheckCircle2 },
  failed:     { label: "Failed",     color: "text-destructive", bg: "bg-destructive/10",        icon: AlertCircle },
  missed:     { label: "Missed",     color: "text-orange-600",  bg: "bg-orange-500/10",         icon: RotateCcw },
};

function StatusBadge({ status }: { status: StatusFilter }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <Badge className={`${cfg.bg} ${cfg.color} border-0 text-[10px] font-medium flex items-center gap-1 py-0.5`}>
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------

function VideoThumb({ video }: { video: ScheduledVideo }) {
  return (
    <div className="h-12 w-16 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 overflow-hidden border border-border/40">
      {video.thumbnailUrl ? (
        <img src={video.thumbnailUrl} alt={video.title} className="h-full w-full object-cover" />
      ) : (
        <Play className="h-4 w-4 text-muted-foreground/60" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------

function EditModal({
  video, open, onClose, onUpdated, getPageName,
}: {
  video: ScheduledVideo; open: boolean; onClose: () => void;
  onUpdated: (v: ScheduledVideo) => void; getPageName: (id: string) => string;
}) {
  const { toast } = useToast();
  const scheduled = new Date(video.scheduledAt);
  const [date, setDate] = useState(scheduled.toISOString().split("T")[0]);
  const [time, setTime] = useState(scheduled.toTimeString().slice(0, 5));
  const [timezone, setTimezone] = useState(video.timezone);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const scheduledAt = new Date(`${date}T${time}`).toISOString();
      const r = await authFetch(apiUrl(`/scheduled-videos/${video.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt, timezone }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Update failed");
      }
      onUpdated(await r.json());
      toast({ title: "Schedule updated!" });
      onClose();
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />Edit Schedule
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="rounded-lg bg-muted/50 px-3 py-2.5 border">
            <p className="text-sm font-semibold truncate">{video.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Currently: {formatDate(video.scheduledAt, video.timezone)}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>New Date & Time</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={date} min={new Date().toISOString().split("T")[0]} onChange={(e) => setDate(e.target.value)} />
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Pages</Label>
            <div className="flex flex-wrap gap-1.5">
              {video.pageIds.map((pid) => (
                <Badge key={pid} variant="outline" className="text-xs">{getPageName(pid)}</Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving...</> : "Update Schedule"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Video row card
// ---------------------------------------------------------------------------

function VideoCard({
  video, postingNow, onPostNow, onDelete, onDuplicate, onEdit, getPageName,
}: {
  video: ScheduledVideo;
  postingNow: Set<string>;
  onPostNow: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onEdit: (v: ScheduledVideo) => void;
  getPageName: (id: string) => string;
}) {
  const ds = derivedStatus(video);
  const canAct = video.status === "pending" || video.status === "failed";
  const isPosting = postingNow.has(video.id) || video.status === "processing";

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border bg-card hover:shadow-sm transition-shadow">
      <VideoThumb video={video} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <p className="font-semibold text-sm truncate flex-1">{video.title}</p>
          <StatusBadge status={ds} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(video.scheduledAt, video.timezone)}</p>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {(video.publishMode === "reel" || video.postType === "reel") && (
            <Badge className="bg-pink-500/10 text-pink-600 border-0 text-[10px] px-1.5 py-0">Reel</Badge>
          )}
          {video.collaborationEnabled && (
            <Badge className="bg-purple-500/10 text-purple-600 border-0 text-[10px] px-1.5 py-0">
              Collab ({video.collaboratorPageIds?.length ?? 0})
              {video.collaborationStatus === "invited" ? " ✓" : video.collaborationStatus === "failed" ? " ⚠️" : ""}
            </Badge>
          )}
          {video.pageIds.slice(0, 3).map((pid) => (
            <Badge key={pid} variant="outline" className="text-[10px] px-1.5 py-0">{getPageName(pid)}</Badge>
          ))}
          {video.pageIds.length > 3 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{video.pageIds.length - 3} more</Badge>
          )}
        </div>
        {video.status === "posted" && video.postedCount > 0 && (
          <p className="text-[11px] text-green-600 mt-1">✓ Posted to {video.postedCount} page(s)</p>
        )}
        {video.errorMessage && (
          <p className="text-[11px] text-destructive mt-1 bg-destructive/10 rounded px-2 py-0.5 truncate">{video.errorMessage}</p>
        )}
      </div>
      {/* Actions */}
      <div className="flex flex-col gap-1 shrink-0">
        {canAct && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => onEdit(video)}>
            <Pencil className="h-3 w-3" />Edit
          </Button>
        )}
        {(canAct || ds === "missed") && (
          <Button size="sm" className="h-7 px-2 text-xs gap-1" disabled={isPosting} onClick={() => onPostNow(video.id)}>
            {isPosting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            Post
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-primary"
          onClick={() => onDuplicate(video.id)}>
          <Copy className="h-3 w-3" />Copy
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(video.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ScheduleManagement({
  videos, loading, postingNow, onPostNow, onDelete, onDuplicate, onUpdated, getPageName,
}: ScheduleManagementProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [editingVideo, setEditingVideo] = useState<ScheduledVideo | null>(null);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // Compute counts per status
  const counts: Record<StatusFilter, number> = {
    all:        videos.length,
    pending:    videos.filter((v) => derivedStatus(v) === "pending").length,
    processing: videos.filter((v) => derivedStatus(v) === "processing").length,
    posted:     videos.filter((v) => derivedStatus(v) === "posted").length,
    failed:     videos.filter((v) => derivedStatus(v) === "failed").length,
    missed:     videos.filter((v) => derivedStatus(v) === "missed").length,
  };

  // Apply filters
  const filtered = videos.filter((v) => {
    const ds = derivedStatus(v);
    const matchStatus = statusFilter === "all" || ds === statusFilter;
    const matchSearch = !search.trim() || v.title.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  // Sort: pending/missed first (by scheduledAt asc), then posted/failed (by scheduledAt desc)
  const sorted = [...filtered].sort((a, b) => {
    const aPosted = a.status === "posted";
    const bPosted = b.status === "posted";
    if (aPosted !== bPosted) return aPosted ? 1 : -1;
    const aTime = new Date(a.scheduledAt).getTime();
    const bTime = new Date(b.scheduledAt).getTime();
    return aPosted ? bTime - aTime : aTime - bTime;
  });

  const STATUS_TABS: StatusFilter[] = ["all", "pending", "processing", "posted", "failed", "missed"];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold tracking-tight">Schedule Manager</h2>
        <Badge variant="secondary" className="text-xs">
          {counts.pending} pending · {counts.posted} completed · {counts.failed} failed
          {counts.missed > 0 ? ` · ${counts.missed} missed` : ""}
        </Badge>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1">
        {STATUS_TABS.map((tab) => {
          const cfg = STATUS_CONFIG[tab];
          const Icon = cfg.icon;
          const isActive = statusFilter === tab;
          return (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                isActive
                  ? `${cfg.bg} ${cfg.color} border-current/20`
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              <Icon className="h-3 w-3" />
              {cfg.label}
              <span className={`ml-0.5 h-4 min-w-4 rounded-full text-[10px] flex items-center justify-center px-1 ${
                isActive ? "bg-current/10" : "bg-muted"
              }`}>{counts[tab]}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          className="pl-9 h-9 text-sm"
          placeholder="Search by title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Results */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <CalendarClock className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {search ? `No results for "${search}"` : `No ${statusFilter === "all" ? "" : statusFilter + " "}posts`}
          </p>
          {statusFilter !== "all" && (
            <button
              className="text-xs text-primary mt-1 hover:underline"
              onClick={() => setStatusFilter("all")}
            >
              Clear filter
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              postingNow={postingNow}
              onPostNow={onPostNow}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onEdit={setEditingVideo}
              getPageName={getPageName}
            />
          ))}
        </div>
      )}

      {editingVideo && (
        <EditModal
          video={editingVideo}
          open={!!editingVideo}
          onClose={() => setEditingVideo(null)}
          onUpdated={(updated) => { onUpdated(updated); setEditingVideo(null); }}
          getPageName={getPageName}
        />
      )}
    </div>
  );
}
