import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Youtube, Globe, Clock, Plus, X, Save, CheckCircle2, XCircle, Loader2,
  Camera, Facebook, Zap, AlertTriangle, RefreshCw, UploadCloud,
  Users, Link2, PlayCircle, PauseCircle, Settings2, Sparkles,
  ListChecks, ArrowRight, Hash, Bot, Eye,
} from "lucide-react";
import { authFetch, apiUrl, TIMEZONES } from "@/components/schedule-management-utils";
import { useToast } from "@/hooks/use-toast";

// YouTube Automation — redesigned professional dashboard.
// Talks only to /youtube/automations; no Facebook code paths are touched.

/* ─── Types ──────────────────────────────────────────────────────────────────── */

interface AutomationConfig {
  id: string;
  channelId: string;
  automationEnabled: boolean;
  status: "active" | "paused" | "error";
  sourceType?: "tiktok" | "instagram" | "facebook";
  sourceIdentity?: string;
  postsPerDay: number;
  scheduleLogic: "fixed" | "random";
  timezone: string;
  timeSlots: string[];
  privacyStatus: "public" | "unlisted" | "private";
  videoType: "short" | "long";
  totalPosted: number;
  totalPending: number;
  totalFailed: number;
  lastPostedAt?: string;
  lastPostedVideoId?: string;
  initialScanDone: boolean;
  lastScanAt?: string;
  totalDiscovered: number;
  queuePending: number;
  queueUploaded: number;
  queueFailed: number;
  createdAt: string;
}

interface ChannelAutomation {
  channelId: string;
  channelTitle: string;
  channelThumbnail?: string;
  channelHandle?: string;
  channelSubscriberCount?: number;
  automation: AutomationConfig | null;
}

type SourceType    = "tiktok" | "instagram" | "facebook";
type PrivacyStatus = "public" | "unlisted" | "private";
type VideoType     = "short" | "long";
type ScheduleLogic = "fixed" | "random";

interface FormState {
  automationEnabled: boolean;
  sourceType:        SourceType;
  sourceIdentity:    string;
  postsPerDay:       number;
  scheduleLogic:     ScheduleLogic;
  timezone:          string;
  timeSlots:         string[];
  privacyStatus:     PrivacyStatus;
  videoType:         VideoType;
  aiTitle:           boolean;
  aiDescription:     boolean;
  autoHashtags:      boolean;
  autoPublish:       boolean;
}

/* ─── Constants ──────────────────────────────────────────────────────────────── */

const QUERY_KEY = ["youtube-automations"];

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function formatRelativeTime(iso?: string): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatSubscribers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getNextUploadLabel(automation: AutomationConfig): string {
  if (!automation.automationEnabled) return "Paused";
  if (automation.queuePending === 0 && automation.totalPending === 0) return "Queue empty";
  if (automation.scheduleLogic === "fixed" && automation.timeSlots.length > 0) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: automation.timezone, hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(new Date());
      const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
      const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
      const now = `${hh}:${mm}`;
      const sorted = [...automation.timeSlots].sort();
      const next = sorted.find((s) => s > now) ?? sorted[0];
      return next ? `${next} (${automation.timezone.split("/").pop()})` : "—";
    } catch { return "—"; }
  }
  if (automation.scheduleLogic === "random") {
    return `~${(24 / automation.postsPerDay).toFixed(1)}h interval`;
  }
  return "—";
}

function validateSourceIdentity(platform: SourceType, identity: string): string | null {
  const trimmed = identity.trim();
  if (!trimmed) return null;
  if (platform === "facebook") {
    if (trimmed.startsWith("http")) {
      if (!/^https?:\/\/(www\.|m\.)?facebook\.com\/[A-Za-z0-9._%-]+/.test(trimmed))
        return "Invalid Facebook URL — use https://facebook.com/PageName";
    } else {
      if (!/^[A-Za-z0-9._-]{1,}$/.test(trimmed.replace(/^@/, "")))
        return "Invalid page username — letters, numbers, dots or hyphens only";
    }
  }
  if (platform === "tiktok" && !trimmed.startsWith("http")) {
    if (!/^[A-Za-z0-9._-]{1,}$/.test(trimmed.replace(/^@/, "")))
      return "Invalid TikTok username";
  }
  if (platform === "instagram" && !trimmed.startsWith("http")) {
    if (!/^[A-Za-z0-9._]{1,}$/.test(trimmed.replace(/^@/, "")))
      return "Invalid Instagram username";
  }
  return null;
}

