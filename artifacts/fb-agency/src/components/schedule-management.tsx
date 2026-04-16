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
  Loader2, Zap, Trash2, ChevronRight, X,
} from "lucide-react";
import { authFetch, apiUrl, TIMEZONES } from "./schedule-management-utils";

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

interface ScheduleManagementProps {
  videos: ScheduledVideo[];
  loading: boolean;
  postingNow: Set<string>;
  onPostNow: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdated: (video: ScheduledVideo) => void;
  getPageName: (id: string) => string;
}

function formatDate(iso: string, tz: string) {
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

function VideoThumbnail({ video }: { video: ScheduledVideo }) {
  return (
    <div className="h-14 w-20 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden border border-border/40">
      {video.thumbnailUrl ? (
        <img src={video.thumbnailUrl} alt={video.title} className="h-full w-full object-cover" />
      ) : (
        <Play className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}

function EditModal({
  video,
  open,
  onClose,
  onUpdated,
  getPageName,
}: {
  video: ScheduledVideo;
  open: boolean;
  onClose: () => void;
  onUpdated: (v: ScheduledVideo) => void;
  getPageName: (id: string) => string;
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
      const resp = await authFetch(apiUrl(`/scheduled-videos/${video.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt, timezone }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Update failed");
      }
      const updated = await resp.json();
      onUpdated(updated);
      toast({ title: "Schedule updated!", description: `"${video.title}" rescheduled successfully.` });
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
            <Pencil className="h-4 w-4 text-primary" />
            Edit Schedule
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="rounded-lg bg-muted/50 px-3 py-2.5 border border-border/40">
            <p className="text-sm font-semibold truncate">{video.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Currently: {formatDate(video.scheduledAt, video.timezone)}
            </p>
          </div>

          <div className="space-y-2">
            <Label>New Date & Time</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={date}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setDate(e.target.value)}
              />
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
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

          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Target Pages</Label>
            <div className="flex flex-wrap gap-1.5">
              {video.pageIds.map((pid) => (
                <Badge key={pid} variant="outline" className="text-xs">
                  {getPageName(pid)}
                </Badge>
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

function FullListModal({
  title,
  videos,
  open,
  onClose,
  postingNow,
  onPostNow,
  onDelete,
  onEdit,
  getPageName,
  type,
}: {
  title: string;
  videos: ScheduledVideo[];
  open: boolean;
  onClose: () => void;
  postingNow: Set<string>;
  onPostNow: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (v: ScheduledVideo) => void;
  getPageName: (id: string) => string;
  type: "history" | "pending";
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === "history"
              ? <><History className="h-4 w-4 text-green-500" />{title}</>
              : <><CalendarClock className="h-4 w-4 text-yellow-500" />{title}</>
            }
            <Badge variant="secondary" className="ml-auto">{videos.length}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {videos.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {type === "history" ? "No posted videos yet." : "No pending videos."}
            </div>
          ) : (
            videos.map((v) => (
              <div key={v.id} className="flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-card hover:shadow-sm transition-shadow">
                <VideoThumbnail video={v} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm truncate">{v.title}</p>
                    {type === "history" ? (
                      <Badge className="bg-green-500/15 text-green-600 border-green-500/20 shrink-0 text-[10px]">
                        <CheckCircle2 className="h-3 w-3 mr-1" />Posted
                      </Badge>
                    ) : (
                      <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/20 shrink-0 text-[10px]">
                        <Clock className="h-3 w-3 mr-1" />Pending
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(v.scheduledAt, v.timezone)}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {v.pageIds.slice(0, 4).map((pid) => (
                      <Badge key={pid} variant="outline" className="text-[10px] px-1.5 py-0">{getPageName(pid)}</Badge>
                    ))}
                    {v.pageIds.length > 4 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{v.pageIds.length - 4} more</Badge>
                    )}
                  </div>
                  {type === "history" && v.postedCount > 0 && (
                    <p className="text-[11px] text-green-600 mt-1">Posted to {v.postedCount} page(s)</p>
                  )}
                  {v.errorMessage && (
                    <p className="text-[11px] text-destructive mt-1 bg-destructive/10 rounded px-2 py-0.5">{v.errorMessage}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {type === "pending" && onEdit && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onEdit(v)}>
                      <Pencil className="h-3 w-3" />Edit
                    </Button>
                  )}
                  {type === "pending" && (
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      disabled={postingNow.has(v.id) || v.status === "processing"}
                      onClick={() => onPostNow(v.id)}
                    >
                      {postingNow.has(v.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      Post
                    </Button>
                  )}
                  {type === "pending" && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDelete(v.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleManagement({
  videos,
  loading,
  postingNow,
  onPostNow,
  onDelete,
  onUpdated,
  getPageName,
}: ScheduleManagementProps) {
  const [editingVideo, setEditingVideo] = useState<ScheduledVideo | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [showAllPending, setShowAllPending] = useState(false);

  const postedVideos = videos.filter((v) => v.status === "posted").sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );
  const pendingVideos = videos.filter((v) => v.status === "pending" || v.status === "failed" || v.status === "processing").sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );

  const latestPosted = postedVideos[0];
  const latestPending = pendingVideos[0];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-52" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Schedule Management</h2>
        <Badge variant="secondary" className="text-xs">
          {pendingVideos.length} pending · {postedVideos.length} posted
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Scheduled History */}
        <Card className="rounded-2xl shadow-sm border border-border/60">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <div className="h-7 w-7 rounded-full bg-green-500/10 flex items-center justify-center">
                <History className="h-3.5 w-3.5 text-green-600" />
              </div>
              Scheduled History
              <Badge className="ml-auto text-[10px] bg-green-500/10 text-green-600 border-green-500/20">
                {postedVideos.length} posted
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {!latestPosted ? (
              <div className="py-6 text-center">
                <Play className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No posted videos yet</p>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/40">
                <VideoThumbnail video={latestPosted} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-1.5">
                    <p className="font-semibold text-sm truncate flex-1">{latestPosted.title}</p>
                    <Badge className="bg-green-500/15 text-green-600 border-green-500/20 shrink-0 text-[10px]">
                      <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Posted
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(latestPosted.scheduledAt, latestPosted.timezone)}
                  </p>
                  <p className="text-[11px] text-green-600 mt-1">
                    Posted to {latestPosted.postedCount} page(s)
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {latestPosted.pageIds.slice(0, 2).map((pid) => (
                      <Badge key={pid} variant="outline" className="text-[10px] px-1.5 py-0">{getPageName(pid)}</Badge>
                    ))}
                    {latestPosted.pageIds.length > 2 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{latestPosted.pageIds.length - 2}</Badge>
                    )}
                  </div>
                </div>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-1.5 h-8"
              onClick={() => setShowAllHistory(true)}
            >
              See All History
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>

        {/* Pending Schedule */}
        <Card className="rounded-2xl shadow-sm border border-border/60">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <div className="h-7 w-7 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <CalendarClock className="h-3.5 w-3.5 text-yellow-600" />
              </div>
              Pending Schedule
              <Badge className="ml-auto text-[10px] bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                {pendingVideos.length} pending
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {!latestPending ? (
              <div className="py-6 text-center">
                <CalendarClock className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No pending videos</p>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/40">
                <VideoThumbnail video={latestPending} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-1.5">
                    <p className="font-semibold text-sm truncate flex-1">{latestPending.title}</p>
                    <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/20 shrink-0 text-[10px]">
                      <Clock className="h-2.5 w-2.5 mr-0.5" />Pending
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(latestPending.scheduledAt, latestPending.timezone)}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {latestPending.pageIds.slice(0, 2).map((pid) => (
                      <Badge key={pid} variant="outline" className="text-[10px] px-1.5 py-0">{getPageName(pid)}</Badge>
                    ))}
                    {latestPending.pageIds.length > 2 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{latestPending.pageIds.length - 2}</Badge>
                    )}
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 flex-1"
                      onClick={() => setEditingVideo(latestPending)}
                    >
                      <Pencil className="h-3 w-3" />Edit
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1 flex-1"
                      disabled={postingNow.has(latestPending.id) || latestPending.status === "processing"}
                      onClick={() => onPostNow(latestPending.id)}
                    >
                      {postingNow.has(latestPending.id)
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Zap className="h-3 w-3" />
                      }
                      Post Now
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => onDelete(latestPending.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-1.5 h-8"
              onClick={() => setShowAllPending(true)}
            >
              See All Pending
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {editingVideo && (
        <EditModal
          video={editingVideo}
          open={!!editingVideo}
          onClose={() => setEditingVideo(null)}
          onUpdated={(updated) => {
            onUpdated(updated);
            setEditingVideo(null);
          }}
          getPageName={getPageName}
        />
      )}

      <FullListModal
        title="Scheduled History"
        type="history"
        videos={postedVideos}
        open={showAllHistory}
        onClose={() => setShowAllHistory(false)}
        postingNow={postingNow}
        onPostNow={onPostNow}
        onDelete={onDelete}
        getPageName={getPageName}
      />

      <FullListModal
        title="Pending Schedule"
        type="pending"
        videos={pendingVideos}
        open={showAllPending}
        onClose={() => setShowAllPending(false)}
        postingNow={postingNow}
        onPostNow={onPostNow}
        onDelete={onDelete}
        onEdit={setEditingVideo}
        getPageName={getPageName}
      />
    </div>
  );
}
