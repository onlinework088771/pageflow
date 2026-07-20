import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Youtube, Globe, Clock, Plus, X, Save, Play, CheckCircle2, XCircle, Loader2, Camera, Facebook } from "lucide-react";
import { authFetch, apiUrl } from "@/components/schedule-management-utils";
import { useToast } from "@/hooks/use-toast";

// Phase 5 — YouTube Automation.
// Independent of Facebook's page-detail automation UI: this talks only to
// /youtube/automations, which is backed by its own table and service.

const TIMEZONES = [
  "Asia/Dhaka", "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo",
  "Asia/Kolkata", "Australia/Sydney",
];

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
}

interface ChannelAutomation {
  channelId: string;
  channelTitle: string;
  channelThumbnail?: string;
  automation: AutomationConfig | null;
}

type FormState = {
  automationEnabled: boolean;
  sourceType: "tiktok" | "instagram" | "facebook";
  sourceIdentity: string;
  postsPerDay: number;
  scheduleLogic: "fixed" | "random";
  timezone: string;
  timeSlots: string[];
  privacyStatus: "public" | "unlisted" | "private";
  videoType: "short" | "long";
};

const QUERY_KEY = ["youtube-automations"];

function defaultForm(a: AutomationConfig | null): FormState {
  return {
    automationEnabled: a?.automationEnabled ?? false,
    sourceType: a?.sourceType ?? "tiktok",
    sourceIdentity: a?.sourceIdentity ?? "",
    postsPerDay: a?.postsPerDay ?? 1,
    scheduleLogic: a?.scheduleLogic ?? "fixed",
    timezone: a?.timezone ?? "Asia/Dhaka",
    timeSlots: a?.timeSlots ?? [],
    privacyStatus: a?.privacyStatus ?? "public",
    videoType: a?.videoType ?? "long",
  };
}

async function fetchAutomations(): Promise<ChannelAutomation[]> {
  const res = await authFetch(apiUrl("/youtube/automations"));
  if (!res.ok) throw new Error("Failed to load YouTube automations");
  return res.json();
}

/** Validate the source identity field before saving. Returns an error string or null. */
function validateSourceIdentity(platform: "tiktok" | "instagram" | "facebook", identity: string): string | null {
  const trimmed = identity.trim();
  if (!trimmed) return null; // empty is fine — user just hasn't configured yet

  if (platform === "facebook") {
    if (trimmed.startsWith("http")) {
      // Must be a recognisable facebook.com URL
      if (!/^https?:\/\/(www\.|m\.)?facebook\.com\/[A-Za-z0-9._%-]+/.test(trimmed)) {
        return "Invalid Facebook URL — use https://facebook.com/PageName";
      }
    } else {
      // Handle: strip leading @, then must be valid Facebook username chars
      const handle = trimmed.replace(/^@/, "");
      if (!/^[A-Za-z0-9._-]{1,}$/.test(handle)) {
        return "Invalid page username — use letters, numbers, dots, or hyphens (e.g. @DoggieDram)";
      }
    }
  }

  if (platform === "tiktok") {
    const handle = trimmed.startsWith("http") ? trimmed : trimmed.replace(/^@/, "");
    if (!trimmed.startsWith("http") && !/^[A-Za-z0-9._-]{1,}$/.test(handle)) {
      return "Invalid TikTok username — use letters, numbers, dots, or underscores";
    }
  }

  if (platform === "instagram") {
    const handle = trimmed.startsWith("http") ? trimmed : trimmed.replace(/^@/, "");
    if (!trimmed.startsWith("http") && !/^[A-Za-z0-9._]{1,}$/.test(handle)) {
      return "Invalid Instagram username — use letters, numbers, dots, or underscores";
    }
  }

  return null;
}

