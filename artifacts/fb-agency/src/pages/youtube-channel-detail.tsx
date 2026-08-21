import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetYoutubeChannel,
  getGetYoutubeChannelQueryKey,
  useUpdateYoutubeChannelAutomation,
  useUpdateYoutubeChannelSource,
  useUpdateYoutubeChannel,
  useListYoutubeChannels,
  getListYoutubeChannelsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Youtube,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  PauseCircle,
  Users,
  TrendingUp,
  Upload,
  Clock,
  Zap,
  Plus,
  X,
  Save,
} from "lucide-react";
import { motion } from "framer-motion";
import { TIMEZONES } from "@/components/schedule-management-utils";

const SOURCE_LABELS: Record<string, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
};

function statusBadge(status: string, automationEnabled: boolean) {
  if (!automationEnabled)
    return (
      <Badge variant="outline" className="text-xs">
        <PauseCircle className="h-3 w-3 mr-1" /> Automation Off
      </Badge>
    );
  if (status === "active")
    return (
      <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Active
      </Badge>
    );
  if (status === "error")
    return (
      <Badge variant="destructive" className="text-xs">
        <AlertCircle className="h-3 w-3 mr-1" /> Error
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-xs">
      <PauseCircle className="h-3 w-3 mr-1" /> Paused
    </Badge>
  );
}

