import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart2, Users, Eye, ThumbsUp, TrendingUp, FileText,
  ChevronRight, RefreshCw, AlertCircle, Video, Heart,
  MessageCircle, Share2, Clock, Calendar, Star, ArrowDown,
  PlayCircle, Activity, Zap, Globe, BookOpen,
} from "lucide-react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  ResponsiveContainer,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalyticsAccount {
  id: string;
  fbUserId: string;
  name: string;
  email: string | null;
  profilePicture: string | null;
  status: string;
  pagesCount: number;
  connectedAt: string;
}

interface AnalyticsPage {
  id: string;
  fbPageId: string;
  name: string;
  category: string | null;
  profilePicture: string | null;
  followersCount: number;
  accountId: string;
  accountName: string;
}

interface Post {
  id: string;
  message: string;
  createdTime: string;
  likes: number;
  comments: number;
  shares: number;
  reactions: number;
  engagement: number;
  hasVideo: boolean;
  hasImage: boolean;
  thumbnail: string | null;
}

interface AnalyticsData {
  page: {
    id: string; fbPageId: string; name: string; category: string | null;
    profilePicture: string | null; fans: number; followers: number;
  };
  summary: {
    followers: number; fans: number; newFans: number; lostFans: number;
    impressions: number; organicImpressions: number; paidImpressions: number;
    reach: number; engagedUsers: number; engagement: number; pageViews: number;
    videoViews: number; watchTimeMinutes: number; reelViews: number;
    totalPosts: number; totalVideos: number; totalReels: number;
    publishedToday: number; publishedThisWeek: number; publishedThisMonth: number;
    totalReactions: number; totalComments: number; totalShares: number; totalLikes: number;
  };
  charts: {
    impressions: { date: string; value: number }[];
    reach: { date: string; value: number }[];
    engagement: { date: string; value: number }[];
    followers: { date: string; value: number }[];
    videoViews: { date: string; value: number }[];
    fanAdds: { date: string; value: number }[];
  };
  recentPosts: Post[];
  bestPost: Post | null;
  worstPost: Post | null;
  fetchedAt: string;
  fromCache?: boolean;
}

type ViewMode = "accounts" | "pages" | "dashboard";
type RangeOption = "today" | "yesterday" | "7" | "28" | "90" | "custom";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = `${BASE}/api`;

async function authFetch(url: string): Promise<Response> {
  const token = localStorage.getItem("pf_auth_token");
  return fetch(url, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n ?? 0);
}

function fmtDate(s: string): string {
  try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  catch { return s; }
}

function fmtDateTime(s: string): string {
  try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return s; }
}

function buildQueryString(option: RangeOption, customFrom: string, customTo: string): string {
  if (option === "custom" && customFrom && customTo) {
    const since = Math.floor(new Date(customFrom).getTime() / 1000);
    const until = Math.floor(new Date(customTo + "T23:59:59").getTime() / 1000);
    return `since=${since}&until=${until}`;
  }
  return `range=${option}`;
}

const RANGE_LABELS: Record<RangeOption, string> = {
  today: "Today", yesterday: "Yesterday",
  "7": "7 Days", "28": "28 Days", "90": "90 Days", custom: "Custom",
};

/** True only when array has at least one point with a value > 0 */
function hasChartData(arr: { date: string; value: number }[] | undefined | null): boolean {
  return !!(arr && arr.length > 0 && arr.some((d) => d.value > 0));
}

/** True when a numeric metric is a positive number */
function hasMetric(v: number | undefined | null): boolean {
  return typeof v === "number" && isFinite(v) && v > 0;
}

