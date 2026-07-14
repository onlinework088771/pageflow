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
  id: number;
  title: string;
  thumbnail: string | null;
}

interface YoutubeAccount {
  id: number;
  name: string;
  channels: YoutubeChannel[];
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

async function fetchChannels(): Promise<YoutubeChannel[]> {
  const res = await authFetch(apiUrl("/youtube/accounts"));
  if (!res.ok) throw new Error("Failed to load YouTube channels");
  const accounts: YoutubeAccount[] = await res.json();
  return accounts.flatMap((a) => a.channels);
}

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

  const { data: channels, isLoading: channelsLoading } = useQuery({
    queryKey: ["youtube-channels-for-scheduler"],
    queryFn: fetchChannels,
  });

  const { data: scheduled, isLoading: scheduledLoading } = useQuery({
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
  const [timezone, setTimezone] = useState("UTC");

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
      const form = new FormData();
      form.set("channelId", channelId);
      form.set("title", title);
      form.set("description", description);
      form.set("videoType", videoType);
      form.set("privacyStatus", privacyStatus);
      form.set("scheduledAt", scheduledAt);
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

  const channelMap = useMemo(() => new Map((channels ?? []).map((c) => [String(c.id), c])), [channels]);

  const canSubmit = channelId && title.trim() && scheduledAt && (videoFile || videoUrl.trim());

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Youtube className="h-7 w-7 text-red-500" />
            YouTube Scheduler
          </h1>
          <p className="text-muted-foreground mt-1">
            Queue Shorts and long-form videos to publish to your connected channels.
          </p>
        </div>

        {!channelsLoading && !channels?.length && (
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
                        {c.title}
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
            <CardTitle>Upload queue</CardTitle>
            <CardDescription>Everything waiting to be published. The upload engine (Phase 4) will process these.</CardDescription>
          </CardHeader>
          <CardContent>
            {scheduledLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : !scheduled?.length ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {scheduled.map((v) => {
                  const style = STATUS_STYLES[v.status];
                  const StatusIcon = style.icon;
                  const channel = channelMap.get(v.channelId);
                  return (
                    <div
                      key={v.id}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
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
                        <p className="text-xs text-muted-foreground truncate">
                          {channel?.title ?? "Unknown channel"} ·{" "}
                          <CalendarClock className="inline h-3 w-3 -mt-0.5" />{" "}
                          {new Date(v.scheduledAt).toLocaleString()} ({v.timezone})
                        </p>
                        {v.status === "failed" && v.errorMessage && (
                          <p className="text-xs text-destructive mt-1">{v.errorMessage}</p>
                        )}
                      </div>
                      <Badge className={`shrink-0 gap-1 ${style.className}`}>
                        <StatusIcon className="h-3 w-3" />
                        {style.label}
                      </Badge>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive">
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