export default function YouTubeChannelDetail() {
  const [, params] = useRoute("/youtube/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: channel, isLoading } = useGetYoutubeChannel(id, {
    query: { queryKey: getGetYoutubeChannelQueryKey(id), enabled: !!id },
  });

  // Automation form state
  const [autoForm, setAutoForm] = useState({
    postsPerDay: 1,
    scheduleLogic: "fixed" as "fixed" | "random",
    timezone: "UTC",
    newSlot: "",
    timeSlots: [] as string[],
    automationEnabled: false,
  });
  const [autoFormInit, setAutoFormInit] = useState(false);

  // Initialize form from fetched channel data
  if (channel && !autoFormInit) {
    setAutoForm({
      postsPerDay: channel.postsPerDay,
      scheduleLogic: (channel.scheduleLogic as "fixed" | "random") ?? "fixed",
      timezone: channel.timezone ?? "UTC",
      newSlot: "",
      timeSlots: Array.isArray(channel.timeSlots) ? channel.timeSlots : [],
      automationEnabled: channel.automationEnabled,
    });
    setAutoFormInit(true);
  }

  // Source form state
  const [sourceForm, setSourceForm] = useState({
    sourceType: "youtube",
    sourceIdentity: "",
  });
  const [sourceFormInit, setSourceFormInit] = useState(false);

  if (channel && !sourceFormInit) {
    setSourceForm({
      sourceType: channel.sourceType ?? "youtube",
      sourceIdentity: channel.sourceIdentity ?? "",
    });
    setSourceFormInit(true);
  }

  const autoMutation = useUpdateYoutubeChannelAutomation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetYoutubeChannelQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListYoutubeChannelsQueryKey() });
        toast({ title: "Automation settings saved" });
      },
      onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
    },
  });

  const sourceMutation = useUpdateYoutubeChannelSource({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetYoutubeChannelQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListYoutubeChannelsQueryKey() });
        toast({ title: "Source updated" });
      },
      onError: () => toast({ title: "Failed to update source", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateYoutubeChannel({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetYoutubeChannelQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListYoutubeChannelsQueryKey() });
      },
    },
  });

  function addTimeSlot() {
    const slot = autoForm.newSlot.trim();
    if (!slot || !/^\d{2}:\d{2}$/.test(slot)) {
      toast({ title: "Enter a valid time (HH:MM)", variant: "destructive" });
      return;
    }
    if (autoForm.timeSlots.includes(slot)) {
      toast({ title: "Slot already added", variant: "destructive" });
      return;
    }
    setAutoForm((s) => ({
      ...s,
      timeSlots: [...s.timeSlots, slot].sort(),
      newSlot: "",
    }));
  }

  function removeTimeSlot(slot: string) {
    setAutoForm((s) => ({ ...s, timeSlots: s.timeSlots.filter((t) => t !== slot) }));
  }

  function saveAutomation() {
    autoMutation.mutate({
      channelId: id,
      data: {
        postsPerDay: autoForm.postsPerDay,
        scheduleLogic: autoForm.scheduleLogic,
        timezone: autoForm.timezone,
        timeSlots: autoForm.timeSlots,
        automationEnabled: autoForm.automationEnabled,
      },
    });
  }

  function saveSource() {
    if (!sourceForm.sourceIdentity.trim()) {
      toast({ title: "Enter a source identity", variant: "destructive" });
      return;
    }
    sourceMutation.mutate({
      channelId: id,
      data: {
        sourceType: sourceForm.sourceType as any,
        sourceIdentity: sourceForm.sourceIdentity.trim(),
      },
    });
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  if (!channel) {
    return (
      <Layout>
        <div className="text-center py-20">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Channel not found.</p>
          <Button variant="link" onClick={() => navigate("/youtube-automation")}>
            Back to YouTube Automation
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Back + header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/youtube-automation")}
          className="gap-1.5 text-muted-foreground hover:text-foreground -ml-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      {/* Channel hero */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {channel.thumbnailUrl ? (
                <img
                  src={channel.thumbnailUrl}
                  alt={channel.name}
                  className="h-16 w-16 rounded-full object-cover ring-2 ring-border shrink-0"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                  <Youtube className="h-8 w-8 text-red-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-xl font-bold truncate">{channel.name}</h1>
                  {statusBadge(channel.status, channel.automationEnabled)}
                </div>
                <p className="text-sm text-muted-foreground font-mono">{channel.channelId}</p>
                {(channel.subscriberCount ?? 0) > 0 && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                    <Users className="h-3.5 w-3.5" />
                    {(channel.subscriberCount ?? 0).toLocaleString()} subscribers
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm text-muted-foreground">Automation</span>
                <Switch
                  checked={autoForm.automationEnabled}
                  onCheckedChange={(v) => {
                    setAutoForm((s) => ({ ...s, automationEnabled: v }));
                    updateMutation.mutate({ channelId: id, data: { automationEnabled: v } });
                  }}
                />
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 mt-5">
              {[
                { label: "Uploaded", value: channel.totalPosted, icon: Upload, color: "text-green-600" },
                { label: "Failed", value: channel.totalFailed, icon: AlertCircle, color: "text-red-500" },
                {
                  label: "Last Upload",
                  value: channel.lastPostedAt
                    ? new Date(channel.lastPostedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : "Never",
                  icon: Clock,
                  color: "text-muted-foreground",
                },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="text-center bg-muted/40 rounded-xl py-3 px-2">
                  <Icon className={`h-4 w-4 ${color} mx-auto mb-1`} />
                  <p className="text-lg font-bold">{value}</p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs */}
      <Tabs defaultValue="automation">
        <TabsList className="mb-5 w-full sm:w-auto">
          <TabsTrigger value="automation" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Automation
          </TabsTrigger>
          <TabsTrigger value="source" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Content Source
          </TabsTrigger>
        </TabsList>

        {/* Automation tab */}
        <TabsContent value="automation">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Automation Schedule</CardTitle>
              <CardDescription>
                Configure when and how often content is uploaded to this channel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Schedule logic */}
              <div className="space-y-2">
                <Label>Schedule Type</Label>
                <Select
                  value={autoForm.scheduleLogic}
                  onValueChange={(v) =>
                    setAutoForm((s) => ({ ...s, scheduleLogic: v as "fixed" | "random" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed time slots</SelectItem>
                    <SelectItem value="random">Random intervals (posts per day)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {autoForm.scheduleLogic === "random" ? (
                <div className="space-y-2">
                  <Label>Posts per day</Label>
                  <Select
                    value={String(autoForm.postsPerDay)}
                    onValueChange={(v) =>
                      setAutoForm((s) => ({ ...s, postsPerDay: parseInt(v, 10) }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} {n === 1 ? "post" : "posts"} per day
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-3">
                  <Label>Time slots</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="HH:MM (e.g. 09:00)"
                      value={autoForm.newSlot}
                      onChange={(e) =>
                        setAutoForm((s) => ({ ...s, newSlot: e.target.value }))
                      }
                      onKeyDown={(e) => e.key === "Enter" && addTimeSlot()}
                      className="max-w-[160px]"
                    />
                    <Button variant="outline" size="sm" onClick={addTimeSlot} className="gap-1">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                  </div>
                  {autoForm.timeSlots.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {autoForm.timeSlots.map((slot) => (
                        <div
                          key={slot}
                          className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg px-3 py-1.5 text-sm font-medium"
                        >
                          <Clock className="h-3 w-3" />
                          {slot}
                          <button
                            onClick={() => removeTimeSlot(slot)}
                            className="ml-1 hover:text-destructive transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No time slots added yet.</p>
                  )}
                </div>
              )}

              <Separator />

              {/* Timezone */}
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select
                  value={autoForm.timezone}
                  onValueChange={(v) => setAutoForm((s) => ({ ...s, timezone: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={saveAutomation}
                disabled={autoMutation.isPending}
                className="gap-2 w-full sm:w-auto"
              >
                <Save className="h-4 w-4" />
                {autoMutation.isPending ? "Saving…" : "Save Automation Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Source tab */}
        <TabsContent value="source">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Content Source</CardTitle>
              <CardDescription>
                Choose where content is pulled FROM to upload to this YouTube channel.
                Supports YouTube channels, Instagram, and TikTok profiles.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Source Platform</Label>
                <Select
                  value={sourceForm.sourceType}
                  onValueChange={(v) => setSourceForm((s) => ({ ...s, sourceType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="youtube">YouTube Channel</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  {sourceForm.sourceType === "youtube"
                    ? "YouTube Handle or Channel ID"
                    : `${SOURCE_LABELS[sourceForm.sourceType]} Handle`}
                </Label>
                <Input
                  placeholder={
                    sourceForm.sourceType === "youtube"
                      ? "@channelhandle or UCxxxxxx"
                      : "@handle"
                  }
                  value={sourceForm.sourceIdentity}
                  onChange={(e) =>
                    setSourceForm((s) => ({ ...s, sourceIdentity: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {sourceForm.sourceType === "youtube"
                    ? "Enter the YouTube channel handle (@name) or the raw UC… channel ID. The system will resolve and store the channel ID automatically."
                    : `Enter the ${SOURCE_LABELS[sourceForm.sourceType]} handle (with or without @). Videos will be downloaded using yt-dlp and uploaded to YouTube.`}
                </p>
              </div>

              {channel.sourceType && channel.sourceIdentity && (
                <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Current source</p>
                  <p className="font-medium">
                    {SOURCE_LABELS[channel.sourceType] ?? channel.sourceType}:{" "}
                    <span className="font-mono">{channel.sourceIdentity}</span>
                  </p>
                </div>
              )}

              <Button
                onClick={saveSource}
                disabled={sourceMutation.isPending}
                className="gap-2 w-full sm:w-auto"
              >
                <Save className="h-4 w-4" />
                {sourceMutation.isPending ? "Saving…" : "Save Source"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