function ChannelAutomationCard({ item }: { item: ChannelAutomation }) {
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

  // Toggle has its own instant-save mutation so the enabled state is persisted
  // immediately without requiring the user to also click "Save Changes".
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
    onMutate: (enabled) => {
      setForm((f) => ({ ...f, automationEnabled: enabled })); // optimistic
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: Error, enabled) => {
      setForm((f) => ({ ...f, automationEnabled: !enabled })); // revert
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      // Validate before sending to the API
      const err = validateSourceIdentity(form.sourceType, form.sourceIdentity);
      if (err) {
        setIdentityError(err);
        throw new Error(err);
      }
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
      toast({ title: "Automation run started", description: "Check back shortly for the result." });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: QUERY_KEY }), 4000);
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
  const statusBadge = item.automation?.status ?? "paused";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-11 w-11 shrink-0">
            <AvatarImage src={item.channelThumbnail} />
            <AvatarFallback>
              <Youtube className="h-5 w-5 text-red-500" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{item.channelTitle}</CardTitle>
            <CardDescription>
              {item.automation ? (
                <span className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> {item.automation.totalPosted} posted
                  </span>
                  {item.automation.totalFailed > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <XCircle className="h-3 w-3" /> {item.automation.totalFailed} failed
                    </span>
                  )}
                </span>
              ) : (
                "Not configured yet"
              )}
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={statusBadge === "active" ? "default" : statusBadge === "error" ? "destructive" : "secondary"} className="capitalize">
            {statusBadge}
          </Badge>
          <Switch
            checked={form.automationEnabled}
            onCheckedChange={(checked) => toggleAutomation.mutate(checked)}
            disabled={toggleAutomation.isPending}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Source Platform</Label>
            <Select value={form.sourceType} onValueChange={(v: "tiktok" | "instagram" | "facebook") => { update("sourceType", v); setIdentityError(null); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tiktok">
                  <span className="flex items-center gap-2"><Globe className="h-4 w-4" /> TikTok</span>
                </SelectItem>
                <SelectItem value="instagram">
                  <span className="flex items-center gap-2"><Camera className="h-4 w-4" /> Instagram</span>
                </SelectItem>
                <SelectItem value="facebook">
                  <span className="flex items-center gap-2"><Facebook className="h-4 w-4" /> Facebook</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Source Handle / URL</Label>
            <Input
              placeholder={
                form.sourceType === "instagram" ? "@username or Instagram Profile URL" :
                form.sourceType === "facebook"  ? "@PageName or https://facebook.com/PageName" :
                                                  "@username or TikTok Profile URL"
              }
              value={form.sourceIdentity}
              className={identityError ? "border-destructive focus-visible:ring-destructive" : ""}
              onChange={(e) => {
                update("sourceIdentity", e.target.value);
                setIdentityError(validateSourceIdentity(form.sourceType, e.target.value));
              }}
            />
            {identityError ? (
              <p className="text-xs text-destructive flex items-center gap-1">
                <XCircle className="h-3 w-3 shrink-0" /> {identityError}
              </p>
            ) : form.sourceType === "facebook" ? (
              <p className="text-xs text-muted-foreground">
                Examples: <span className="font-mono">@DoggieDram</span> · <span className="font-mono">DoggieDram</span> · <span className="font-mono">https://facebook.com/DoggieDram</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Video Type</Label>
            <Select value={form.videoType} onValueChange={(v: "short" | "long") => update("videoType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="long">Standard video</SelectItem>
                <SelectItem value="short">Shorts</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Privacy</Label>
            <Select value={form.privacyStatus} onValueChange={(v: "public" | "unlisted" | "private") => update("privacyStatus", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="unlisted">Unlisted</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Posts Per Day</Label>
            <Input
              type="number"
              min={1}
              max={24}
              value={form.postsPerDay}
              onChange={(e) => update("postsPerDay", parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-2">
            <Label>Schedule Logic</Label>
            <Select value={form.scheduleLogic} onValueChange={(v: "fixed" | "random") => update("scheduleLogic", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed Times</SelectItem>
                <SelectItem value="random">Random within Window</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Timezone</Label>
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
          <div className="space-y-3">
            <div>
              <Label className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Exact Posting Times
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                The automation checks for a new video at exactly these times, in the selected timezone.
              </p>
            </div>

            {form.timeSlots.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {form.timeSlots.map((slot) => (
                  <div key={slot} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-muted/40 text-sm font-mono">
                    <span className="font-semibold">{slot}</span>
                    <button type="button" onClick={() => removeSlot(slot)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-16 rounded-lg border-2 border-dashed text-sm text-muted-foreground">
                No time slots — add at least one below
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
                  <Plus className="h-3.5 w-3.5" />
                  Add Time
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => runNow.mutate()}
            disabled={!configured || runNow.isPending}
          >
            {runNow.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run now
          </Button>
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending || !!identityError} className="gap-2">
            <Save className="h-4 w-4" />
            {save.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function YoutubeAutomation() {
  const { data: channels, isLoading } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchAutomations });

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Youtube className="h-7 w-7 text-red-500" />
            YouTube Automation
          </h1>
          <p className="text-muted-foreground mt-1">
            Automatically source videos from TikTok, Instagram, or Facebook and publish them to your connected YouTube channel on a schedule.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : !channels?.length ? (
          <Card>
            <CardHeader>
              <CardTitle>No YouTube channels connected</CardTitle>
              <CardDescription>
                Connect a Google account under YouTube Accounts first, then come back here to set up automation.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {channels.map((item) => (
              <ChannelAutomationCard key={item.channelId} item={item} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