function defaultForm(a: AutomationConfig | null): FormState {
  return {
    automationEnabled: a?.automationEnabled ?? false,
    sourceType:        a?.sourceType        ?? "tiktok",
    sourceIdentity:    a?.sourceIdentity    ?? "",
    postsPerDay:       a?.postsPerDay       ?? 1,
    scheduleLogic:     a?.scheduleLogic     ?? "fixed",
    timezone:          a?.timezone          ?? "Asia/Dhaka",
    timeSlots:         a?.timeSlots         ?? [],
    privacyStatus:     a?.privacyStatus     ?? "public",
    videoType:         a?.videoType         ?? "long",
    aiTitle:           false,
    aiDescription:     false,
    autoHashtags:      false,
    autoPublish:       false,
  };
}

async function fetchAutomations(): Promise<ChannelAutomation[]> {
  const res = await authFetch(apiUrl("/youtube/automations"));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Server error (HTTP ${res.status})`);
  }
  return res.json();
}

/* ─── Channel Card ───────────────────────────────────────────────────────────── */

function ChannelCard({ item, active, onClick }: {
  item: ChannelAutomation; active: boolean; onClick: () => void;
}) {
  const a = item.automation;
  const isRunning = a?.automationEnabled && a?.status === "active";
  const isError   = a?.status === "error";

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-2xl border-2 p-4 transition-all select-none flex flex-col gap-3 ${
        active
          ? "border-primary bg-primary/8 shadow-md"
          : "border-border bg-card hover:border-primary/40 hover:bg-muted/20"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <Avatar className="h-12 w-12">
            <AvatarImage src={item.channelThumbnail} />
            <AvatarFallback className="bg-red-100 dark:bg-red-950 text-red-600">
              <Youtube className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
          {isRunning && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-background animate-pulse" />
          )}
          {isError && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-destructive border-2 border-background" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm leading-tight truncate">{item.channelTitle}</p>
          {item.channelHandle && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              @{item.channelHandle.replace(/^@/, "")}
            </p>
          )}
          {(item.channelSubscriberCount ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Users className="h-2.5 w-2.5" />
              {formatSubscribers(item.channelSubscriberCount!)} subscribers
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        {a ? (
          <Badge
            variant={isError ? "destructive" : isRunning ? "default" : "secondary"}
            className={`text-[10px] gap-1 ${isRunning ? "bg-emerald-600 hover:bg-emerald-600 border-emerald-600" : ""}`}
          >
            {isRunning
              ? <PlayCircle className="h-2.5 w-2.5" />
              : isError
                ? <AlertTriangle className="h-2.5 w-2.5" />
                : <PauseCircle className="h-2.5 w-2.5" />}
            {isRunning ? "Running" : isError ? "Error" : "Paused"}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Not configured
          </Badge>
        )}
        {a && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {a.totalPosted} uploaded
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Stats Bar ──────────────────────────────────────────────────────────────── */

function StatsBar({ automation }: { automation: AutomationConfig }) {
  const fb = automation.sourceType === "facebook";
  const stats = [
    {
      label: "Discovered",
      value: fb ? automation.totalDiscovered : (automation.totalPosted + automation.totalPending + automation.totalFailed),
      cls: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
      valueCls: "text-blue-700 dark:text-blue-300",
      icon: <RefreshCw className="h-3.5 w-3.5 text-blue-500" />,
    },
    {
      label: "Pending",
      value: fb ? automation.queuePending : automation.totalPending,
      cls: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800",
      valueCls: "text-yellow-700 dark:text-yellow-300",
      icon: <Clock className="h-3.5 w-3.5 text-yellow-500" />,
    },
    {
      label: "Uploaded",
      value: fb ? automation.queueUploaded : automation.totalPosted,
      cls: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
      valueCls: "text-emerald-700 dark:text-emerald-300",
      icon: <UploadCloud className="h-3.5 w-3.5 text-emerald-500" />,
    },
    {
      label: "Failed",
      value: fb ? automation.queueFailed : automation.totalFailed,
      cls: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
      valueCls: "text-red-700 dark:text-red-300",
      icon: <XCircle className="h-3.5 w-3.5 text-red-500" />,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {stats.map(({ label, value, cls, valueCls, icon }) => (
        <div key={label} className={`rounded-xl border px-2 py-3 text-center ${cls}`}>
          <div className="flex justify-center mb-1">{icon}</div>
          <p className={`text-xl font-bold font-mono leading-tight ${valueCls}`}>{value}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Queue Panel ────────────────────────────────────────────────────────────── */

function QueuePanel({ automation }: { automation: AutomationConfig }) {
  const fb = automation.sourceType === "facebook";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          {fb ? "Facebook Sync Queue" : "Upload Queue"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Counts */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Pending",  value: fb ? automation.queuePending  : automation.totalPending,  cls: "bg-muted/40" },
            { label: "Uploaded", value: fb ? automation.queueUploaded : automation.totalPosted,
              cls: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" },
            { label: "Failed",   value: fb ? automation.queueFailed   : automation.totalFailed,
              cls: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" },
          ].map(({ label, value, cls }) => (
            <div key={label} className={`rounded-lg border px-3 py-2.5 text-center ${cls}`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className="text-xl font-bold font-mono leading-tight mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Meta info row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {fb && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <RefreshCw className="h-3 w-3 shrink-0" />
              <span>Last scan: <span className="font-medium text-foreground">{formatRelativeTime(automation.lastScanAt)}</span></span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <UploadCloud className="h-3 w-3 shrink-0" />
            <span>Next upload: <span className="font-medium text-foreground">{getNextUploadLabel(automation)}</span></span>
          </div>
          {automation.lastPostedAt && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
              <span>Last upload: <span className="font-medium text-foreground">{formatRelativeTime(automation.lastPostedAt)}</span></span>
            </div>
          )}
        </div>

        {/* Initial scan in-progress */}
        {fb && !automation.initialScanDone && automation.automationEnabled && (
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span>Initial scan running — discovering all historical reels from the page…</span>
          </div>
        )}

        {/* Failures warning */}
        {(fb ? automation.queueFailed : automation.totalFailed) > 0 && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/8 border border-destructive/20 rounded-lg px-3 py-2.5">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{fb ? automation.queueFailed : automation.totalFailed} video(s) failed to upload.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Automation Config Card ─────────────────────────────────────────────────── */

function AutomationConfigCard({ item }: { item: ChannelAutomation }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>(() => defaultForm(item.automation));
  const [dirty, setDirty] = useState(false);
  const [newSlot, setNewSlot] = useState("");
  const [identityError, setIdentityError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  // Toggle has its own instant-save mutation — no "Save" click needed.
  const toggleAutomation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await authFetch(apiUrl(`/youtube/automations/${item.channelId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationEnabled: enabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update automation");
      }
      return res.json();
    },
    onMutate: (enabled) => setForm((f) => ({ ...f, automationEnabled: enabled })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err: Error, enabled) => {
      setForm((f) => ({ ...f, automationEnabled: !enabled }));
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const err = validateSourceIdentity(form.sourceType, form.sourceIdentity);
      if (err) { setIdentityError(err); throw new Error(err); }
      const res = await authFetch(apiUrl(`/youtube/automations/${item.channelId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save automation settings");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Automation settings saved" });
      setDirty(false);
      setIdentityError(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const runNow = useMutation({
    mutationFn: async () => {
      const res = await authFetch(apiUrl(`/youtube/automations/${item.channelId}/run-now`), { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to run automation");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sync started", description: "Video is being fetched and uploaded." });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: QUERY_KEY }), 4000);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const clearError = useMutation({
    mutationFn: async () => {
      const res = await authFetch(apiUrl(`/youtube/automations/${item.channelId}/clear-error`), { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to clear error");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Error cleared", description: "Status and failed count have been reset." });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  function addSlot() {
    if (!newSlot || form.timeSlots.includes(newSlot)) return;
    update("timeSlots", [...form.timeSlots, newSlot].sort());
    setNewSlot("");
  }
  function removeSlot(slot: string) {
    update("timeSlots", form.timeSlots.filter((s) => s !== slot));
  }

  const configured = Boolean(item.automation?.sourceType && item.automation?.sourceIdentity);
  const isRunning = item.automation?.automationEnabled && item.automation?.status === "active";
  const isError   = item.automation?.status === "error";

  const sourcePlaceholder = {
    facebook:  "@PageName or https://facebook.com/PageName",
    instagram: "@username or https://instagram.com/username",
    tiktok:    "@username or https://tiktok.com/@username",
  }[form.sourceType];

  const sourceHint = {
    facebook:  "e.g. @DoggieDram · DoggieDram · https://facebook.com/DoggieDram",
    instagram: "e.g. @username or profile URL",
    tiktok:    "e.g. @username or profile URL",
  }[form.sourceType];

  const sourceIcon = {
    facebook:  <Facebook className="h-4 w-4" />,
    instagram: <Camera className="h-4 w-4" />,
    tiktok:    <Globe className="h-4 w-4" />,
  }[form.sourceType];

  return (
    <Card>
      {/* ── Header ── */}
      <CardHeader className="pb-4 border-b">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Settings2 className="h-4 w-4 text-primary shrink-0" />
            <CardTitle className="text-sm font-semibold">Automation Config</CardTitle>
            {item.automation && (
              <Badge
                variant={isError ? "destructive" : isRunning ? "default" : "secondary"}
                className={`gap-1 text-[10px] ${isRunning ? "bg-emerald-600 hover:bg-emerald-600 border-emerald-600" : ""}`}
              >
                {isRunning
                  ? <><span className="h-1.5 w-1.5 rounded-full bg-white/80 animate-pulse" />Running</>
                  : isError
                    ? <><AlertTriangle className="h-2.5 w-2.5" />Error</>
                    : <><PauseCircle className="h-2.5 w-2.5" />Paused</>}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isError && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => clearError.mutate()}
                disabled={clearError.isPending}
              >
                {clearError.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                Clear Error
              </Button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:block">
                {form.automationEnabled ? "Enabled" : "Disabled"}
              </span>
              <Switch
                checked={form.automationEnabled}
                onCheckedChange={(checked) => toggleAutomation.mutate(checked)}
                disabled={toggleAutomation.isPending}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-6">

        {/* ── Source ── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5" />Source Platform
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Platform</Label>
              <Select
                value={form.sourceType}
                onValueChange={(v: SourceType) => { update("sourceType", v); setIdentityError(null); }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tiktok">
                    <span className="flex items-center gap-2"><Globe className="h-4 w-4" />TikTok</span>
                  </SelectItem>
                  <SelectItem value="instagram">
                    <span className="flex items-center gap-2"><Camera className="h-4 w-4" />Instagram</span>
                  </SelectItem>
                  <SelectItem value="facebook">
                    <span className="flex items-center gap-2"><Facebook className="h-4 w-4" />Facebook</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Source URL / Handle</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                  {sourceIcon}
                </span>
                <Input
                  placeholder={sourcePlaceholder}
                  value={form.sourceIdentity}
                  className={`pl-9 ${identityError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  onChange={(e) => {
                    update("sourceIdentity", e.target.value);
                    setIdentityError(validateSourceIdentity(form.sourceType, e.target.value));
                  }}
                />
              </div>
              {identityError ? (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <XCircle className="h-3 w-3 shrink-0" />{identityError}
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">{sourceHint}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Output ── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Youtube className="h-3.5 w-3.5" />Upload Settings
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Video Type</Label>
              <Select value={form.videoType} onValueChange={(v: VideoType) => update("videoType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="long">Standard Video</SelectItem>
                  <SelectItem value="short">YouTube Shorts</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Privacy</Label>
              <Select value={form.privacyStatus} onValueChange={(v: PrivacyStatus) => update("privacyStatus", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="unlisted">Unlisted</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ── Schedule ── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />Schedule
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Posts Per Day</Label>
              <Input
                type="number"
                min={1}
                max={24}
                value={form.postsPerDay}
                onChange={(e) => update("postsPerDay", parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Schedule Mode</Label>
              <Select value={form.scheduleLogic} onValueChange={(v: ScheduleLogic) => update("scheduleLogic", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed Times</SelectItem>
                  <SelectItem value="random">Random Window</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Timezone</Label>
            <Select value={form.timezone} onValueChange={(v) => update("timezone", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.scheduleLogic === "fixed" && (
            <div className="space-y-2">
              <Label className="text-xs">Posting Times</Label>
              {form.timeSlots.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {form.timeSlots.map((slot) => (
                    <div key={slot} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-muted/40 text-sm font-mono">
                      <span className="font-semibold">{slot}</span>
                      <button
                        type="button"
                        onClick={() => removeSlot(slot)}
                        className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-11 rounded-lg border-2 border-dashed text-xs text-muted-foreground">
                  No time slots — add one below
                </div>
              )}
              {form.timeSlots.length < 10 && (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={newSlot}
                    onChange={(e) => setNewSlot(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <Button variant="outline" size="sm" onClick={addSlot} disabled={!newSlot} className="gap-1">
                    <Plus className="h-3.5 w-3.5" />Add
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Smart Features ── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />Smart Features
          </p>
          <div className="rounded-xl border bg-muted/20 divide-y">
            {([
              { key: "aiTitle"       as const, label: "AI Title",         desc: "Auto-generate optimized video titles",        icon: <Bot className="h-3.5 w-3.5 text-blue-500" /> },
              { key: "aiDescription" as const, label: "AI Description",   desc: "Auto-write descriptions with keywords",       icon: <Sparkles className="h-3.5 w-3.5 text-blue-500" /> },
              { key: "autoHashtags"  as const, label: "Auto Hashtags",    desc: "Append relevant hashtags automatically",      icon: <Hash className="h-3.5 w-3.5 text-blue-500" /> },
              { key: "autoPublish"   as const, label: "Auto Publish",     desc: "Publish immediately on upload",               icon: <Eye className="h-3.5 w-3.5 text-blue-500" /> },
            ]).map(({ key, label, desc, icon }) => (
              <div key={key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="shrink-0">{icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{label}</p>
                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                  </div>
                </div>
                <Switch
                  checked={form[key] as boolean}
                  onCheckedChange={(v) => update(key, v)}
                  className="shrink-0"
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center justify-between gap-3 pt-1 border-t">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            onClick={() => runNow.mutate()}
            disabled={!configured || runNow.isPending}
            title={!configured ? "Save source settings first before syncing" : "Immediately fetch and upload one video"}
          >
            {runNow.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Zap className="h-3.5 w-3.5" />}
            {runNow.isPending ? "Syncing…" : "Sync Now"}
          </Button>

          <Button
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending || !!identityError}
            className="gap-2"
          >
            {save.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Save className="h-4 w-4" />}
            {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────────── */

export default function YoutubeAutomation() {
  const { data: channels, isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchAutomations,
    refetchInterval: 15_000,
    retry: 1,
  });

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  const resolvedChannelId = selectedChannelId ?? (channels?.[0]?.channelId ?? null);
  const selectedChannel   = channels?.find((c) => c.channelId === resolvedChannelId) ?? null;

  return (
    <Layout>
      <div className="flex flex-col gap-6 pb-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <Youtube className="h-6 w-6 text-red-500" />
            YouTube Automation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automatically source videos from TikTok, Instagram, or Facebook and publish them to your YouTube channel on a schedule.
          </p>
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="space-y-4">
            <div className="flex gap-3 overflow-x-auto pb-1">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-28 w-56 shrink-0 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-[420px] w-full rounded-xl" />
          </div>
        )}

        {/* Error state — API call failed (NOT the same as no channels) */}
        {!isLoading && isError && (
          <div className="flex flex-col items-center justify-center gap-5 py-16 px-4 text-center rounded-2xl border-2 border-dashed border-destructive/30">
            <div className="h-20 w-20 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-10 w-10 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Could not load automations</h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                {(error as Error)?.message ?? "There was a problem fetching your automation data."}
              </p>
              <p className="text-xs text-muted-foreground/60">
                If this persists, the production database may need a schema migration (<code className="font-mono">pnpm run push</code> in <code className="font-mono">lib/db</code>).
              </p>
            </div>
            <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        )}

        {/* Empty state — no channels (only shown when data loaded successfully but is empty) */}
        {!isLoading && !isError && channels?.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-5 py-16 px-4 text-center rounded-2xl border-2 border-dashed">
            <div className="h-20 w-20 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <Youtube className="h-10 w-10 text-red-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">No YouTube channels connected</h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                Connect a Google account to link your YouTube channels, then come back here to set up automation.
              </p>
            </div>
            <Button asChild className="gap-2">
              <a href="/youtube/accounts">
                Connect YouTube Channel
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        )}

        {/* Main dashboard */}
        {!isLoading && channels && channels.length > 0 && (
          <>
            {/* ── Step 1: Channel selector ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Select Channel
              </p>
              <div className={`grid gap-3 ${channels.length === 1 ? "grid-cols-1 max-w-sm" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
                {channels.map((item) => (
                  <ChannelCard
                    key={item.channelId}
                    item={item}
                    active={item.channelId === resolvedChannelId}
                    onClick={() => setSelectedChannelId(item.channelId)}
                  />
                ))}
              </div>
            </div>

            {/* ── Selected channel detail ── */}
            {selectedChannel && (
              <div className="space-y-4">
                {/* Stats bar (only when an automation exists) */}
                {selectedChannel.automation && (
                  <StatsBar automation={selectedChannel.automation} />
                )}

                {/* Automation config form — key forces fresh mount on channel switch */}
                <AutomationConfigCard
                  key={selectedChannel.channelId}
                  item={selectedChannel}
                />

                {/* Queue panel (only when configured) */}
                {selectedChannel.automation && (
                  <QueuePanel automation={selectedChannel.automation} />
                )}
              </div>
            )}
          </>
        )}

      </div>
    </Layout>
  );
}
