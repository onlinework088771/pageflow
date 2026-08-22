import { useState, useRef, useCallback, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Calendar, Video, CheckCircle, XCircle, Loader2, Globe, Zap,
  ChevronRight, Image, FileText, PlayCircle, Plus, Trash2, Shuffle,
  SkipForward, RefreshCw, Clock, Settings, ChevronDown, ChevronUp,
  Files, BarChart2, AlertCircle, GripVertical, X, Users,
} from "lucide-react";
import { FacebookPostPreview } from "@/components/facebook-post-preview";
import { ScheduleManagement } from "@/components/schedule-management";
import { apiUrl, authFetch, TIMEZONES } from "@/components/schedule-management-utils";
import {
  resolveOriginalCaptionForItem,
  resolveOriginalTitleForItem,
} from "@/lib/original-title-rules";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardStep = "account" | "pages" | "content" | "upload";
type ScheduledVideoStatus = "pending" | "processing" | "posted" | "failed";
type ContentType = "video" | "reel" | "image" | "text";
type UploadMode = "single" | "bulk";
type TimeSlotMode = "auto" | "manual";
type TitleMode = "same" | "sequential";

interface BulkFile {
  id: string;
  file?: File;
  sourceUrl?: string;
  originalTitle: string | null;
  originalTitleResolved: boolean;
  titleOverride?: string;
  captionOverride?: string;
  titleManuallyEdited: boolean;
  captionManuallyEdited: boolean;
  status: "pending" | "uploading" | "done" | "failed";
  error?: string;
  scheduledAt?: string;
}

interface BulkConfig {
  postsPerDay: number;
  startDate: string;
  timeSlotMode: TimeSlotMode;
  timeSlots: string[];
  timezone: string;
  titleMode: TitleMode;
  defaultTitle: string;
  sequentialPrefix: string;
  defaultCaption: string;
  defaultHashtags: string;
  applyCaption: boolean;
  applyHashtags: boolean;
  shuffleOrder: boolean;
  skipDuplicates: boolean;
  autoRetry: boolean;
  maxRetries: number;
}

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

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const DEFAULT_BULK_CONFIG: BulkConfig = {
  postsPerDay: 3,
  startDate: new Date().toISOString().split("T")[0],
  timeSlotMode: "auto",
  timeSlots: ["09:00", "13:00", "19:00"],
  timezone: "America/New_York",
  titleMode: "sequential",
  defaultTitle: "",
  sequentialPrefix: "Post",
  defaultCaption: "",
  defaultHashtags: "",
  applyCaption: true,
  applyHashtags: true,
  shuffleOrder: false,
  skipDuplicates: true,
  autoRetry: true,
  maxRetries: 3,
};

function autoSlots(count: number): string[] {
  if (count <= 0) return [];
  if (count === 1) return ["09:00"];
  const start = 9, end = 21;
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const h = Math.round(start + i * step);
    return `${String(h).padStart(2, "0")}:00`;
  });
}

function generateSchedule(total: number, cfg: BulkConfig): string[] {
  const slots = cfg.timeSlots.slice(0, cfg.postsPerDay);
  return Array.from({ length: total }, (_, i) => {
    const day = Math.floor(i / cfg.postsPerDay);
    const slotIdx = i % cfg.postsPerDay;
    const time = slots[slotIdx] ?? slots[slots.length - 1] ?? "09:00";
    const d = new Date(cfg.startDate + "T" + time);
    d.setDate(d.getDate() + day);
    return d.toISOString();
  });
}

function getTitle(idx: number, cfg: BulkConfig): string {
  if (cfg.titleMode === "same") return cfg.defaultTitle || `Post ${idx + 1}`;
  return `${cfg.sequentialPrefix || "Post"} #${idx + 1}`;
}

function originalTitleFromFilename(filename: string): string | null {
  const baseName = filename.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "").trim() ?? "";
  return baseName || null;
}

function getBulkTitle(f: BulkFile, index: number, cfg: BulkConfig, useOriginalTitle: boolean): string {
  return resolveOriginalTitleForItem(f, getTitle(index, cfg), useOriginalTitle);
}

function getBulkCaption(f: BulkFile, cfg: BulkConfig, useOriginalTitle: boolean): string {
  const fallbackCaption = [
    cfg.applyCaption ? cfg.defaultCaption : "",
    cfg.applyHashtags ? cfg.defaultHashtags : "",
  ].filter(Boolean).join("\n\n");
  return resolveOriginalCaptionForItem(f, fallbackCaption, useOriginalTitle);
}

