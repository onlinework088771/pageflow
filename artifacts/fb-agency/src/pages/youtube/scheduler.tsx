import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { authFetch, apiUrl, TIMEZONES } from "@/components/schedule-management-utils";
import { useListYoutubeChannels, getListYoutubeChannelsQueryKey } from "@workspace/api-client-react";
import { QueryErrorState } from "@/components/query-error-state";

/* ─── Timezone helpers ───────────────────────────────────────────────────── */

/**
 * Convert a wall-clock datetime-local string ("YYYY-MM-DDTHH:MM") in the given
 * IANA timezone to a UTC ISO-8601 string.  Iterates twice to handle DST gaps.
 */
function wallClockToUTC(localDatetime: string, tz: string): string {
  const tIdx = localDatetime.indexOf("T");
  if (tIdx === -1) return localDatetime;
  const dateStr = localDatetime.slice(0, tIdx);
  const timeStr = localDatetime.slice(tIdx + 1);
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  let utcMs = Date.UTC(y, m - 1, d, h, min, 0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  for (let i = 0; i < 2; i++) {
    const parts = fmt.formatToParts(new Date(utcMs));
    const get = (type: string) => parseInt(parts.find((p) => p.type === type)!.value, 10);
    const localH = get("hour") % 24;
    const localMin = get("minute");
    const localD = get("day"), localMo = get("month"), localY = get("year");
    const localMs = Date.UTC(localY, localMo - 1, localD, localH, localMin, 0);
    utcMs += Date.UTC(y, m - 1, d, h, min, 0) - localMs;
  }
  return new Date(utcMs).toISOString();
}

/**
 * Format a UTC ISO timestamp in the given IANA timezone for display.
 */
function fmtScheduledAt(isoUtc: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(isoUtc));
  } catch {
    return isoUtc;
  }
}
import {
  Youtube,
  Plus,
  Trash2,
  Clock,
  Film,
  Smartphone,
  CalendarClock,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/* ─── Types ─────────────────────────────────────────────────────────── */

type VideoType = "short" | "long";
type PrivacyStatus = "public" | "unlisted" | "private";
type ScheduledStatus = "pending" | "processing" | "posted" | "failed";

interface YoutubeChannel {
  id: string;
  name: string;
  thumbnailUrl?: string;
}

interface YoutubeScheduledVideo {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  videoType: VideoType;
  videoUrl?: string;
  videoPath?: string;
  privacyStatus: PrivacyStatus;
  scheduledAt: string;
  timezone: string;
  status: ScheduledStatus;
  errorMessage?: string;
}

/* ─── API helpers ───────────────────────────────────────────────────── */

async function fetchScheduled(): Promise<YoutubeScheduledVideo[]> {
  const res = await authFetch(apiUrl("/youtube/scheduled-videos"));
  if (!res.ok) throw new Error("Failed to load scheduled videos");
  return res.json();
}

const STATUS_STYLES: Record<ScheduledStatus, { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground", icon: Clock },
  processing: { label: "Processing", className: "bg-blue-500/15 text-blue-500", icon: Loader2 },
  posted: { label: "Posted", className: "bg-emerald-500/15 text-emerald-500", icon: CheckCircle2 },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive", icon: XCircle },
};

/* ─── Page ──────────────────────────────────────────────────────────── */

export default function YoutubeScheduler() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: channels = [], isLoading: channelsLoading, error: channelsError, refetch: refetchChannels } = useListYoutubeChannels({
    query: { queryKey: getListYoutubeChannelsQueryKey() },
  });

  const { data: scheduled, isLoading: scheduledLoading, error: scheduledError, refetch: refetchScheduled } = useQuery({
    queryKey: ["youtube-scheduled-videos"],
    queryFn: fetchScheduled,
  });

  const [videoType, setVideoType] = useState<VideoType>("long");
  const [channelId, setChannelId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatus>("public");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [timezone, setTimezone] = useState("Asia/Dhaka");

  function resetForm() {
    setTitle("");
    setDescription("");
    setVideoUrl("");
    setVideoFile(null);
    setScheduledAt("");
    setChannelId("");
  }

  const create = useMutation({
    mutationFn: async () => {
      // Convert the wall-clock datetime-local value to a UTC ISO string so the
      // server always receives an unambiguous instant regardless of server TZ.
      const scheduledAtUtc = wallClockToUTC(scheduledAt, timezone);

      const form = new FormData();
      form.set("channelId", channelId);
      form.set("title", title);
      form.set("description", description);
      form.set("videoType", videoType);
      form.set("privacyStatus", privacyStatus);
      form.set("scheduledAt", scheduledAtUtc);
      form.set("timezone", timezone);
      if (videoFile) form.set("video", videoFile);
      if (videoUrl) form.set("videoUrl", videoUrl);

      const res = await authFetch(apiUrl("/youtube/scheduled-videos"), { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to schedule video");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Video scheduled" });
      queryClient.invalidateQueries({ queryKey: ["youtube-scheduled-videos"] });
      resetForm();
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(apiUrl(`/youtube/scheduled-videos/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      toast({ title: "Scheduled video removed" });
      queryClient.invalidateQueries({ queryKey: ["youtube-scheduled-videos"] });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const postNow = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(apiUrl(`/youtube/scheduled-videos/${id}/post-now`), { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to start upload");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Upload started" });
      queryClient.invalidateQueries({ queryKey: ["youtube-scheduled-videos"] });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const channelMap = useMemo(() => new Map((channels ?? []).map((c) => [String(c.id), c])), [channels]);

  // Filter the upload queue by the selected channel (empty = show all)
  const filteredScheduled = useMemo(() => {
    if (!scheduled) return [];
    if (!channelId) return scheduled;
    return scheduled.filter((v) => v.channelId === channelId);
  }, [scheduled, channelId]);

  const queueStats = useMemo(() => ({
    total: filteredScheduled.length,
    pending: filteredScheduled.filter((v) => v.status === "pending" || v.status === "processing").length,
    posted: filteredScheduled.filter((v) => v.status === "posted").length,
    failed: filteredScheduled.filter((v) => v.status === "failed").length,
  }), [filteredScheduled]);

  const canSubmit = channelId && title.trim() && scheduledAt && (videoFile || videoUrl.trim());

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2.5">
            <Youtube className="h-7 w-7 text-red-500" />
            YouTube Scheduler
          </h1>
          <p className="text-muted-foreground mt-1">
            Queue Shorts and long-form videos to publish to your connected channels.
          </p>
        </div>

        {channelsError && <QueryErrorState error={channelsError} onRetry={() => void refetchChannels()} />}
        {scheduledError && <QueryErrorState error={scheduledError} onRetry={() => void refetchScheduled()} />}

        {!channelsLoading && !channelsError && !channels.length && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No channels connected yet</CardTitle>
              <CardDescription>
                Connect a Google account on the YouTube Accounts page before scheduling uploads.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Schedule a new upload</CardTitle>
            <CardDescription>Pick a channel, add your video, and set when it should go out.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Tabs value={videoType} onValueChange={(v) => setVideoType(v as VideoType)}>
              <TabsList>
                <TabsTrigger value="long" className="gap-1.5">
                  <Film className="h-3.5 w-3.5" /> Long video
                </TabsTrigger>
                <TabsTrigger value="short" className="gap-1.5">
                  <Smartphone className="h-3.5 w-3.5" /> Short
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Channel</Label>
                <Select value={channelId} onValueChange={setChannelId} disabled={channelsLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {(channels ?? []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Privacy</Label>
                <Select value={privacyStatus} onValueChange={(v) => setPrivacyStatus(v as PrivacyStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="unlisted">Unlisted</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Video title" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Video description"
                rows={3}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Video file</Label>
                <Input
                  type="file"
                  accept="video/mp4,video/quicktime,.mov,.avi,.mkv,.webm"
                  onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>...or a video URL</Label>
                <Input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://..."
                  disabled={!!videoFile}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Scheduled time</Label>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={() => create.mutate()}
              disabled={!canSubmit || create.isPending}
              className="gap-2 self-start"
            >
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Schedule video
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>Upload queue</CardTitle>
                <CardDescription>
                  {channelId
                    ? `Showing uploads for ${channelMap.get(channelId)?.name ?? "selected channel"}. Select a different channel above to change the filter.`
                    : "Showing all channels. Select a channel above to filter."}
                </CardDescription>
              </div>
            </div>
            {/* Summary counts — only shown when there's data */}
            {!scheduledLoading && filteredScheduled.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {[
                  { label: "Total", value: queueStats.total, className: "bg-muted/50" },
                  { label: "Pending", value: queueStats.pending, className: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800" },
                  { label: "Posted", value: queueStats.posted, className: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" },
                  { label: "Failed", value: queueStats.failed, className: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" },
                ].map(({ label, value, className }) => (
                  <div key={label} className={`rounded-lg border px-3 py-2 text-center ${className}`}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-lg font-bold font-mono leading-tight">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {scheduledLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : scheduledError ? null : !filteredScheduled.length ? (
              <p className="text-sm text-muted-foreground">
                {channelId ? "No uploads for this channel yet." : "Nothing scheduled yet."}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredScheduled.map((v) => {
                  const style = STATUS_STYLES[v.status];
                  const StatusIcon = style.icon;
                  const channel = channelMap.get(v.channelId);
                  return (
                    <div key={v.id} className="rounded-lg border p-3">
                      {/* ── Row 1: title + type badge ── status badge ── */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{v.title}</p>
                          <Badge variant="outline" className="shrink-0 gap-1 capitalize">
                            {v.videoType === "short" ? (
                              <Smartphone className="h-3 w-3" />
                            ) : (
                              <Film className="h-3 w-3" />
                            )}
                            {v.videoType}
                          </Badge>
                        </div>
                        <Badge className={`shrink-0 gap-1 ${style.className}`}>
                          <StatusIcon className="h-3 w-3" />
                          {style.label}
                        </Badge>
                      </div>

                      {/* ── Row 2: channel · scheduled time (in stored TZ) ── */}
                      <p className="text-xs text-muted-foreground mt-1">
                        {channel?.name ?? "Unknown channel"} ·{" "}
                        <CalendarClock className="inline h-3 w-3 -mt-0.5" />{" "}
                        {fmtScheduledAt(v.scheduledAt, v.timezone)} ({v.timezone})
                      </p>

                      {/* ── Row 3: error message (if any) ── */}
                      {v.status === "failed" && v.errorMessage && (
                        <p className="text-xs text-destructive mt-1">{v.errorMessage}</p>
                      )}

                      {/* ── Row 4: actions ── */}
                      <div className="flex items-center justify-end gap-2 mt-2">
                        {(v.status === "pending" || v.status === "failed") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => postNow.mutate(v.id)}
                            disabled={postNow.isPending}
                          >
                            <Send className="h-3.5 w-3.5" />
                            Post now
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove this scheduled video?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{v.title}" will be removed from the queue and its uploaded file deleted.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => remove.mutate(v.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
