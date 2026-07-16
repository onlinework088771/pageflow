import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Calendar, Clock, Video, CheckCircle, XCircle, Loader2, Globe,
  ChevronRight, Zap, Trash2, PlayCircle, CheckCircle2, AlertCircle,
  RefreshCw, Plus, CalendarClock, ArrowUp, ArrowDown, Sparkles, GripVertical,
  Lock, EyeOff, Film,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { authFetch, apiUrl, TIMEZONES } from "@/components/schedule-management-utils";
import { useAuth } from "@/contexts/auth-context";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

type ScheduleMode = "slots" | "interval";
type Privacy = "private" | "unlisted" | "public";
type VideoType = "short" | "long";
type ScheduledVideoStatus = "pending" | "processing" | "posted" | "failed";

interface YoutubeChannel {
  id: string;
  name: string;
  thumbnailUrl?: string;
  handle?: string;
  subscriberCount?: number;
}

interface VideoItem {
  id: string;
  file: File;
  thumbnail: string | null;
  title: string;
  description: string;
  hashtags: string;
  privacy: Privacy;
  videoType: VideoType;
  scheduledDate: string;
  scheduledTime: string;
  aiLoading: boolean;
  aiError: string | null;
  titleDirty: boolean;   // user manually edited
  descDirty: boolean;
}

interface ScheduledVideo {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  scheduledAt: string;
  timezone: string;
  status: ScheduledVideoStatus;
  errorMessage?: string;
  youtubeVideoId?: string;
  createdAt: string;
}

/* ─── Constants ──────────────────────────────────────────────────────────────── */

const DEFAULT_TIMEZONE = "Asia/Dhaka";
const DEFAULT_TIME_SLOTS = ["21:00", "23:00", "01:00"];
const INTERVAL_OPTIONS = [
  { label: "30m", value: 30 }, { label: "45m", value: 45 },
  { label: "1h", value: 60 }, { label: "2h", value: 120 },
  { label: "3h", value: 180 }, { label: "6h", value: 360 },
  { label: "12h", value: 720 }, { label: "24h", value: 1440 },
];

const STEPS = ["Channel", "Upload", "Scheduler", "Details"];

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function uid() { return Math.random().toString(36).slice(2); }

function wallClockToUTC(dateStr: string, timeStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  let utcMs = Date.UTC(y, m - 1, d, h, min, 0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  for (let i = 0; i < 2; i++) {
    const parts = fmt.formatToParts(new Date(utcMs));
    const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);
    const localH = get("hour") % 24, localMin = get("minute");
    const localD = get("day"), localMo = get("month"), localY = get("year");
    const localMs = Date.UTC(localY, localMo - 1, localD, localH, localMin, 0);
    utcMs += Date.UTC(y, m - 1, d, h, min, 0) - localMs;
  }
  return new Date(utcMs);
}

function computeSchedule(
  count: number, mode: ScheduleMode, startDate: string, startTime: string,
  timezone: string, slots: string[], intervalMinutes: number,
): Array<{ date: string; time: string }> {
  if (!startDate || count === 0) return [];
  const isoToDatetime = (iso: string) => {
    const d = new Date(iso);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const g = (t: string) => parts.find((p) => p.type === t)!.value;
    return {
      date: `${g("year")}-${g("month")}-${g("day")}`,
      time: `${g("hour").padStart(2, "0")}:${g("minute")}`,
    };
  };

  if (mode === "interval") {
    if (!startTime) return [];
    const [y, m, dd] = startDate.split("-").map(Number);
    const [h, mn] = startTime.split(":").map(Number);
    return Array.from({ length: count }, (_, i) => {
      const totalMin = h * 60 + mn + i * intervalMinutes;
      const dayOffset = Math.floor(totalMin / 1440);
      const rem = totalMin % 1440;
      const slotH = Math.floor(rem / 60), slotM = rem % 60;
      const dayDate = new Date(Date.UTC(y, m - 1, dd + dayOffset));
      const dayStr = dayDate.toISOString().split("T")[0];
      const timeStr = `${String(slotH).padStart(2, "0")}:${String(slotM).padStart(2, "0")}`;
      return isoToDatetime(wallClockToUTC(dayStr, timeStr, timezone).toISOString());
    });
  }

  if (slots.length === 0) return [];
  const [y, m, dd] = startDate.split("-").map(Number);
  const result: Array<{ date: string; time: string }> = [];
  let fileIdx = 0, calDayOffset = 0;
  while (fileIdx < count) {
    let prevMins = -1, midnightCrossings = 0;
    const cycleBase = calDayOffset;
    for (const slot of slots) {
      if (fileIdx >= count) break;
      const [slotH, slotM] = slot.split(":").map(Number);
      const slotMins = slotH * 60 + slotM;
      if (prevMins >= 0 && slotMins <= prevMins) midnightCrossings++;
      prevMins = slotMins;
      const dayDate = new Date(Date.UTC(y, m - 1, dd + cycleBase + midnightCrossings));
      const dayStr = dayDate.toISOString().split("T")[0];
      result.push(isoToDatetime(wallClockToUTC(dayStr, slot, timezone).toISOString()));
      fileIdx++;
    }
    calDayOffset = cycleBase + 1;
  }
  return result;
}