function fmtBytes(b: number): string {
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + " GB";
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
  return (b / 1024).toFixed(0) + " KB";
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------
// Wizard progress bar
// ---------------------------------------------------------------------------

function WizardProgress({ step }: { step: WizardStep }) {
  const steps: { key: WizardStep; label: string }[] = [
    { key: "account", label: "Account" },
    { key: "pages", label: "Pages" },
    { key: "content", label: "Content" },
    { key: "upload", label: "Upload" },
  ];
  const idx = steps.findIndex((s) => s.key === step);

  return (
    <div className="flex items-center gap-0 mb-6 overflow-x-auto pb-1">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center shrink-0">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            i <= idx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}>
            <span className="h-4 w-4 rounded-full border-2 border-current flex items-center justify-center text-[10px]">
              {i < idx ? "✓" : i + 1}
            </span>
            {s.label}
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 w-6 mx-1 rounded ${i < idx ? "bg-primary" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content type cards
// ---------------------------------------------------------------------------

const CONTENT_TYPES: { type: ContentType; icon: React.ElementType; label: string; desc: string; available: boolean }[] = [
  { type: "video",  icon: Video,      label: "Video",     desc: "Regular video post to your feed",  available: true },
  { type: "reel",   icon: PlayCircle, label: "Reel",      desc: "Short-form vertical video reel",   available: true },
  { type: "image",  icon: Image,      label: "Image",     desc: "Single or carousel image post",    available: false },
  { type: "text",   icon: FileText,   label: "Text Post", desc: "Text-only post or status update",  available: false },
];

// ---------------------------------------------------------------------------
// Time slot row component
// ---------------------------------------------------------------------------

function TimeSlotRow({ value, onChange, onRemove }: { value: string; onChange: (v: string) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      <Input type="time" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm flex-1" />
      <button onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk file card
// ---------------------------------------------------------------------------

function OriginalTitleToggle({
  checked,
  onCheckedChange,
  id,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">Use Original Video Title</Label>
        <p className="text-[11px] leading-relaxed text-muted-foreground mt-0.5">
          Use each video's original title for the Reel title and caption. Manual edits always take priority.
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="shrink-0" />
    </div>
  );
}

async function resolveSourceTitle(url: string): Promise<string | null> {
  const response = await authFetch(apiUrl("/scheduled-videos/resolve-title"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  return typeof data.originalTitle === "string" && data.originalTitle.trim()
    ? data.originalTitle.trim()
    : null;
}

async function resolveLocalFileTitle(file: File): Promise<string | null> {
  const formData = new FormData();
  formData.append("video", file);
  const response = await authFetch(apiUrl("/scheduled-videos/resolve-file-title"), {
    method: "POST",
    body: formData,
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  return typeof data.originalTitle === "string" && data.originalTitle.trim()
    ? data.originalTitle.trim()
    : null;
}

function BulkFileCard({
  f,
  previewTitle,
  previewCaption,
  useOriginalTitle,
  onRemove,
  onTitleChange,
  onCaptionChange,
}: {
  f: BulkFile;
  previewTitle: string;
  previewCaption: string;
  useOriginalTitle: boolean;
  onRemove: () => void;
  onTitleChange: (value: string) => void;
  onCaptionChange: (value: string) => void;
}) {
  const statusIcon = {
    pending:   <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
    uploading: <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />,
    done:      <CheckCircle className="h-3.5 w-3.5 text-green-500" />,
    failed:    <XCircle className="h-3.5 w-3.5 text-destructive" />,
  }[f.status];

  return (
    <div       className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
      f.status === "done" ? "bg-green-500/5 border-green-500/20" :
      f.status === "failed" ? "bg-destructive/5 border-destructive/20" :
      f.status === "uploading" ? "bg-primary/5 border-primary/20" :
      "bg-muted/30 border-border/50"
    }`}>
      {statusIcon}
      <div className="flex-1 min-w-0">
        <span className="block truncate text-xs">{f.file?.name ?? f.sourceUrl ?? "Source URL"}</span>
        {useOriginalTitle && !f.originalTitleResolved && <span className="block truncate text-[10px] text-muted-foreground">Reading embedded/source title…</span>}
        {useOriginalTitle && f.originalTitleResolved && f.originalTitle && <span className="block truncate text-[10px] text-muted-foreground">Original title: {f.originalTitle}</span>}
      </div>
      {f.file && <span className="text-muted-foreground text-[10px] shrink-0">{fmtBytes(f.file.size)}</span>}
      {f.status === "pending" && (
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {f.error && <span className="text-destructive text-[10px] truncate max-w-[80px]">{f.error}</span>}
      {useOriginalTitle && (
        <div className="basis-full grid gap-1.5 pl-6 pt-1">
          <Input
            value={f.titleOverride ?? previewTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Title"
            className="h-7 text-xs"
            aria-label={`Title for ${f.file?.name ?? f.sourceUrl ?? "source"}`}
          />
          <Textarea
            value={f.captionOverride ?? previewCaption}
            onChange={(e) => onCaptionChange(e.target.value)}
            placeholder="Caption"
            rows={2}
            className="text-xs"
            aria-label={`Caption for ${f.file?.name ?? f.sourceUrl ?? "source"}`}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reel Collaboration Config Component
// ---------------------------------------------------------------------------

function ReelCollaborationConfig({
  enabled,
  onToggleEnabled,
  selectedPageIds,
  collaboratorPageIds,
  onToggleCollaborator,
  allConnectedPages,
}: {
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  selectedPageIds: string[];
  collaboratorPageIds: string[];
  onToggleCollaborator: (pageId: string) => void;
  allConnectedPages: Array<{
    id: string;
    name: string;
    profilePicture?: string | null;
    followersCount?: number | null;
  }>;
}) {
  return (
    <Card className="border-pink-500/30 bg-pink-500/5">
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-pink-500/10 flex items-center justify-center text-pink-600 shrink-0">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold flex items-center gap-1.5 leading-tight">
                Facebook Page Collaboration
                <Badge variant="outline" className="text-[9px] text-pink-600 border-pink-300 bg-pink-50 dark:bg-pink-950/50 py-0 h-4">
                  Reel Feature
                </Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                Invite other connected Facebook Pages as co-authors on this Reel
              </p>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={onToggleEnabled}
            id="collaboration-toggle"
          />
        </div>

        {enabled && (
          <div className="pt-2 border-t border-pink-500/15 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">
                Select Collaborator Page(s) ({collaboratorPageIds.length} selected)
              </Label>
              {allConnectedPages.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    if (collaboratorPageIds.length === allConnectedPages.length) {
                      allConnectedPages.forEach((p) => {
                        if (collaboratorPageIds.includes(p.id)) onToggleCollaborator(p.id);
                      });
                    } else {
                      allConnectedPages.forEach((p) => {
                        if (!collaboratorPageIds.includes(p.id)) onToggleCollaborator(p.id);
                      });
                    }
                  }}
                  className="text-[11px] text-pink-600 hover:underline cursor-pointer font-medium"
                >
                  {collaboratorPageIds.length === allConnectedPages.length ? "Deselect All" : "Select All Connected"}
                </button>
              )}
            </div>

            {allConnectedPages.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-1">
                No connected Facebook Pages found.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {allConnectedPages.map((page) => {
                  const isSelected = collaboratorPageIds.includes(page.id);
                  const isHostPage = selectedPageIds.includes(page.id);
                  return (
                    <div
                      key={page.id}
                      onClick={() => onToggleCollaborator(page.id)}
                      className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? "border-pink-500 bg-pink-500/10 shadow-xs font-medium"
                          : "border-border/60 hover:bg-muted/40"
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleCollaborator(page.id)}
                        className="data-[state=checked]:bg-pink-600 data-[state=checked]:border-pink-600"
                      />
                      <Avatar className="h-6 w-6 border shrink-0">
                        <AvatarImage src={page.profilePicture ?? undefined} />
                        <AvatarFallback className="text-[9px] font-bold">
                          {page.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate leading-tight">{page.name}</p>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          {page.followersCount ? <span>{page.followersCount.toLocaleString()} followers</span> : null}
                          {isHostPage && <span className="text-pink-600 font-semibold">(Target Page)</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function UploadScheduler() {
  const { toast } = useToast();
  const { data: accounts, isLoading: accountsLoading } = useListAccounts({});
  const { data: allPages,  isLoading: pagesLoading }   = useListPages({});

  // Wizard state
  const [step, setStep]                       = useState<WizardStep>("account");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [contentType, setContentType]         = useState<ContentType>("video");
  const [uploadMode, setUploadMode]           = useState<UploadMode>("single");

  // Collaboration state (for Reels)
  const [collabEnabled, setCollabEnabled]             = useState(false);
  const [selectedCollabPageIds, setSelectedCollabPageIds] = useState<string[]>([]);

  // Single upload state
  const [singleTitle, setSingleTitle]         = useState("");
  const [singleCaption, setSingleCaption]     = useState("");
  const [singleHashtags, setSingleHashtags]   = useState("");
  const [singleDate, setSingleDate]           = useState("");
  const [singleTime, setSingleTime]           = useState("");
  const [singleTimezone, setSingleTimezone]   = useState("America/New_York");
  const [singleUrl, setSingleUrl]             = useState("");
  const [singleFile, setSingleFile]           = useState<File | null>(null);
  const [singleOriginalTitle, setSingleOriginalTitle] = useState<string | null>(null);
  const [singleTitleManuallyEdited, setSingleTitleManuallyEdited] = useState(false);
  const [singleCaptionManuallyEdited, setSingleCaptionManuallyEdited] = useState(false);
  const [singleUseOriginalVideoTitle, setSingleUseOriginalVideoTitle] = useState(false);
  const [singleTitleResolving, setSingleTitleResolving] = useState(false);
  const singleTitleRequestRef = useRef(0);
  const singleUseOriginalTitleRef = useRef(false);
  const singleTitleManualRef = useRef(false);
  const singleCaptionManualRef = useRef(false);
  const [singleUploading, setSingleUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver]               = useState(false);

  // Bulk upload state
  const [bulkFiles, setBulkFiles]             = useState<BulkFile[]>([]);
  const [bulkSourceUrl, setBulkSourceUrl]     = useState("");
  const [bulkConfig, setBulkConfig]           = useState<BulkConfig>(DEFAULT_BULK_CONFIG);
  const [bulkUseOriginalVideoTitle, setBulkUseOriginalVideoTitle] = useState(false);
  const [bulkProcessing, setBulkProcessing]   = useState(false);
  const [bulkDragOver, setBulkDragOver]       = useState(false);
  const [showAdvanced, setShowAdvanced]       = useState(false);
  const bulkFileRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  const resolvingBulkTitlesRef = useRef(new Map<string, symbol>());
  const bulkUseOriginalTitleRef = useRef(false);

  // Schedule management state
  const [scheduledVideos, setScheduledVideos] = useState<ScheduledVideo[]>([]);
  const [loadingVideos, setLoadingVideos]     = useState(true);
  const [postingNow, setPostingNow]           = useState<Set<string>>(new Set());

  // Pages for selected account
  const accountPages = selectedAccountId
    ? (allPages ?? []).filter((p) => p.accountId === selectedAccountId && (p.status === "active" || p.status === "paused"))
    : [];
  const connectedFbPages = (allPages ?? []).filter((p) => p.status === "active" || p.status === "paused");
  const allSelected  = accountPages.length > 0 && accountPages.every((p) => selectedPageIds.includes(p.id));

  const applySingleOriginalTitle = useCallback((title: string | null) => {
    setSingleOriginalTitle(title);
    if (!singleUseOriginalTitleRef.current || !title) return;
    if (!singleTitleManualRef.current) setSingleTitle(title);
    if (!singleCaptionManualRef.current) setSingleCaption(title);
  }, []);

  const resolveSingleFileTitle = useCallback(async (file: File, requestId: number) => {
    setSingleTitleResolving(true);
    try {
      const embeddedTitle = await resolveLocalFileTitle(file);
      if (requestId !== singleTitleRequestRef.current || !singleUseOriginalTitleRef.current) return;
      applySingleOriginalTitle(embeddedTitle ?? originalTitleFromFilename(file.name));
    } catch {
      if (requestId === singleTitleRequestRef.current && singleUseOriginalTitleRef.current) {
        applySingleOriginalTitle(originalTitleFromFilename(file.name));
      }
    } finally {
      if (requestId === singleTitleRequestRef.current) setSingleTitleResolving(false);
    }
  }, [applySingleOriginalTitle]);

  const selectSingleFile = useCallback((file: File | null) => {
    const requestId = ++singleTitleRequestRef.current;
    setSingleFile(file);
    if (!file) {
      setSingleTitleResolving(false);
      setSingleOriginalTitle(null);
      return;
    }

    applySingleOriginalTitle(originalTitleFromFilename(file.name));
    if (singleUseOriginalTitleRef.current) void resolveSingleFileTitle(file, requestId);
  }, [applySingleOriginalTitle, resolveSingleFileTitle]);

  const handleSingleOriginalTitleToggle = useCallback((enabled: boolean) => {
    singleUseOriginalTitleRef.current = enabled;
    setSingleUseOriginalVideoTitle(enabled);
    if (!enabled) {
      setSingleTitleResolving(false);
      return;
    }
    if (singleFile) {
      const requestId = ++singleTitleRequestRef.current;
      applySingleOriginalTitle(originalTitleFromFilename(singleFile.name));
      void resolveSingleFileTitle(singleFile, requestId);
    } else if (singleOriginalTitle) {
      applySingleOriginalTitle(singleOriginalTitle);
    }
  }, [applySingleOriginalTitle, resolveSingleFileTitle, singleFile, singleOriginalTitle]);

  useEffect(() => {
    let cancelled = false;
    if (!singleUseOriginalVideoTitle || singleFile || !singleUrl.trim()) {
      if (!singleFile && !singleUrl.trim()) applySingleOriginalTitle(null);
      setSingleTitleResolving(false);
      return () => { cancelled = true; };
    }

    const requestId = ++singleTitleRequestRef.current;
    setSingleTitleResolving(true);
    const timeoutId = window.setTimeout(() => {
      resolveSourceTitle(singleUrl.trim())
        .then((title) => {
          if (!cancelled && requestId === singleTitleRequestRef.current && singleUseOriginalTitleRef.current) {
            applySingleOriginalTitle(title);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (requestId === singleTitleRequestRef.current) setSingleTitleResolving(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [applySingleOriginalTitle, singleFile, singleUrl, singleUseOriginalVideoTitle]);

  // Fetch scheduled videos
  const fetchVideos = useCallback(async () => {
    try {
      const r = await authFetch(apiUrl("/scheduled-videos"));
      if (r.ok) setScheduledVideos(await r.json());
    } catch { /* ignore */ } finally { setLoadingVideos(false); }
  }, []);

  useEffect(() => {
    fetchVideos();
    const id = setInterval(fetchVideos, 8_000);
    return () => clearInterval(id);
  }, [fetchVideos]);

  // Auto-update time slots when slot mode or postsPerDay changes
  useEffect(() => {
    if (bulkConfig.timeSlotMode === "auto") {
      setBulkConfig((c) => ({ ...c, timeSlots: autoSlots(c.postsPerDay) }));
    }
  }, [bulkConfig.postsPerDay, bulkConfig.timeSlotMode]);

  // ---- Helpers ----

  function togglePage(id: string) {
    setSelectedPageIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleCollabPage(id: string) {
    setSelectedCollabPageIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    const ids = accountPages.map((p) => p.id);
    setSelectedPageIds((prev) =>
      allSelected ? prev.filter((x) => !ids.includes(x)) : [...new Set([...prev, ...ids])]
    );
  }

  function handleSelectAccount(id: string) {
    setSelectedAccountId(id);
    setSelectedPageIds([]);
  }

  function getPageName(pageId: string) {
    return allPages?.find((p) => p.id === pageId)?.name ?? `Page ${pageId}`;
  }

  // ---- Single upload handlers ----

  function handleSingleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) selectSingleFile(file);
  }

  async function submitSingle(postNow: boolean) {
    if (singleUseOriginalVideoTitle && singleTitleResolving) {
      toast({ title: "Resolving original title", description: "Please wait for the embedded video metadata to finish loading." });
      return;
    }
    if (!singleTitle.trim()) {
      toast({ title: "Title required", variant: "destructive" }); return;
    }
    if (selectedPageIds.length === 0) {
      toast({ title: "Select at least one page", variant: "destructive" }); return;
    }
    if (!postNow && (!singleDate || !singleTime)) {
      toast({ title: "Pick a date & time", variant: "destructive" }); return;
    }
    if (!singleFile && !singleUrl.trim()) {
      toast({ title: "Upload a file or paste a URL", variant: "destructive" }); return;
    }

    const scheduledAt = postNow
      ? new Date().toISOString()
      : new Date(`${singleDate}T${singleTime}`).toISOString();

    const caption = [singleCaption, singleHashtags].filter(Boolean).join("\n\n");

    setSingleUploading(true);
    try {
      const fd = new FormData();
      fd.append("title", singleTitle.trim());
      fd.append("useOriginalTitle", String(singleUseOriginalVideoTitle));
      fd.append("titleManuallyEdited", String(singleTitleManuallyEdited));
      fd.append("captionManuallyEdited", String(singleCaptionManuallyEdited));
      if (caption) fd.append("description", caption);
      fd.append("pageIds", JSON.stringify(selectedPageIds));
      fd.append("scheduledAt", scheduledAt);
      fd.append("timezone", singleTimezone);
      fd.append("postType", contentType);
      fd.append("publishMode", contentType === "reel" ? "reel" : "video");
      if (contentType === "reel" && collabEnabled && selectedCollabPageIds.length > 0) {
        fd.append("collaborationEnabled", "true");
        fd.append("collaboratorPageIds", JSON.stringify(selectedCollabPageIds));
      }
      if (singleUrl.trim()) fd.append("videoUrl", singleUrl.trim());
      if (singleFile) fd.append("video", singleFile);

      const r = await authFetch(apiUrl("/scheduled-videos"), { method: "POST", body: fd });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Failed to schedule");
      }
      const created = await r.json();
      setScheduledVideos((p) => [created, ...p]);

      if (postNow) {
        await authFetch(apiUrl(`/scheduled-videos/${created.id}/post-now`), { method: "POST" });
        toast({ title: "Posting now!", description: `"${created.title}" is being posted.` });
        setTimeout(fetchVideos, 3000);
        setTimeout(fetchVideos, 8000);
      } else {
        toast({ title: "Scheduled!", description: `"${created.title}" scheduled to ${selectedPageIds.length} page(s).` });
      }

      setSingleTitle(""); setSingleCaption(""); setSingleHashtags("");
      setSingleDate(""); setSingleTime(""); setSingleUrl("");
      selectSingleFile(null);
      singleTitleManualRef.current = false;
      singleCaptionManualRef.current = false;
      setSingleTitleManuallyEdited(false);
      setSingleCaptionManuallyEdited(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSingleUploading(false);
    }
  }

  // ---- Bulk upload handlers ----

  function addBulkFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const newFiles: BulkFile[] = arr.map((file) => ({
      id: uid(),
      file,
      originalTitle: originalTitleFromFilename(file.name),
      originalTitleResolved: false,
      titleManuallyEdited: false,
      captionManuallyEdited: false,
      status: "pending",
    }));
    setBulkFiles((prev) => {
      const existing = new Set(prev.map((f) => f.file ? `${f.file.name}:${f.file.size}` : `url:${f.sourceUrl}`));
      return [
        ...prev,
        ...(bulkConfig.skipDuplicates
          ? newFiles.filter((f) => !existing.has(`${f.file?.name}:${f.file?.size}`))
          : newFiles),
      ];
    });
  }

  function updateBulkFile(id: string, patch: Partial<BulkFile>) {
    if (patch.file !== undefined || patch.sourceUrl !== undefined) {
      resolvingBulkTitlesRef.current.delete(id);
    }
    setBulkFiles((prev) => prev.map((f) => f.id === id ? { ...f, ...patch } : f));
  }

  async function addBulkSourceUrl() {
    const url = bulkSourceUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast({ title: "Enter a valid HTTP(S) URL", variant: "destructive" });
      return;
    }
    const id = uid();
    setBulkFiles((prev) => [...prev, {
      id,
      sourceUrl: url,
      originalTitle: null,
      originalTitleResolved: false,
      titleManuallyEdited: false,
      captionManuallyEdited: false,
      status: "pending",
    }]);
    setBulkSourceUrl("");
  }

  const handleBulkOriginalTitleToggle = useCallback((enabled: boolean) => {
    bulkUseOriginalTitleRef.current = enabled;
    setBulkUseOriginalVideoTitle(enabled);
    if (!enabled) resolvingBulkTitlesRef.current.clear();
  }, []);

  useEffect(() => {
    if (!bulkUseOriginalVideoTitle) {
      resolvingBulkTitlesRef.current.clear();
      return;
    }

    const pending = bulkFiles.filter((f) =>
      !f.originalTitleResolved &&
      Boolean(f.file || f.sourceUrl) &&
      !resolvingBulkTitlesRef.current.has(f.id),
    );
    if (pending.length === 0) return;

    pending.forEach((file) => {
      const requestToken = Symbol(file.id);
      resolvingBulkTitlesRef.current.set(file.id, requestToken);
      const resolution = file.file
        ? resolveLocalFileTitle(file.file)
        : file.sourceUrl
          ? resolveSourceTitle(file.sourceUrl)
          : Promise.resolve(null);
      resolution
        .catch(() => null)
        .then((originalTitle) => {
          if (
            bulkUseOriginalTitleRef.current &&
            resolvingBulkTitlesRef.current.get(file.id) === requestToken
          ) {
            updateBulkFile(file.id, {
              originalTitle: originalTitle ?? (file.file ? originalTitleFromFilename(file.file.name) : null),
              originalTitleResolved: true,
            });
          }
        })
        .finally(() => {
          if (resolvingBulkTitlesRef.current.get(file.id) === requestToken) {
            resolvingBulkTitlesRef.current.delete(file.id);
          }
        });
    });
  }, [bulkFiles, bulkUseOriginalVideoTitle]);

  function removeBulkFile(id: string) {
    resolvingBulkTitlesRef.current.delete(id);
    setBulkFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function clearBulkFiles() {
    resolvingBulkTitlesRef.current.clear();
    setBulkFiles([]);
  }

  function updateSlot(i: number, val: string) {
    setBulkConfig((c) => {
      const slots = [...c.timeSlots];
      slots[i] = val;
      return { ...c, timeSlots: slots };
    });
  }

  function addSlot() {
    setBulkConfig((c) => ({ ...c, timeSlots: [...c.timeSlots, "12:00"] }));
  }

  function removeSlot(i: number) {
    setBulkConfig((c) => ({ ...c, timeSlots: c.timeSlots.filter((_, j) => j !== i) }));
  }

  async function startBulkScheduling() {
    if (bulkFiles.length === 0) {
      toast({ title: "No files selected", variant: "destructive" }); return;
    }
    if (bulkUseOriginalVideoTitle && bulkFiles.some((file) => !file.originalTitleResolved)) {
      toast({ title: "Resolving original titles", description: "Please wait for every video’s embedded metadata to finish loading." });
      return;
    }
    if (selectedPageIds.length === 0) {
      toast({ title: "Select at least one page", variant: "destructive" }); return;
    }
    if (bulkConfig.timeSlots.length === 0) {
      toast({ title: "Add at least one time slot", variant: "destructive" }); return;
    }

    const files = bulkConfig.shuffleOrder ? [...bulkFiles].sort(() => Math.random() - 0.5) : [...bulkFiles];
    const missingTitles = files.filter((file, index) => !getBulkTitle(file, index, bulkConfig, bulkUseOriginalVideoTitle).trim());
    if (missingTitles.length > 0) {
      toast({ title: `${missingTitles.length} video(s) need a title`, variant: "destructive" });
      return;
    }
    const schedule = generateSchedule(files.length, bulkConfig);

    setBulkProcessing(true);
    processingRef.current = true;

    // Process in batches of 3
    const batchSize = 3;
    for (let i = 0; i < files.length; i += batchSize) {
      if (!processingRef.current) break;
      const batch = files.slice(i, i + batchSize);

      await Promise.allSettled(batch.map(async (f, bIdx) => {
        const globalIdx = i + bIdx;
        const scheduledAt = schedule[globalIdx];

        setBulkFiles((prev) => prev.map((bf) => bf.id === f.id ? { ...bf, status: "uploading" } : bf));

        const title = getBulkTitle(f, globalIdx, bulkConfig, bulkUseOriginalVideoTitle).trim();
        const caption = getBulkCaption(f, bulkConfig, bulkUseOriginalVideoTitle);

        const fd = new FormData();
        fd.append("title", title);
        fd.append("useOriginalTitle", String(bulkUseOriginalVideoTitle));
        fd.append("titleManuallyEdited", String(f.titleManuallyEdited));
        fd.append("captionManuallyEdited", String(f.captionManuallyEdited));
        if (caption) fd.append("description", caption);
        fd.append("pageIds", JSON.stringify(selectedPageIds));
        fd.append("scheduledAt", scheduledAt);
        fd.append("timezone", bulkConfig.timezone);
        fd.append("postType", contentType);
        fd.append("publishMode", contentType === "reel" ? "reel" : "video");
        if (contentType === "reel" && collabEnabled && selectedCollabPageIds.length > 0) {
        fd.append("collaborationEnabled", "true");
        fd.append("collaboratorPageIds", JSON.stringify(selectedCollabPageIds));
      }
      if (f.file) fd.append("video", f.file);
      if (f.sourceUrl) fd.append("videoUrl", f.sourceUrl);

        let retries = 0;
        while (retries <= (bulkConfig.autoRetry ? bulkConfig.maxRetries : 0)) {
          try {
            const r = await authFetch(apiUrl("/scheduled-videos"), { method: "POST", body: fd });
            if (!r.ok) {
              const e = await r.json().catch(() => ({}));
              throw new Error(e.error || "Upload failed");
            }
            const created = await r.json();
            setScheduledVideos((prev) => [created, ...prev]);
            setBulkFiles((prev) => prev.map((bf) => bf.id === f.id ? { ...bf, status: "done", scheduledAt } : bf));
            return;
          } catch (err: any) {
            retries++;
            if (retries > (bulkConfig.autoRetry ? bulkConfig.maxRetries : 0)) {
              setBulkFiles((prev) => prev.map((bf) =>
                bf.id === f.id ? { ...bf, status: "failed", error: err.message } : bf
              ));
            }
          }
        }
      }));
    }

    processingRef.current = false;
    setBulkProcessing(false);

    const done   = bulkFiles.filter((f) => f.status === "done").length;
    const failed = bulkFiles.filter((f) => f.status === "failed").length;
    toast({
      title: "Bulk scheduling complete",
      description: `${done} scheduled successfully${failed ? `, ${failed} failed` : ""}.`,
    });
    fetchVideos();
  }

  function stopBulkProcessing() {
    processingRef.current = false;
    setBulkProcessing(false);
  }

  // ---- Schedule management actions ----

  async function handlePostNow(id: string) {
    setPostingNow((p) => new Set(p).add(id));
    try {
      const r = await authFetch(apiUrl(`/scheduled-videos/${id}/post-now`), { method: "POST" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      toast({ title: "Posting started!" });
      setScheduledVideos((p) => p.map((v) => v.id === id ? { ...v, status: "processing" } : v));
      setTimeout(fetchVideos, 3000);
      setTimeout(fetchVideos, 8000);
      setTimeout(fetchVideos, 20000);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setPostingNow((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  }

  async function handleDelete(id: string) {
    try {
      await authFetch(apiUrl(`/scheduled-videos/${id}`), { method: "DELETE" });
      setScheduledVideos((p) => p.filter((v) => v.id !== id));
      toast({ title: "Deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const r = await authFetch(apiUrl(`/scheduled-videos/${id}/duplicate`), { method: "POST" });
      if (!r.ok) throw new Error("Failed to duplicate");
      const copy = await r.json();
      setScheduledVideos((p) => [copy, ...p]);
      toast({ title: "Duplicated", description: "A copy has been scheduled for the next day." });
    } catch (err: any) {
      toast({ title: "Duplicate failed", description: err.message, variant: "destructive" });
    }
  }

  function handleUpdated(video: ScheduledVideo) {
    setScheduledVideos((p) => p.map((v) => v.id === video.id ? video : v));
  }

  // ---- Computed bulk stats ----
  const bulkDone      = bulkFiles.filter((f) => f.status === "done").length;
  const bulkFailed    = bulkFiles.filter((f) => f.status === "failed").length;
  const bulkUploading = bulkFiles.filter((f) => f.status === "uploading").length;
  const bulkRemaining = bulkFiles.filter((f) => f.status === "pending").length;
  const bulkProgress  = bulkFiles.length > 0 ? Math.round(((bulkDone + bulkFailed) / bulkFiles.length) * 100) : 0;

  const previewDays   = bulkFiles.length > 0 ? Math.ceil(bulkFiles.length / bulkConfig.postsPerDay) : 0;

  // ---- Selected page name for preview ----
  const previewPage = selectedPageIds.length > 0
    ? allPages?.find((p) => p.id === selectedPageIds[0])
    : undefined;

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <Layout>
      <div className="flex flex-col gap-6 max-w-7xl mx-auto">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Video Scheduler</h1>
          <p className="text-muted-foreground mt-1 text-sm">Schedule and bulk-post videos & reels to your Facebook pages.</p>
        </div>

        {/* Wizard progress */}
        <WizardProgress step={step} />

        {/* ========== STEP 1: Account ========== */}
        {step === "account" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">1</span>
                Select Facebook Account
              </CardTitle>
            </CardHeader>
            <CardContent>
              {accountsLoading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
              ) : !accounts?.length ? (
                <div className="text-center py-10 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No Facebook accounts connected. Go to FB Accounts first.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {accounts.filter((a) => a.status === "connected").map((acc) => (
                    <div
                      key={acc.id}
                      onClick={() => { handleSelectAccount(acc.id); setStep("pages"); }}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all hover:shadow-sm ${
                        selectedAccountId === acc.id ? "border-primary bg-primary/8 shadow-sm" : "hover:border-primary/40"
                      }`}
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={acc.profilePicture ?? undefined} />
                        <AvatarFallback className="text-xs bg-blue-500/10 text-blue-600 font-bold">
                          {acc.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{acc.name}</p>
                        <p className="text-xs text-muted-foreground">{acc.pagesCount} page(s)</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ========== STEP 2: Pages ========== */}
        {step === "pages" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">2</span>
                  Select Pages
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setStep("account")} className="text-xs gap-1">
                  ← Back
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {pagesLoading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
              ) : !accountPages.length ? (
                <p className="text-sm text-muted-foreground py-4">No active pages for this account.</p>
              ) : (
                <>
                  <div className="border rounded-xl overflow-hidden">
                    <div
                      onClick={toggleSelectAll}
                      className="flex items-center gap-3 px-4 py-3 bg-muted/40 border-b cursor-pointer hover:bg-muted/60"
                    >
                      <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                      <span className="text-sm font-semibold flex-1">Select All Pages</span>
                      <Badge variant="outline" className="text-[10px]">{accountPages.length}</Badge>
                    </div>
                    <div className="max-h-60 overflow-y-auto divide-y">
                      {accountPages.map((pg) => (
                        <div
                          key={pg.id}
                          onClick={() => togglePage(pg.id)}
                          className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors ${
                            selectedPageIds.includes(pg.id) ? "bg-primary/5" : ""
                          }`}
                        >
                          <Checkbox checked={selectedPageIds.includes(pg.id)} onCheckedChange={() => togglePage(pg.id)} />
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarImage src={pg.profilePicture ?? undefined} />
                            <AvatarFallback className="text-[10px]">{pg.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm flex-1 truncate">{pg.name}</span>
                          {pg.followersCount ? (
                            <span className="text-xs text-muted-foreground shrink-0">{pg.followersCount.toLocaleString()}</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  {selectedPageIds.length > 0 && (
                    <p className="text-xs text-primary font-medium">{selectedPageIds.length} page(s) selected</p>
                  )}
                </>
              )}
              <div className="flex justify-end pt-1">
                <Button
                  disabled={selectedPageIds.length === 0}
                  onClick={() => setStep("content")}
                  className="gap-2"
                >
                  Continue <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ========== STEP 3: Content Type ========== */}
        {step === "content" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">3</span>
                    Choose Content Type
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setStep("pages")} className="text-xs gap-1">
                    ← Back
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {CONTENT_TYPES.map(({ type, icon: Icon, label, desc, available }) => (
                    <div
                      key={type}
                      onClick={() => {
                        if (available) {
                          setContentType(type);
                          if (type !== "reel") {
                            setStep("upload");
                          }
                        }
                      }}
                      className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-all ${
                        available
                          ? "cursor-pointer hover:border-primary/60 hover:bg-primary/5 hover:shadow-sm"
                          : "opacity-50 cursor-not-allowed"
                      } ${contentType === type && available ? "border-primary bg-primary/8 shadow-sm" : ""}`}
                    >
                      {!available && (
                        <Badge className="absolute -top-2 right-2 text-[9px] px-1.5 py-0 h-4 bg-muted text-muted-foreground border">
                          Coming Soon
                        </Badge>
                      )}
                      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${
                        type === "video" ? "bg-violet-500/10" : type === "reel" ? "bg-pink-500/10" :
                        type === "image" ? "bg-blue-500/10" : "bg-green-500/10"
                      }`}>
                        <Icon className={`h-6 w-6 ${
                          type === "video" ? "text-violet-600" : type === "reel" ? "text-pink-600" :
                          type === "image" ? "text-blue-600" : "text-green-600"
                        }`} />
                      </div>
                      <p className="font-semibold text-sm">{label}</p>
                      <p className="text-xs text-muted-foreground leading-tight">{desc}</p>
                    </div>
                  ))}
                </div>

                {contentType === "reel" && (
                  <div className="pt-2 space-y-4">
                    <ReelCollaborationConfig
                      enabled={collabEnabled}
                      onToggleEnabled={setCollabEnabled}
                      selectedPageIds={selectedPageIds}
                      collaboratorPageIds={selectedCollabPageIds}
                      onToggleCollaborator={toggleCollabPage}
                      allConnectedPages={connectedFbPages}
                    />

                    <div className="flex justify-end">
                      <Button onClick={() => setStep("upload")} className="gap-2">
                        Continue to Upload <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ========== STEP 4: Upload ========== */}
        {step === "upload" && (
          <div className="space-y-4">
            {/* Step header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">4</span>
                <span className="font-semibold">
                  {contentType === "reel" ? "Reel" : "Video"} Upload —
                  <span className="text-muted-foreground font-normal text-sm ml-1">{selectedPageIds.length} page(s) selected</span>
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep("content")} className="text-xs gap-1">
                ← Back
              </Button>
            </div>

            {/* Upload mode tabs */}
            <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit">
              {([["single", "Single Upload", Upload], ["bulk", "Bulk Upload", Files]] as const).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  onClick={() => setUploadMode(mode)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    uploadMode === mode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="max-w-2xl">
              {uploadMode === "single" ? (
                <OriginalTitleToggle
                  id="single-use-original-title"
                  checked={singleUseOriginalVideoTitle}
                  onCheckedChange={handleSingleOriginalTitleToggle}
                />
              ) : (
                <OriginalTitleToggle
                  id="bulk-use-original-title"
                  checked={bulkUseOriginalVideoTitle}
                  onCheckedChange={handleBulkOriginalTitleToggle}
                />
              )}
            </div>

            {/* ---- SINGLE UPLOAD ---- */}
            {uploadMode === "single" && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Upload className="h-4 w-4 text-primary" />
                      Upload Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* File drop zone */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleSingleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                        dragOver ? "border-primary bg-primary/5" : "hover:border-primary/50 hover:bg-muted/30"
                      }`}
                    >
                      {singleFile ? (
                        <div className="flex items-center justify-center gap-2">
                          <Video className="h-5 w-5 text-primary" />
                          <span className="text-sm font-medium truncate max-w-[200px]">{singleFile.name}</span>
                          <span className="text-xs text-muted-foreground">({fmtBytes(singleFile.size)})</span>
                          <button
                            className="text-muted-foreground hover:text-destructive ml-1"
                            onClick={(e) => { e.stopPropagation(); selectSingleFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">Drop a video here or <span className="text-primary font-medium">browse</span></p>
                          <p className="text-xs text-muted-foreground mt-1">MP4, MOV, AVI, MKV, WebM · up to 500 MB</p>
                        </>
                      )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="video/*" className="hidden"
                      onChange={(e) => selectSingleFile(e.target.files?.[0] ?? null)} />

                    {/* URL alternative */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Or paste video URL</Label>
                      <Input placeholder="https://example.com/video.mp4" value={singleUrl}
                        onChange={(e) => setSingleUrl(e.target.value)} />
                    </div>

                    <Separator />

                    {/* Title */}
                    <div className="space-y-1.5">
                      <Label>Title <span className="text-destructive">*</span></Label>
                      <Input
                        placeholder="Enter title..."
                        value={singleTitle}
                          onChange={(e) => {
                            singleTitleManualRef.current = true;
                            setSingleTitleManuallyEdited(true);
                            setSingleTitle(e.target.value);
                          }}
                      />
                      {singleUseOriginalVideoTitle && singleTitleResolving && (
                        <p className="text-[10px] text-muted-foreground">Reading embedded/source title…</p>
                      )}
                      {singleUseOriginalVideoTitle && !singleTitleResolving && singleOriginalTitle && !singleTitleManuallyEdited && (
                        <p className="text-[10px] text-muted-foreground">Using original title: {singleOriginalTitle}</p>
                      )}
                    </div>

                    {/* Caption */}
                    <div className="space-y-1.5">
                      <Label>Caption <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                      <Textarea
                        rows={3}
                        placeholder="Write your caption..."
                        value={singleCaption}
                        onChange={(e) => {
                          singleCaptionManualRef.current = true;
                          setSingleCaptionManuallyEdited(true);
                          setSingleCaption(e.target.value);
                        }}
                      />
                    </div>

                    {/* Hashtags */}
                    <div className="space-y-1.5">
                      <Label>Hashtags <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                      <Input placeholder="#trending #video #facebook" value={singleHashtags}
                        onChange={(e) => setSingleHashtags(e.target.value)} />
                    </div>

                    {contentType === "reel" && (
                      <ReelCollaborationConfig
                        enabled={collabEnabled}
                        onToggleEnabled={setCollabEnabled}
                        selectedPageIds={selectedPageIds}
                        collaboratorPageIds={selectedCollabPageIds}
                        onToggleCollaborator={toggleCollabPage}
                        allConnectedPages={connectedFbPages}
                      />
                    )}

                    <Separator />

                    {/* Schedule */}
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />Schedule Date & Time
                        <span className="text-xs font-normal text-muted-foreground">(for scheduled posting)</span>
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="date" value={singleDate} min={new Date().toISOString().split("T")[0]}
                          onChange={(e) => setSingleDate(e.target.value)} />
                        <Input type="time" value={singleTime} onChange={(e) => setSingleTime(e.target.value)} />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5" />Timezone
                      </Label>
                      <Select value={singleTimezone} onValueChange={setSingleTimezone}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button variant="outline" disabled={singleUploading} onClick={() => submitSingle(false)}>
                        {singleUploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scheduling...</> : <><Calendar className="h-4 w-4 mr-2" />Schedule Later</>}
                      </Button>
                      <Button disabled={singleUploading} onClick={() => submitSingle(true)}>
                        {singleUploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Posting...</> : <><Zap className="h-4 w-4 mr-2" />Post Now</>}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Live preview */}
                <Card>
                  <CardContent className="pt-5">
                    <FacebookPostPreview
                      title={singleTitle}
                      caption={[singleCaption, singleHashtags].filter(Boolean).join("\n\n")}
                      videoFile={singleFile}
                      videoUrl={singleUrl}
                      pageName={previewPage?.name ?? "Your Page"}
                      pageAvatar={previewPage?.profilePicture ?? undefined}
                    />
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ---- BULK UPLOAD ---- */}
            {uploadMode === "bulk" && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Left: file queue */}
                <div className="xl:col-span-2 space-y-4">

                  {/* Drop zone */}
                  <Card>
                    <CardContent className="pt-4">
                      <div
                        onDragOver={(e) => { e.preventDefault(); setBulkDragOver(true); }}
                        onDragLeave={() => setBulkDragOver(false)}
                        onDrop={(e) => { e.preventDefault(); setBulkDragOver(false); addBulkFiles(e.dataTransfer.files); }}
                        onClick={() => bulkFileRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                          bulkDragOver ? "border-primary bg-primary/5" : "hover:border-primary/50 hover:bg-muted/30"
                        }`}
                      >
                        <Files className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm font-medium">Drop 150+ files here or <span className="text-primary">browse</span></p>
                        <p className="text-xs text-muted-foreground mt-1">MP4, MOV, AVI, MKV, WebM · up to 500 MB each</p>
                      </div>
                      <input ref={bulkFileRef} type="file" accept="video/*" multiple className="hidden"
                        onChange={(e) => { if (e.target.files) addBulkFiles(e.target.files); }} />
                      <div className="flex flex-col sm:flex-row gap-2 mt-3">
                        <Input
                          value={bulkSourceUrl}
                          onChange={(e) => setBulkSourceUrl(e.target.value)}
                          placeholder="Or add a source URL"
                          aria-label="Bulk source video URL"
                          className="text-xs"
                        />
                        <Button type="button" variant="outline" onClick={addBulkSourceUrl} disabled={!bulkSourceUrl.trim()}>
                          Add URL
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        URL titles come only from the existing source metadata extractor; if unavailable, the normal title flow is used.
                      </p>
                    </CardContent>
                  </Card>

                  {/* Progress stats */}
                  {bulkFiles.length > 0 && (
                    <Card>
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">Upload Progress</p>
                          {!bulkProcessing && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={clearBulkFiles}>
                              <Trash2 className="h-3 w-3" />Clear All
                            </Button>
                          )}
                        </div>
                        <Progress value={bulkProgress} className="h-2" />
                        <div className="grid grid-cols-4 gap-2 text-center text-xs">
                          <div className="rounded-lg bg-muted/40 p-2">
                            <p className="font-bold text-base">{bulkFiles.length}</p>
                            <p className="text-muted-foreground">Total</p>
                          </div>
                          <div className="rounded-lg bg-green-500/10 p-2">
                            <p className="font-bold text-base text-green-600">{bulkDone}</p>
                            <p className="text-muted-foreground">Done</p>
                          </div>
                          <div className="rounded-lg bg-primary/10 p-2">
                            <p className="font-bold text-base text-primary">{bulkRemaining + bulkUploading}</p>
                            <p className="text-muted-foreground">Remaining</p>
                          </div>
                          <div className="rounded-lg bg-destructive/10 p-2">
                            <p className="font-bold text-base text-destructive">{bulkFailed}</p>
                            <p className="text-muted-foreground">Failed</p>
                          </div>
                        </div>
                        {bulkProcessing && (
                          <Button variant="destructive" size="sm" className="w-full gap-2" onClick={stopBulkProcessing}>
                            <X className="h-4 w-4" />Stop Processing
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* File list */}
                  {bulkFiles.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Files ({bulkFiles.length})</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                          {bulkFiles.map((f, i) => (
                            <BulkFileCard
                              key={f.id}
                              f={f}
                              previewTitle={getBulkTitle(f, i, bulkConfig, bulkUseOriginalVideoTitle)}
                              previewCaption={getBulkCaption(f, bulkConfig, bulkUseOriginalVideoTitle)}
                              useOriginalTitle={bulkUseOriginalVideoTitle}
                              onRemove={() => removeBulkFile(f.id)}
                              onTitleChange={(value) => updateBulkFile(f.id, { titleOverride: value, titleManuallyEdited: true })}
                              onCaptionChange={(value) => updateBulkFile(f.id, { captionOverride: value, captionManuallyEdited: true })}
                            />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Right: scheduler config */}
                <div className="space-y-4">
                  {contentType === "reel" && (
                    <ReelCollaborationConfig
                      enabled={collabEnabled}
                      onToggleEnabled={setCollabEnabled}
                      selectedPageIds={selectedPageIds}
                      collaboratorPageIds={selectedCollabPageIds}
                      onToggleCollaborator={toggleCollabPage}
                      allConnectedPages={connectedFbPages}
                    />
                  )}

                  {/* Auto Scheduler */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <BarChart2 className="h-4 w-4 text-primary" />Auto Scheduler
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/30 text-center text-xs">
                        <div>
                          <p className="font-bold text-lg text-primary">{bulkFiles.length}</p>
                          <p className="text-muted-foreground">Files</p>
                        </div>
                        <div>
                          <p className="font-bold text-lg">{previewDays}</p>
                          <p className="text-muted-foreground">Days needed</p>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Posts Per Day</Label>
                        <Input
                          type="number" min={1} max={10}
                          value={bulkConfig.postsPerDay}
                          onChange={(e) => setBulkConfig((c) => ({ ...c, postsPerDay: Math.max(1, parseInt(e.target.value) || 1) }))}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Start Date</Label>
                        <Input type="date" value={bulkConfig.startDate} min={new Date().toISOString().split("T")[0]}
                          onChange={(e) => setBulkConfig((c) => ({ ...c, startDate: e.target.value }))} />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Timezone</Label>
                        <Select value={bulkConfig.timezone} onValueChange={(v) => setBulkConfig((c) => ({ ...c, timezone: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Posting Times */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />Posting Times
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex gap-2">
                        {(["auto", "manual"] as TimeSlotMode[]).map((m) => (
                          <button key={m} onClick={() => setBulkConfig((c) => ({ ...c, timeSlotMode: m }))}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              bulkConfig.timeSlotMode === m ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted"
                            }`}>
                            {m === "auto" ? "Auto Generate" : "Manual"}
                          </button>
                        ))}
                      </div>

                      <div className="space-y-1.5">
                        {bulkConfig.timeSlots.map((slot, i) => (
                          <TimeSlotRow key={i} value={slot}
                            onChange={(v) => { setBulkConfig((c) => ({ ...c, timeSlotMode: "manual" })); updateSlot(i, v); }}
                            onRemove={() => removeSlot(i)}
                          />
                        ))}
                        {bulkConfig.timeSlots.length < 10 && (
                          <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1"
                            onClick={() => { setBulkConfig((c) => ({ ...c, timeSlotMode: "manual" })); addSlot(); }}>
                            <Plus className="h-3 w-3" />Add Slot (max 10)
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Title & Hashtags */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />Title & Caption
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex gap-2">
                        {(["sequential", "same"] as TitleMode[]).map((m) => (
                          <button key={m} onClick={() => setBulkConfig((c) => ({ ...c, titleMode: m }))}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              bulkConfig.titleMode === m ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted"
                            }`}>
                            {m === "sequential" ? "Sequential #1 #2" : "Same for All"}
                          </button>
                        ))}
                      </div>

                      {bulkConfig.titleMode === "sequential" ? (
                        <div className="space-y-1">
                          <Label className="text-xs">Title Prefix</Label>
                          <Input className="h-8 text-xs" placeholder="Post" value={bulkConfig.sequentialPrefix}
                            onChange={(e) => setBulkConfig((c) => ({ ...c, sequentialPrefix: e.target.value }))} />
                          <p className="text-[10px] text-muted-foreground">Example: "{bulkConfig.sequentialPrefix || "Post"} #1", "{bulkConfig.sequentialPrefix || "Post"} #2"…</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Label className="text-xs">Default Title</Label>
                          <Input className="h-8 text-xs" placeholder="My Video" value={bulkConfig.defaultTitle}
                            onChange={(e) => setBulkConfig((c) => ({ ...c, defaultTitle: e.target.value }))} />
                        </div>
                      )}

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Default Caption</Label>
                          <div className="flex items-center gap-1.5">
                            <Checkbox checked={bulkConfig.applyCaption}
                              onCheckedChange={(v) => setBulkConfig((c) => ({ ...c, applyCaption: !!v }))} />
                            <span className="text-[10px] text-muted-foreground">Apply to all</span>
                          </div>
                        </div>
                        <Textarea rows={2} className="text-xs" placeholder="Caption for all posts..."
                          value={bulkConfig.defaultCaption}
                          onChange={(e) => setBulkConfig((c) => ({ ...c, defaultCaption: e.target.value }))} />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Default Hashtags</Label>
                          <div className="flex items-center gap-1.5">
                            <Checkbox checked={bulkConfig.applyHashtags}
                              onCheckedChange={(v) => setBulkConfig((c) => ({ ...c, applyHashtags: !!v }))} />
                            <span className="text-[10px] text-muted-foreground">Apply to all</span>
                          </div>
                        </div>
                        <Input className="h-8 text-xs" placeholder="#tag1 #tag2 #tag3"
                          value={bulkConfig.defaultHashtags}
                          onChange={(e) => setBulkConfig((c) => ({ ...c, defaultHashtags: e.target.value }))} />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Advanced Options */}
                  <Card>
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
                      onClick={() => setShowAdvanced((v) => !v)}
                    >
                      <span className="flex items-center gap-2">
                        <Settings className="h-4 w-4 text-primary" />Advanced Options
                      </span>
                      {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {showAdvanced && (
                      <CardContent className="pt-0 space-y-3 border-t">
                        <div className="flex items-center justify-between pt-3">
                          <div>
                            <p className="text-sm font-medium flex items-center gap-1.5">
                              <Shuffle className="h-3.5 w-3.5" />Shuffle Upload Order
                            </p>
                            <p className="text-xs text-muted-foreground">Randomize the order of uploaded files</p>
                          </div>
                          <Switch checked={bulkConfig.shuffleOrder}
                            onCheckedChange={(v) => setBulkConfig((c) => ({ ...c, shuffleOrder: v }))} />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium flex items-center gap-1.5">
                              <SkipForward className="h-3.5 w-3.5" />Skip Duplicates
                            </p>
                            <p className="text-xs text-muted-foreground">Skip files with the same name and size</p>
                          </div>
                          <Switch checked={bulkConfig.skipDuplicates}
                            onCheckedChange={(v) => setBulkConfig((c) => ({ ...c, skipDuplicates: v }))} />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium flex items-center gap-1.5">
                              <RefreshCw className="h-3.5 w-3.5" />Auto Retry on Failure
                            </p>
                          </div>
                          <Switch checked={bulkConfig.autoRetry}
                            onCheckedChange={(v) => setBulkConfig((c) => ({ ...c, autoRetry: v }))} />
                        </div>
                        {bulkConfig.autoRetry && (
                          <div className="space-y-1 pl-5">
                            <Label className="text-xs">Max Retries</Label>
                            <Input type="number" min={1} max={10} className="h-8 text-xs"
                              value={bulkConfig.maxRetries}
                              onChange={(e) => setBulkConfig((c) => ({ ...c, maxRetries: Math.max(1, parseInt(e.target.value) || 1) }))} />
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>

                  {/* Schedule Preview */}
                  {bulkFiles.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Schedule Preview</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {generateSchedule(Math.min(bulkFiles.length, 9), bulkConfig).map((dt, i) => (
                            <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                              <span className="text-muted-foreground truncate pr-2">
                                {getBulkTitle(bulkFiles[i]!, i, bulkConfig, bulkUseOriginalVideoTitle)}
                              </span>
                              <span className="font-medium">{new Date(dt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                          ))}
                          {bulkFiles.length > 9 && (
                            <p className="text-xs text-muted-foreground text-center pt-1">
                              + {bulkFiles.length - 9} more across {previewDays} day{previewDays !== 1 ? "s" : ""}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Start button */}
                  <Button
                    className="w-full gap-2"
                    size="lg"
                    disabled={bulkFiles.length === 0 || bulkProcessing || selectedPageIds.length === 0}
                    onClick={startBulkScheduling}
                  >
                    {bulkProcessing
                      ? <><Loader2 className="h-4 w-4 animate-spin" />Processing {bulkDone}/{bulkFiles.length}</>
                      : <><Calendar className="h-4 w-4" />Start Scheduling {bulkFiles.length > 0 ? `${bulkFiles.length} files` : ""}</>
                    }
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== SCHEDULE MANAGER ========== */}
        <ScheduleManagement
          videos={scheduledVideos}
          loading={loadingVideos}
          postingNow={postingNow}
          onPostNow={handlePostNow}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onUpdated={handleUpdated}
          getPageName={getPageName}
        />

      </div>
    </Layout>
  );
}