/** True when a post is valid and has engagement data */
function isValidPost(p: Post | null | undefined): boolean {
  return !!(p && p.id && (p.engagement > 0 || p.reactions > 0 || p.comments > 0 || p.shares > 0 || p.message));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border rounded-xl shadow-xl p-3 text-sm min-w-[130px]">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: <span className="text-foreground">{fmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType; label: string; value: string;
  sub?: string; color: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{label}</p>
            <p className="text-2xl font-bold tracking-tight mt-0.5">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SmallStatCard({
  icon: Icon, label, value, iconColor,
}: {
  icon: React.ElementType; label: string; value: string | number; iconColor: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColor}`}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-bold text-sm">{value}</p>
      </div>
    </div>
  );
}

function PostCard({ post, label, icon: Icon, iconColor }: { post: Post; label: string; icon: React.ElementType; iconColor: string }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className={`px-4 py-2 flex items-center gap-2 text-xs font-semibold ${iconColor} border-b`}>
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="p-4 space-y-3">
        {post.thumbnail && (
          <img src={post.thumbnail} alt="" className="w-full h-32 object-cover rounded-lg" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        )}
        <p className="text-sm line-clamp-3 text-foreground/90">
          {post.message || <span className="italic text-muted-foreground">No text</span>}
        </p>
        <p className="text-xs text-muted-foreground">{fmtDateTime(post.createdTime)}</p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t">
          <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{fmt(post.reactions)}</span>
          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{fmt(post.comments)}</span>
          <span className="flex items-center gap-1"><Share2 className="w-3 h-3" />{fmt(post.shares)}</span>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Breadcrumb({ account, page, onAccount, onPage }: {
  account?: AnalyticsAccount | null; page?: AnalyticsPage | null;
  onAccount: () => void; onPage: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
      <button onClick={onAccount} className="hover:text-foreground font-medium transition-colors">Analytics</button>
      {account && (
        <>
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
          <button
            onClick={page ? onPage : undefined}
            className={`font-medium transition-colors ${page ? "hover:text-foreground" : "text-foreground cursor-default"}`}
          >
            {account.name}
          </button>
        </>
      )}
      {page && (
        <>
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-foreground font-medium">{page.name}</span>
        </>
      )}
    </div>
  );
}

function PermissionErrorBanner({ message }: { message: string }) {
  const isPermError = message.includes("permission") || message.includes("(#10)") || message.includes("pages_read_engagement");
  return (
    <div className={`flex flex-col gap-3 p-4 rounded-xl border ${isPermError ? "border-yellow-500/30 bg-yellow-500/5" : "border-destructive/30 bg-destructive/5"}`}>
      <div className="flex items-start gap-3">
        <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isPermError ? "text-yellow-600" : "text-destructive"}`} />
        <div>
          <p className={`text-sm font-semibold ${isPermError ? "text-yellow-700" : "text-destructive"}`}>
            {isPermError ? "Missing Facebook Permission" : "Failed to Load Analytics"}
          </p>
          <p className={`text-xs mt-1 ${isPermError ? "text-yellow-600" : "text-destructive/80"}`}>
            {isPermError
              ? `${message} — Go to FB Accounts and click "Reconnect Facebook Account" to grant all required permissions.`
              : message}
          </p>
        </div>
      </div>
      {isPermError && (
        <a
          href={`${BASE}/accounts`}
          className="inline-flex items-center gap-1.5 text-xs font-medium h-8 px-3 rounded-md bg-yellow-500 hover:bg-yellow-600 text-white transition-colors w-fit"
        >
          Go to FB Accounts → Reconnect
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function Analytics() {
  const { toast } = useToast();

  // Navigation state
  const [view, setView]                       = useState<ViewMode>("accounts");
  const [selectedAccount, setSelectedAccount] = useState<AnalyticsAccount | null>(null);
  const [selectedPage, setSelectedPage]       = useState<AnalyticsPage | null>(null);

  // Date range state
  const [rangeOption, setRangeOption] = useState<RangeOption>("7");
  const [customFrom, setCustomFrom]   = useState("");
  const [customTo, setCustomTo]       = useState("");
  const [showCustom, setShowCustom]   = useState(false);

  // Refresh key
  const [refreshKey, setRefreshKey] = useState(0);

  // Stable data: persists last successful fetch — never replaced with null
  const stableDataRef = useRef<AnalyticsData | null>(null);

  function goAccounts() { setView("accounts"); setSelectedAccount(null); setSelectedPage(null); stableDataRef.current = null; }
  function goPages(acc: AnalyticsAccount) { setSelectedAccount(acc); setView("pages"); setSelectedPage(null); stableDataRef.current = null; }
  function goDashboard(pg: AnalyticsPage) { setSelectedPage(pg); setView("dashboard"); stableDataRef.current = null; }

  function handleRangeChange(opt: RangeOption) {
    setRangeOption(opt);
    setShowCustom(opt === "custom");
  }

  // ---------------------------------------------------------------------------
  // Data queries
  // ---------------------------------------------------------------------------

  const accountsQuery = useQuery({
    queryKey: ["analytics-accounts"],
    queryFn: async () => {
      const res = await authFetch(`${API}/analytics/accounts`);
      if (!res.ok) throw new Error("Failed to load accounts");
      return res.json() as Promise<AnalyticsAccount[]>;
    },
    staleTime: 60_000,
  });

  const pagesQuery = useQuery({
    queryKey: ["analytics-pages", selectedAccount?.id],
    queryFn: async () => {
      const res = await authFetch(`${API}/analytics/accounts/${selectedAccount!.id}/pages`);
      if (!res.ok) throw new Error("Failed to load pages");
      return res.json() as Promise<AnalyticsPage[]>;
    },
    enabled: !!selectedAccount,
    staleTime: 60_000,
  });

  const analyticsQueryKey = [
    "analytics-dashboard", selectedPage?.id, rangeOption,
    rangeOption === "custom" ? customFrom : "",
    rangeOption === "custom" ? customTo : "",
    refreshKey,
  ];

  const analyticsQuery = useQuery({
    queryKey: analyticsQueryKey,
    queryFn: async () => {
      const qs = buildQueryString(rangeOption, customFrom, customTo);
      const res = await authFetch(`${API}/analytics/pages/${selectedPage!.id}?${qs}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to load analytics" }));
        throw Object.assign(new Error(err.error || "Failed to load analytics"), { permissionError: err.permissionError });
      }
      return res.json() as Promise<AnalyticsData>;
    },
    enabled: !!selectedPage && view === "dashboard",
    staleTime: 55_000,
    retry: false,
  });

  // Update stable ref whenever a successful response arrives — never clear it with null/undefined
  if (analyticsQuery.data) {
    stableDataRef.current = analyticsQuery.data;
  }

  // effectiveData: fresh data if available, otherwise last good data
  // This prevents content from disappearing during background refetches
  const effectiveData = analyticsQuery.data ?? stableDataRef.current;

  const loading = analyticsQuery.isLoading && !effectiveData;   // only "hard" loading (no previous data)
  const refetching = analyticsQuery.isFetching && !!effectiveData; // soft refetch with existing data
  const error = analyticsQuery.error as (Error & { permissionError?: boolean }) | null;

  const s = effectiveData?.summary;

  // ---------------------------------------------------------------------------
  // Render: Accounts view
  // ---------------------------------------------------------------------------

  if (view === "accounts") {
    const accounts = accountsQuery.data ?? [];
    const loadingAcc = accountsQuery.isLoading;

    return (
      <Layout>
        <div className="flex flex-col gap-6">
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
              <p className="text-muted-foreground mt-1">Real-time Facebook insights from the Graph API.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => accountsQuery.refetch()} disabled={loadingAcc} className="gap-2">
              <RefreshCw className={`w-3.5 h-3.5 ${loadingAcc ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {loadingAcc ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
            </div>
          ) : accountsQuery.error ? (
            <PermissionErrorBanner message={(accountsQuery.error as Error).message} />
          ) : !accounts.length ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="bg-primary/10 p-4 rounded-full mb-4">
                <BarChart2 className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-bold mb-1">No Facebook Accounts Connected</h3>
              <p className="text-muted-foreground max-w-sm">Connect a Facebook account in FB Accounts to start viewing analytics.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map((acc) => (
                <Card
                  key={acc.id}
                  className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
                  onClick={() => goPages(acc)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <Avatar className="h-12 w-12 border shadow-sm flex-shrink-0">
                        <AvatarImage src={acc.profilePicture ?? undefined} />
                        <AvatarFallback className="bg-blue-500/10 text-blue-600 font-bold">
                          {acc.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{acc.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{acc.email ?? "No email"}</p>
                        <Badge className="mt-1 text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">
                          {acc.pagesCount} page{acc.pagesCount !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t">
                      <span className="text-xs text-muted-foreground">Click to view pages</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Layout>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Pages view
  // ---------------------------------------------------------------------------

  if (view === "pages") {
    const pages = pagesQuery.data ?? [];
    const loadingPg = pagesQuery.isLoading;

    return (
      <Layout>
        <div className="flex flex-col gap-6">
          <Breadcrumb account={selectedAccount} onAccount={goAccounts} onPage={() => {}} />

          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{selectedAccount!.name}</h2>
              <p className="text-muted-foreground mt-0.5">Select a page to view its live analytics.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => pagesQuery.refetch()} disabled={loadingPg} className="gap-2">
              <RefreshCw className={`w-3.5 h-3.5 ${loadingPg ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {loadingPg ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
            </div>
          ) : pagesQuery.error ? (
            <PermissionErrorBanner message={(pagesQuery.error as Error).message} />
          ) : !pages.length ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="bg-primary/10 p-4 rounded-full mb-4">
                <Users className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-bold mb-1">No Pages Found</h3>
              <p className="text-muted-foreground max-w-sm">Sync pages for this account from FB Accounts → Sync Pages.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pages.map((pg) => (
                <Card
                  key={pg.id}
                  className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
                  onClick={() => goDashboard(pg)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3 mb-4">
                      <Avatar className="h-12 w-12 border shadow-sm flex-shrink-0">
                        <AvatarImage src={pg.profilePicture ?? undefined} />
                        <AvatarFallback className="font-bold">{pg.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-tight line-clamp-1">{pg.name}</p>
                        {pg.category && <p className="text-xs text-muted-foreground mt-0.5">{pg.category}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                      <div className="text-center p-2 rounded-lg bg-muted/40">
                        <p className="text-base font-bold text-primary">{fmt(pg.followersCount)}</p>
                        <p className="text-muted-foreground mt-0.5">Followers</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/40">
                        <p className="text-base font-bold">{pg.fbPageId}</p>
                        <p className="text-muted-foreground mt-0.5 truncate text-[10px]">Page ID</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <BarChart2 className="w-3 h-3" />View Analytics
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Layout>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Dashboard view — range selector (inline, not a nested function)
  // ---------------------------------------------------------------------------

  const rangeSelector = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {(["today", "yesterday", "7", "28", "90", "custom"] as RangeOption[]).map((opt) => (
          <button
            key={opt}
            onClick={() => handleRangeChange(opt)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              rangeOption === opt
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {RANGE_LABELS[opt]}
          </button>
        ))}
      </div>
      {showCustom && (
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 text-xs w-36" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 text-xs w-36" />
          <Button size="sm" className="h-8 text-xs" disabled={!customFrom || !customTo} onClick={() => setRefreshKey((k) => k + 1)}>
            Apply
          </Button>
        </div>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Stat cards — built as an array, filtered to only non-zero values
  // ---------------------------------------------------------------------------

  const statCardDefs = s ? [
    { icon: Users,         label: "Followers",     value: s.followers,         color: "bg-blue-500",    show: hasMetric(s.followers) },
    { icon: Heart,         label: "Page Fans",      value: s.fans,              color: "bg-pink-500",    show: hasMetric(s.fans) },
    { icon: TrendingUp,    label: "New Fans",       value: s.newFans,           color: "bg-emerald-500", show: hasMetric(s.newFans),    sub: s.lostFans > 0 ? `-${fmt(s.lostFans)} lost` : undefined },
    { icon: Eye,           label: "Impressions",    value: s.impressions,       color: "bg-violet-500",  show: hasMetric(s.impressions), sub: s.organicImpressions > 0 ? `${fmt(s.organicImpressions)} organic` : undefined },
    { icon: Globe,         label: "Unique Reach",   value: s.reach,             color: "bg-cyan-500",    show: hasMetric(s.reach) },
    { icon: Activity,      label: "Engagement",     value: s.engagement,        color: "bg-orange-500",  show: hasMetric(s.engagement) },
    { icon: Users,         label: "Engaged Users",  value: s.engagedUsers,      color: "bg-indigo-500",  show: hasMetric(s.engagedUsers) },
    { icon: BookOpen,      label: "Page Views",     value: s.pageViews,         color: "bg-slate-500",   show: hasMetric(s.pageViews) },
    { icon: Video,         label: "Video Views",    value: s.videoViews,        color: "bg-purple-500",  show: hasMetric(s.videoViews) },
    { icon: PlayCircle,    label: "Reel Views",     value: s.reelViews,         color: "bg-fuchsia-500", show: hasMetric(s.reelViews) },
    { icon: Clock,         label: "Watch Time",     value: s.watchTimeMinutes,  color: "bg-teal-500",    show: hasMetric(s.watchTimeMinutes), fmtFn: (v: number) => `${fmt(v)}m` },
    { icon: Zap,           label: "Reactions",      value: s.totalReactions,    color: "bg-yellow-500",  show: hasMetric(s.totalReactions) },
    { icon: MessageCircle, label: "Comments",       value: s.totalComments,     color: "bg-rose-500",    show: hasMetric(s.totalComments) },
    { icon: Share2,        label: "Shares",         value: s.totalShares,       color: "bg-sky-500",     show: hasMetric(s.totalShares) },
    { icon: FileText,      label: "Total Posts",    value: s.totalPosts,        color: "bg-gray-500",    show: hasMetric(s.totalPosts) },
    {
      icon: Video, label: "Total Videos", value: s.totalVideos, color: "bg-amber-500",
      show: hasMetric(s.totalVideos) || hasMetric(s.totalReels),
      fmtFn: (_: number) => `${fmt(s.totalVideos)} · ${fmt(s.totalReels)} reels`,
    },
  ] : [];

  const visibleStatCards = statCardDefs.filter((c) => c.show);

  // Publishing counts — only show rows with at least one non-zero value
  const pubToday = s?.publishedToday ?? 0;
  const pubWeek  = s?.publishedThisWeek ?? 0;
  const pubMonth = s?.publishedThisMonth ?? 0;
  const pubTotal = s?.totalPosts ?? 0;
  const showPublishing = pubToday > 0 || pubWeek > 0 || pubMonth > 0 || pubTotal > 0;

  // ---------------------------------------------------------------------------
  // Chart definitions — only rendered if they have actual data
  // ---------------------------------------------------------------------------

  const charts = effectiveData?.charts;

  // ---------------------------------------------------------------------------
  // Dashboard render
  // ---------------------------------------------------------------------------

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <Breadcrumb account={selectedAccount} page={selectedPage} onAccount={goAccounts} onPage={() => setView("pages")} />

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border shadow-sm flex-shrink-0">
              <AvatarImage src={selectedPage!.profilePicture ?? undefined} />
              <AvatarFallback className="font-bold">{selectedPage!.name.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-bold leading-tight">{selectedPage!.name}</h2>
              {selectedPage!.category && <p className="text-sm text-muted-foreground">{selectedPage!.category}</p>}
              {effectiveData?.fromCache && <p className="text-[10px] text-muted-foreground">Cached · refreshes every 60s</p>}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={analyticsQuery.isFetching}
            className="gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${analyticsQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Range selector */}
        {rangeSelector}

        {/* Permission / generic error — only when no data at all */}
        {error && !effectiveData && (
          <PermissionErrorBanner message={error.message} />
        )}

        {/* Soft refetch error banner — data exists but latest fetch failed */}
        {error && !!effectiveData && (
          <div className="flex items-center gap-2 p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-xs text-yellow-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Latest refresh failed — showing previous data. {error.message}
          </div>
        )}

        {/* Hard loading skeleton — only when no previous data exists */}
        {loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
            </div>
          </div>
        )}

        {/* Dashboard content — rendered whenever effectiveData exists, including during soft refetch */}
        {effectiveData && !loading && (
          <>
            {/* ── Primary stat cards — only rendered if value > 0 ── */}
            {visibleStatCards.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {visibleStatCards.map((c) => (
                  <StatCard
                    key={c.label}
                    icon={c.icon}
                    label={c.label}
                    value={c.fmtFn ? c.fmtFn(c.value) : fmt(c.value)}
                    sub={c.sub}
                    color={c.color}
                  />
                ))}
              </div>
            )}

            {/* ── Publishing counts — only if any non-zero ── */}
            {showPublishing && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Posts Published</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {pubToday > 0  && <SmallStatCard icon={Calendar}  label="Today"        value={pubToday}  iconColor="bg-green-500" />}
                  {pubWeek  > 0  && <SmallStatCard icon={Calendar}  label="This Week"    value={pubWeek}   iconColor="bg-blue-500" />}
                  {pubMonth > 0  && <SmallStatCard icon={Calendar}  label="This Month"   value={pubMonth}  iconColor="bg-violet-500" />}
                  {pubTotal > 0  && <SmallStatCard icon={FileText}   label="Total Fetched" value={pubTotal} iconColor="bg-slate-500" />}
                </div>
              </div>
            )}

            {/* ── Charts — each card only rendered when it has actual non-zero data ── */}
            {(hasChartData(charts?.impressions) || hasChartData(charts?.reach) ||
              hasChartData(charts?.engagement)  || hasChartData(charts?.followers) ||
              hasChartData(charts?.videoViews)  || hasChartData(charts?.fanAdds)) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {hasChartData(charts?.impressions) && (
                  <ChartCard title="Impressions">
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={charts!.impressions}>
                        <defs>
                          <linearGradient id="gImp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={fmt} tick={{ fontSize: 10 }} width={40} />
                        <RechartTooltip content={<ChartTip />} />
                        <Area type="monotone" dataKey="value" name="Impressions" stroke="#7c3aed" fill="url(#gImp)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}

                {hasChartData(charts?.reach) && (
                  <ChartCard title="Unique Reach">
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={charts!.reach}>
                        <defs>
                          <linearGradient id="gReach" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={fmt} tick={{ fontSize: 10 }} width={40} />
                        <RechartTooltip content={<ChartTip />} />
                        <Area type="monotone" dataKey="value" name="Reach" stroke="#06b6d4" fill="url(#gReach)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}

                {hasChartData(charts?.engagement) && (
                  <ChartCard title="Post Engagement">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={charts!.engagement}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={fmt} tick={{ fontSize: 10 }} width={40} />
                        <RechartTooltip content={<ChartTip />} />
                        <Bar dataKey="value" name="Engagement" fill="#f97316" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}

                {hasChartData(charts?.followers) && (
                  <ChartCard title="Followers (Page Fans)">
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={charts!.followers}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={fmt} tick={{ fontSize: 10 }} width={45} />
                        <RechartTooltip content={<ChartTip />} />
                        <Line type="monotone" dataKey="value" name="Followers" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}

                {hasChartData(charts?.videoViews) && (
                  <ChartCard title="Video Views">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={charts!.videoViews}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={fmt} tick={{ fontSize: 10 }} width={40} />
                        <RechartTooltip content={<ChartTip />} />
                        <Bar dataKey="value" name="Video Views" fill="#a855f7" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}

                {hasChartData(charts?.fanAdds) && (
                  <ChartCard title="New Fans per Day">
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={charts!.fanAdds}>
                        <defs>
                          <linearGradient id="gFans" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={fmt} tick={{ fontSize: 10 }} width={40} />
                        <RechartTooltip content={<ChartTip />} />
                        <Area type="monotone" dataKey="value" name="New Fans" stroke="#10b981" fill="url(#gFans)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
              </div>
            )}

            {/* ── Best & Worst performing posts
                  Only rendered when: post exists AND has engagement/reactions/comments/shares
                  Best and worst are treated independently
            ── */}
            {(isValidPost(effectiveData.bestPost) || isValidPost(effectiveData.worstPost)) && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Post Performance</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {isValidPost(effectiveData.bestPost) && (
                    <PostCard
                      post={effectiveData.bestPost!}
                      label="Best Performing Post"
                      icon={Star}
                      iconColor="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                    />
                  )}
                  {isValidPost(effectiveData.worstPost) && effectiveData.worstPost!.id !== effectiveData.bestPost?.id && (
                    <PostCard
                      post={effectiveData.worstPost!}
                      label="Lowest Performing Post"
                      icon={ArrowDown}
                      iconColor="bg-slate-500/10 text-slate-600 border-slate-500/20"
                    />
                  )}
                </div>
              </div>
            )}

            {/* ── Latest posts
                  Independent of Insights API — always rendered when recentPosts exists.
                  Thumbnails show on both mobile and desktop.
            ── */}
            {effectiveData.recentPosts.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Latest Posts ({effectiveData.recentPosts.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {effectiveData.recentPosts.map((post) => (
                      <div key={post.id} className="flex items-start gap-4 px-4 sm:px-6 py-4">
                        {post.thumbnail && (
                          <img
                            src={post.thumbnail}
                            alt=""
                            className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">{fmtDateTime(post.createdTime)}</span>
                            {post.hasVideo && <Badge variant="outline" className="text-[10px] py-0 h-4">Video</Badge>}
                            {post.hasImage && !post.hasVideo && <Badge variant="outline" className="text-[10px] py-0 h-4">Image</Badge>}
                          </div>
                          <p className="text-sm line-clamp-2 text-foreground/90">
                            {post.message || <span className="italic text-muted-foreground">No text</span>}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground flex-shrink-0">
                          <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{fmt(post.reactions)}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{fmt(post.comments)}</span>
                          <span className="flex items-center gap-1"><Share2 className="w-3 h-3" />{fmt(post.shares)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <p className="text-xs text-muted-foreground text-center">
              Last fetched: {new Date(effectiveData.fetchedAt).toLocaleTimeString()} · Data from Facebook Graph API v19.0
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