function fmtDate(iso: string, tz = "UTC") {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium", timeStyle: "short", timeZone: tz,
    }).format(new Date(iso));
  } catch { return iso; }
}

function formatSlotTime(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

async function generateThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    video.currentTime = 1;
    const cleanup = () => URL.revokeObjectURL(url);
    video.onloadeddata = () => {
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 320 / (video.videoWidth || 320));
        canvas.width = (video.videoWidth || 320) * scale;
        canvas.height = (video.videoHeight || 180) * scale;
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        cleanup();
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      } catch { cleanup(); resolve(null); }
    };
    video.onerror = () => { cleanup(); resolve(null); };
    video.load();
  });
}

/* ─── Step Indicator ─────────────────────────────────────────────────────────── */

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {STEPS.map((label, i) => {
        const done = i < current, active = i === current;
        return (
          <div key={i} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${done ? "bg-primary border-primary text-primary-foreground" : active ? "border-primary text-primary bg-primary/10" : "border-muted-foreground/30 text-muted-foreground/50"}`}>
                {done ? <CheckCircle className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-[9px] font-medium uppercase tracking-wide whitespace-nowrap ${active ? "text-primary" : done ? "text-muted-foreground" : "text-muted-foreground/40"}`}>{label}</span>
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

/* ─── Status Badge ───────────────────────────────────────────────────────────── */

function statusBadge(status: ScheduledVideoStatus) {
  switch (status) {
    case "pending": return <Badge variant="outline" className="text-yellow-600 border-yellow-400 bg-yellow-50 dark:bg-yellow-950"><Clock className="h-2.5 w-2.5 mr-1" />Pending</Badge>;
    case "processing": return <Badge variant="outline" className="text-blue-600 border-blue-400 bg-blue-50 dark:bg-blue-950"><Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />Processing</Badge>;
    case "posted": return <Badge variant="outline" className="text-green-600 border-green-400 bg-green-50 dark:bg-green-950"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />Posted</Badge>;
    case "failed": return <Badge variant="outline" className="text-red-600 border-red-400 bg-red-50 dark:bg-red-950"><AlertCircle className="h-2.5 w-2.5 mr-1" />Failed</Badge>;
  }
}

/* ─── Privacy Icon ───────────────────────────────────────────────────────────── */

function PrivacyIcon({ value }: { value: Privacy }) {
  if (value === "public") return <Globe className="h-3.5 w-3.5 text-green-500" />;
  if (value === "unlisted") return <EyeOff className="h-3.5 w-3.5 text-yellow-500" />;
  return <Lock className="h-3.5 w-3.5 text-red-400" />;
}

/* ─── Video Detail Card ──────────────────────────────────────────────────────── */

interface VideoCardProps {
  item: VideoItem;
  index: number;
  total: number;
  timezone: string;
  onChange: (id: string, patch: Partial<VideoItem>) => void;
  onRemove: (id: string) => void;
  onAiGenerate: (id: string) => void;
  dragging: boolean;
  onDragStart: (i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDrop: (i: number) => void;
  overIndex: number | null;
}

function VideoCard({ item, index, total, timezone, onChange, onRemove, onAiGenerate, dragging, onDragStart, onDragOver, onDrop, overIndex }: VideoCardProps) {
  const isOver = overIndex === index;
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
      className={`rounded-xl border transition-all ${dragging && isOver ? "border-primary bg-primary/5 scale-[1.01]" : "border-border/60 bg-card"}`}
    >
      <div className="p-3 space-y-3">
        {/* Header row */}
        <div className="flex items-start gap-2">
          <GripVertical className="h-5 w-5 text-muted-foreground/40 cursor-grab shrink-0 mt-0.5" />
          {/* Thumbnail */}
          <div className="h-14 w-20 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border/30">
            {item.thumbnail
              ? <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
              : <Video className="h-5 w-5 text-muted-foreground/40" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate text-muted-foreground">{item.file.name}</p>
            <p className="text-[10px] text-muted-foreground/60">{(item.file.size / 1_048_576).toFixed(1)} MB · #{index + 1} of {total}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Select value={item.videoType} onValueChange={(v) => onChange(item.id, { videoType: v as VideoType })}>
                <SelectTrigger className="h-6 w-20 text-[10px] px-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="long">Long</SelectItem>
                  <SelectItem value="short">Short</SelectItem>
                </SelectContent>
              </Select>
              <Select value={item.privacy} onValueChange={(v) => onChange(item.id, { privacy: v as Privacy })}>
                <SelectTrigger className="h-6 w-24 text-[10px] px-2 gap-1">
                  <PrivacyIcon value={item.privacy} /><SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="unlisted">Unlisted</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <button
            onClick={() => onRemove(item.id)}
            className="text-muted-foreground hover:text-destructive shrink-0 p-1"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Title <span className="text-destructive">*</span></Label>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-2 gap-1 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950"
              onClick={() => onAiGenerate(item.id)}
              disabled={item.aiLoading}
            >
              {item.aiLoading
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Sparkles className="h-3 w-3" />}
              ✨ AI Generate
            </Button>
          </div>
          <Input
            value={item.title}
            placeholder="YouTube SEO title…"
            onChange={(e) => onChange(item.id, { title: e.target.value, titleDirty: true })}
            className="h-8 text-sm"
          />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <Label className="text-xs">Description</Label>
          <textarea
            rows={3}
            value={item.description}
            placeholder="YouTube description with keywords…"
            onChange={(e) => onChange(item.id, { description: e.target.value, descDirty: true })}
            className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
          {item.hashtags && (
            <p className="text-[10px] text-muted-foreground truncate">{item.hashtags}</p>
          )}
        </div>

        {/* Schedule time */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" />Date</Label>
            <Input
              type="date"
              value={item.scheduledDate}
              onChange={(e) => onChange(item.id, { scheduledDate: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" />Time ({timezone.split("/")[1] ?? timezone})</Label>
            <Input
              type="time"
              value={item.scheduledTime}
              onChange={(e) => onChange(item.id, { scheduledTime: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* AI error */}
        {item.aiError && (
          <p className="text-[11px] text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{item.aiError}</p>
        )}
      </div>
    </div>
  );
}

/* ─── Schedule Manager ───────────────────────────────────────────────────────── */

function YtScheduleManager({
  videos, loading, onPostNow, onDelete, onRefresh, channelMap, postingNow, isAdmin, onDeleteAll, isDeletingAll,
}: {
  videos: ScheduledVideo[]; loading: boolean; postingNow: Set<string>;
  onPostNow: (id: string) => void; onDelete: (id: string) => void; onRefresh: () => void;
  channelMap: Map<string, YoutubeChannel>; isAdmin: boolean;
  onDeleteAll?: () => void; isDeletingAll?: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const tabs = [
    { key: "all" as const, label: "All", statuses: ["pending", "processing", "posted", "failed"] },
    { key: "pending" as const, label: "Pending", statuses: ["pending", "processing"] },
    { key: "completed" as const, label: "Completed", statuses: ["posted"] },
    { key: "failed" as const, label: "Failed", statuses: ["failed"] },
  ];
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
            <CalendarClock className="h-4 w-4 text-primary" />Schedule Manager
          </CardTitle>
          <div className="flex items-center gap-1">
            {isAdmin && onDeleteAll && (
              <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!isDeletingAll) setConfirmOpen(o); }}>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                  disabled={isDeletingAll || videos.length === 0} onClick={() => setConfirmOpen(true)}>
                  {isDeletingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Delete All
                </Button>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete all scheduled videos?</AlertDialogTitle>
                    <AlertDialogDescription>This will permanently delete all scheduled YouTube videos. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeletingAll}>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={(e) => { e.preventDefault(); onDeleteAll(); }} disabled={isDeletingAll}>
                      {isDeletingAll && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Delete All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh}><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all">
          <TabsList className="w-full mb-4 grid grid-cols-4 h-9">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className="text-xs px-1 gap-1">
                {tab.label}
                {counts[tab.key] > 0 && <Badge variant="secondary" className="text-[9px] px-1 h-4 min-w-[18px] justify-center">{counts[tab.key]}</Badge>}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => {
            const filtered = videos.filter((v) => (tab.statuses as string[]).includes(v.status));
            return (
              <TabsContent key={tab.key} value={tab.key} className="mt-0">
                {loading ? (
                  <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                    <CalendarClock className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No {tab.key === "all" ? "" : tab.label.toLowerCase() + " "}videos yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filtered.map((video) => {
                      const ch = channelMap.get(video.channelId);
                      return (
                        <div key={video.id} className="flex gap-3 p-3 rounded-xl border border-border/60 bg-card hover:bg-muted/30 transition-colors">
                          <div className="h-14 w-20 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border/30">
                            {video.thumbnailUrl
                              ? <img src={video.thumbnailUrl} alt={video.title} className="h-full w-full object-cover" />
                              : <Video className="h-5 w-5 text-muted-foreground/40" />}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-semibold truncate">{video.title}</p>
                              {statusBadge(video.status)}
                            </div>
                            <p className="text-xs text-muted-foreground"><Calendar className="h-3 w-3 inline mr-1" />{fmtDate(video.scheduledAt, video.timezone)}</p>
                            {ch && <p className="text-xs text-muted-foreground"><PlayCircle className="h-3 w-3 inline mr-1" />{ch.name}</p>}
                            {video.errorMessage && <p className="text-xs text-red-500 truncate">{video.errorMessage}</p>}
                            {video.youtubeVideoId && (
                              <a href={`https://youtube.com/watch?v=${video.youtubeVideoId}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View on YouTube ↗</a>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            {(video.status === "pending" || video.status === "failed") && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-primary hover:bg-primary/10" title="Post Now"
                                onClick={() => onPostNow(video.id)} disabled={postingNow.has(video.id)}>
                                {postingNow.has(video.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Delete"
                              onClick={() => onDelete(video.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
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

/* ─── Main Page ──────────────────────────────────────────────────────────────── */

function YoutubeBulkUploadInner() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Channels ── */
  const [channels, setChannels] = useState<YoutubeChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  /* ── Wizard ── */
  const [step, setStep] = useState(0);

  /* ── Upload ── */
  const [videoItems, setVideoItems] = useState<VideoItem[]>([]);

  /* ── Scheduler settings (step 2) ── */
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("slots");
  const [timeSlots, setTimeSlots] = useState<string[]>(DEFAULT_TIME_SLOTS);
  const [newSlotInput, setNewSlotInput] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("21:00");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);

  /* ── Confirm AI overwrite ── */
  const [aiConfirm, setAiConfirm] = useState<{ id: string; result: { title: string; description: string; hashtags: string } } | null>(null);

  /* ── Drag-drop reorder ── */
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  /* ── Scheduling ── */
  const [scheduling, setScheduling] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(0);

  /* ── Schedule Manager ── */
  const [managerVideos, setManagerVideos] = useState<ScheduledVideo[]>([]);
  const [managerLoading, setManagerLoading] = useState(true);
  const [postingNow, setPostingNow] = useState<Set<string>>(new Set());
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  /* ── Load channels ── */
  useEffect(() => {
    authFetch(apiUrl("/youtube/accounts"))
      .then((r) => r.json())
      .then((data: unknown) => {
        const accounts = Array.isArray(data) ? (data as { channels: YoutubeChannel[] }[]) : [];
        setChannels(accounts.flatMap((a) => Array.isArray(a?.channels) ? a.channels : []));
      })
      .catch(() => {})
      .finally(() => setChannelsLoading(false));
  }, []);

  const channelMap = useMemo(
    () => new Map(channels.map((c) => [String(c.id), c])),
    [channels],
  );

  /* ── Load manager videos ── */
  const fetchManagerVideos = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl("/youtube/scheduled-videos"));
      if (r.ok) setManagerVideos(await r.json());
    } catch {} finally {
      setManagerLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchManagerVideos();
    const t = setInterval(fetchManagerVideos, 8_000);
    return () => clearInterval(t);
  }, [fetchManagerVideos]);

  /* ── Computed schedule ── */
  const schedule = useMemo(() => {
    try {
      return computeSchedule(videoItems.length, scheduleMode, startDate, startTime, timezone, timeSlots, intervalMinutes);
    } catch {
      return [];
    }
  }, [videoItems.length, scheduleMode, startDate, startTime, timezone, timeSlots, intervalMinutes]);

  /* ── Apply computed schedule to videoItems when advancing to step 3 ── */
  const applySchedule = useCallback(() => {
    setVideoItems((prev) => prev.map((item, i) => {
      const slot = schedule[i] ?? schedule[schedule.length - 1];
      if (!slot) return item;
      return { ...item, scheduledDate: slot.date, scheduledTime: slot.time };
    }));
  }, [schedule]);

  /* ── File add ── */
  const addFiles = useCallback(async (files: File[]) => {
    const seen = new Set(videoItems.map((v) => `${v.file.name}:${v.file.size}`));
    const unique = files.filter((f) => {
      const k = `${f.name}:${f.size}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const newItems: VideoItem[] = await Promise.all(
      unique.map(async (file) => ({
        id: uid(),
        file,
        thumbnail: await generateThumbnail(file),
        title: "",
        description: "",
        hashtags: "",
        privacy: "private" as Privacy,
        videoType: (file.size < 60 * 1024 * 1024 ? "short" : "long") as VideoType,
        scheduledDate: new Date().toISOString().split("T")[0],
        scheduledTime: "21:00",
        aiLoading: false,
        aiError: null,
        titleDirty: false,
        descDirty: false,
      })),
    );
    setVideoItems((prev) => [...prev, ...newItems]);
  }, [videoItems]);

  function removeVideo(id: string) {
    setVideoItems((prev) => prev.filter((v) => v.id !== id));
  }

  function updateVideo(id: string, patch: Partial<VideoItem>) {
    setVideoItems((prev) => prev.map((v) => v.id === id ? { ...v, ...patch } : v));
  }

  /* ── AI Generate ── */
  async function handleAiGenerate(id: string) {
    const item = videoItems.find((v) => v.id === id);
    if (!item) return;

    updateVideo(id, { aiLoading: true, aiError: null });

    try {
      const fd = new FormData();
      fd.append("video", item.file);
      const res = await authFetch(apiUrl("/youtube/ai-analyze"), { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        updateVideo(id, { aiLoading: false, aiError: data.error ?? "AI analysis failed" });
        return;
      }

      const result = data as { title: string; description: string; hashtags: string };

      // If both fields are pristine, fill directly; otherwise ask to confirm
      if (!item.titleDirty && !item.descDirty) {
        updateVideo(id, {
          title: result.title, description: result.description,
          hashtags: result.hashtags, aiLoading: false,
        });
        toast({ title: "✨ AI filled title & description" });
      } else {
        updateVideo(id, { aiLoading: false });
        setAiConfirm({ id, result });
      }
    } catch {
      updateVideo(id, { aiLoading: false, aiError: "Network error — could not reach AI service" });
    }
  }

  function applyAiConfirm() {
    if (!aiConfirm) return;
    updateVideo(aiConfirm.id, {
      title: aiConfirm.result.title,
      description: aiConfirm.result.description,
      hashtags: aiConfirm.result.hashtags,
      titleDirty: false, descDirty: false,
    });
    toast({ title: "✨ AI filled title & description" });
    setAiConfirm(null);
  }

  /* ── Drag-drop ── */
  function handleDragStart(i: number) { setDragIdx(i); }
  function handleDragOver(e: React.DragEvent, i: number) { e.preventDefault(); setDropIdx(i); }
  function handleDrop(i: number) {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDropIdx(null); return; }
    setVideoItems((prev) => {
      const arr = [...prev];
      const [moved] = arr.splice(dragIdx, 1);
      arr.splice(i, 0, moved);
      return arr;
    });
    setDragIdx(null); setDropIdx(null);
  }

  /* ── Schedule All ── */
  async function handleScheduleAll() {
    if (!selectedChannelId) { toast({ title: "Select a channel", variant: "destructive" }); return; }
    if (videoItems.length === 0) { toast({ title: "Upload at least one video", variant: "destructive" }); return; }
    const missing = videoItems.filter((v) => !v.title.trim());
    if (missing.length > 0) { toast({ title: `${missing.length} video(s) need a title`, variant: "destructive" }); return; }

    setScheduling(true);
    setScheduledCount(0);
    let created = 0;

    try {
      for (const item of videoItems) {
        const scheduledAt = wallClockToUTC(item.scheduledDate, item.scheduledTime, timezone).toISOString();
        const fd = new FormData();
        fd.append("video", item.file);
        fd.append("title", item.title.trim());
        fd.append("description", [item.description.trim(), item.hashtags.trim()].filter(Boolean).join("\n\n"));
        fd.append("channelId", selectedChannelId);
        fd.append("videoType", item.videoType);
        fd.append("privacyStatus", item.privacy);
        fd.append("scheduledAt", scheduledAt);
        fd.append("timezone", timezone);

        const res = await authFetch(apiUrl("/youtube/scheduled-videos"), { method: "POST", body: fd });
        if (res.ok) {
          const v = await res.json();
          setManagerVideos((prev) => [v, ...prev]);
          created++;
          setScheduledCount(created);
        }
      }

      if (created === 0) {
        toast({ title: "Scheduling failed", description: "Server rejected the upload.", variant: "destructive" });
      } else {
        toast({ title: `✅ Scheduled ${created} video${created !== 1 ? "s" : ""}!` });
        setStep(0);
        setSelectedChannelId(null);
        setVideoItems([]);
        setScheduleMode("slots");
        setTimeSlots(DEFAULT_TIME_SLOTS);
        setNewSlotInput("");
        setIntervalMinutes(60);
        setStartDate(new Date().toISOString().split("T")[0]);
        setStartTime("21:00");
        setTimezone(DEFAULT_TIMEZONE);
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast({ title: "Scheduling failed", description: e.message, variant: "destructive" });
    } finally {
      setScheduling(false);
    }
  }

  /* ── Manager handlers ── */
  async function handlePostNow(id: string) {
    setPostingNow((prev) => new Set(prev).add(id));
    try {
      const res = await authFetch(apiUrl(`/youtube/scheduled-videos/${id}/post-now`), { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ title: "Posting now!" });
      setManagerVideos((prev) => prev.map((v) => v.id === id ? { ...v, status: "processing" } : v));
      setTimeout(fetchManagerVideos, 4000);
      setTimeout(fetchManagerVideos, 9000);
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setPostingNow((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  async function handleDelete(id: string) {
    try {
      await authFetch(apiUrl(`/youtube/scheduled-videos/${id}`), { method: "DELETE" });
      setManagerVideos((prev) => prev.filter((v) => v.id !== id));
      toast({ title: "Deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  }

  async function handleDeleteAll() {
    setIsDeletingAll(true);
    try {
      const res = await authFetch(apiUrl("/youtube/scheduled-videos"), { method: "DELETE" });
      const { deleted } = await res.json();
      await fetchManagerVideos();
      toast({ title: `Deleted ${deleted} schedule${deleted !== 1 ? "s" : ""}` });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setIsDeletingAll(false);
    }
  }

  const scheduleDays = schedule.length > 0
    ? scheduleMode === "slots"
      ? Math.ceil(videoItems.length / Math.max(timeSlots.length, 1))
      : Math.ceil((videoItems.length * intervalMinutes) / 1440)
    : 0;

  /* ─── Render ─── */
  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Film className="h-6 w-6 text-red-500" />YouTube Bulk Upload
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload multiple videos with per-video titles, descriptions, and AI-powered SEO generation.
          </p>
        </div>

        {/* Wizard Card */}
        <Card>
          <CardHeader className="pb-4 border-b">
            <StepIndicator current={step} />
          </CardHeader>

          <CardContent className="pt-6 space-y-6">

            {/* ── STEP 0: Channel ── */}
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold text-base">Select YouTube Channel</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Choose the channel to upload to.</p>
                </div>
                {channelsLoading ? (
                  <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                ) : channels.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-sm text-muted-foreground">No channels connected.</p>
                    <a href="/youtube/accounts" className="text-xs text-primary hover:underline">Connect a channel →</a>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {channels.map((ch) => {
                      const active = selectedChannelId === String(ch.id);
                      return (
                        <div key={ch.id} onClick={() => setSelectedChannelId(String(ch.id))}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${active ? "border-primary bg-primary/8 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/40"}`}>
                          <Avatar className="h-10 w-10 shrink-0">
                            <AvatarImage src={ch.thumbnailUrl} />
                            <AvatarFallback className="text-xs bg-red-100 text-red-600">{(ch.name ?? "YT").slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{ch.name}</p>
                            {ch.handle && <p className="text-xs text-muted-foreground">{ch.handle}</p>}
                            {ch.subscriberCount != null && (
                              <p className="text-xs text-muted-foreground">{ch.subscriberCount.toLocaleString()} subscribers</p>
                            )}
                          </div>
                          {active ? <CheckCircle className="h-4 w-4 text-primary shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex justify-end pt-2">
                  <Button disabled={!selectedChannelId} onClick={() => setStep(1)}>
                    Next: Upload <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 1: Upload ── */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold text-base">Upload Videos</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Select multiple videos — each gets its own title and description.</p>
                </div>

                <div
                  className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)); }}
                >
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">Drop videos here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">MP4, MOV, MKV, AVI, WebM · up to 2 GB each</p>
                </div>

                <input ref={fileInputRef} type="file" accept="video/*" multiple className="hidden"
                  onChange={(e) => addFiles(Array.from(e.target.files ?? []))} />

                {videoItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{videoItems.length} video{videoItems.length !== 1 ? "s" : ""} ready</p>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => fileInputRef.current?.click()}>
                        <Plus className="h-3 w-3" />Add More
                      </Button>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {videoItems.map(({ id, file, thumbnail }) => (
                        <div key={id} className="flex items-center gap-2.5 p-2 bg-muted/40 rounded-lg">
                          <div className="h-9 w-12 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                            {thumbnail ? <img src={thumbnail} alt="" className="h-full w-full object-cover" /> : <Video className="h-4 w-4 text-muted-foreground/50" />}
                          </div>
                          <span className="text-xs truncate flex-1">{file.name}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{(file.size / 1_048_576).toFixed(1)} MB</span>
                          <button onClick={() => removeVideo(id)} className="text-muted-foreground hover:text-destructive shrink-0">
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Duplicate files are automatically skipped.</p>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
                  <Button disabled={videoItems.length === 0} onClick={() => setStep(2)}>
                    Next: Scheduler <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Scheduler ── */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="font-semibold text-base">Scheduler Settings</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Choose how to spread {videoItems.length} video{videoItems.length !== 1 ? "s" : ""} across time.</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {([
                    { mode: "slots" as const, label: "Daily Time Slots", icon: Clock },
                    { mode: "interval" as const, label: "Interval", icon: Zap },
                  ]).map(({ mode, label, icon: Icon }) => (
                    <button key={mode} type="button" onClick={() => setScheduleMode(mode)}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${scheduleMode === mode ? "border-primary bg-primary/8 text-primary" : "border-border hover:border-primary/30 text-muted-foreground"}`}>
                      <Icon className="h-4 w-4" />{label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Start Date</Label>
                    <Input type="date" value={startDate} min={new Date().toISOString().split("T")[0]} onChange={(e) => setStartDate(e.target.value)} />
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
                </div>

                {scheduleMode === "slots" && (
                  <div className="space-y-3">
                    <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Daily Time Slots</Label>
                    <div className="space-y-1.5">
                      {timeSlots.map((slot, i) => (
                        <div key={slot + i} className="flex items-center gap-2 p-2.5 rounded-xl border border-border/60 bg-muted/20">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="flex-1 text-sm font-medium">{formatSlotTime(slot)}</span>
                          <div className="flex items-center gap-0.5">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0}
                              onClick={() => { const s = [...timeSlots]; [s[i - 1], s[i]] = [s[i], s[i - 1]]; setTimeSlots(s); }}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === timeSlots.length - 1}
                              onClick={() => { const s = [...timeSlots]; [s[i], s[i + 1]] = [s[i + 1], s[i]]; setTimeSlots(s); }}>
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setTimeSlots(timeSlots.filter((_, j) => j !== i))}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input type="time" value={newSlotInput} onChange={(e) => setNewSlotInput(e.target.value)} className="flex-1" />
                      <Button type="button" variant="outline" className="gap-1 shrink-0"
                        disabled={!newSlotInput || timeSlots.includes(newSlotInput)}
                        onClick={() => { if (newSlotInput && !timeSlots.includes(newSlotInput)) { setTimeSlots([...timeSlots, newSlotInput]); setNewSlotInput(""); } }}>
                        <Plus className="h-3.5 w-3.5" />Add Slot
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {timeSlots.length} slot{timeSlots.length !== 1 ? "s" : ""}/day → {scheduleDays} day{scheduleDays !== 1 ? "s" : ""} for {videoItems.length} video{videoItems.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                )}

                {scheduleMode === "interval" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Start Time</Label>
                      <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Post Every</Label>
                      <div className="flex flex-wrap gap-2">
                        {INTERVAL_OPTIONS.map(({ label, value }) => (
                          <button key={value} type="button" onClick={() => setIntervalMinutes(value)}
                            className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all ${intervalMinutes === value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40 text-muted-foreground"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Schedule Preview */}
                {videoItems.length > 0 && startDate && schedule.length > 0 && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">Schedule Preview</p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-background rounded-lg p-2.5 border"><p className="text-muted-foreground">Videos</p><p className="font-bold text-lg">{videoItems.length}</p></div>
                      <div className="bg-background rounded-lg p-2.5 border"><p className="text-muted-foreground">Days</p><p className="font-bold text-lg">{scheduleDays}</p></div>
                      <div className="bg-background rounded-lg p-2.5 border"><p className="text-muted-foreground">Timezone</p><p className="font-bold text-sm truncate">{timezone.split("/").pop()}</p></div>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {schedule.slice(0, 5).map((slot, i) => (
                        <p key={i} className="text-xs text-muted-foreground">
                          Video {i + 1}: <span className="text-foreground font-medium">{slot.date} at {slot.time}</span>
                        </p>
                      ))}
                      {schedule.length > 5 && <p className="text-xs text-muted-foreground italic">…and {schedule.length - 5} more</p>}
                    </div>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                  <Button
                    disabled={scheduleMode === "slots" ? timeSlots.length === 0 : !startTime}
                    onClick={() => { applySchedule(); setStep(3); }}
                  >
                    Next: Details <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 3: Per-Video Details ── */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold text-base">Video Details</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Set title, description, and privacy for each video. Use <span className="text-purple-600 font-medium">✨ AI Generate</span> for instant SEO-optimised content.
                  </p>
                </div>

                {/* AI instructions banner */}
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
                  <Sparkles className="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-purple-700 dark:text-purple-300">
                    Click <strong>✨ AI Generate</strong> on any video to analyse its frames and auto-fill a YouTube SEO title and description. Requires OpenAI API key.
                  </p>
                </div>

                {/* Video cards */}
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  {videoItems.map((item, index) => (
                    <VideoCard
                      key={item.id}
                      item={item}
                      index={index}
                      total={videoItems.length}
                      timezone={timezone}
                      onChange={updateVideo}
                      onRemove={removeVideo}
                      onAiGenerate={handleAiGenerate}
                      dragging={dragIdx !== null}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      overIndex={dropIdx}
                    />
                  ))}
                </div>

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                  <Button
                    onClick={handleScheduleAll}
                    disabled={scheduling || videoItems.length === 0}
                    className="gap-2 min-w-[180px]"
                  >
                    {scheduling ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Scheduling {scheduledCount}/{videoItems.length}…</>
                    ) : (
                      <><Zap className="h-4 w-4" />Schedule {videoItems.length} Video{videoItems.length !== 1 ? "s" : ""}</>
                    )}
                  </Button>
                </div>
              </div>
            )}

          </CardContent>
        </Card>

        {/* Schedule Manager */}
        <YtScheduleManager
          videos={managerVideos}
          loading={managerLoading}
          postingNow={postingNow}
          onPostNow={handlePostNow}
          onDelete={handleDelete}
          onRefresh={fetchManagerVideos}
          channelMap={channelMap}
          isAdmin={isAdmin}
          onDeleteAll={handleDeleteAll}
          isDeletingAll={isDeletingAll}
        />

      </div>

      {/* AI Overwrite Confirm Dialog */}
      <AlertDialog open={!!aiConfirm} onOpenChange={(o) => { if (!o) setAiConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing content?</AlertDialogTitle>
            <AlertDialogDescription>
              You've already written a title or description for this video. AI will overwrite both with the generated content. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAiConfirm(null)}>Keep mine</AlertDialogCancel>
            <AlertDialogAction onClick={applyAiConfirm}>Replace with AI</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

export default function YoutubeBulkUpload() {
  return (
    <ErrorBoundary>
      <YoutubeBulkUploadInner />
    </ErrorBoundary>
  );
}
