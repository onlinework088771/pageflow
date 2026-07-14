import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Youtube, Users, Eye, ThumbsUp, MessageCircle, Video, ChevronRight,
  RefreshCw, AlertCircle, Star, ArrowDown, Calendar, FileText, BarChart2,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  ResponsiveContainer,
} from "recharts";
import { authFetch, apiUrl } from "@/components/schedule-management-utils";

// Phase 6 — YouTube Analytics.
// Independent of Facebook's analytics.tsx: talks only to /youtube-analytics,
// which reads live data from the YouTube Data API v3.

interface AnalyticsChannel {
  id: string;
  channelId: string;
  title: string;
  thumbnail: string | null;
  customUrl: string | null;
  subscriberCount: number;
  videoCount: number;
}

interface Video_ {
  id: string;
  title: string;
  thumbnail: string | null;
  publishedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  duration: string | null;
}

interface AnalyticsData {
  channel: { id: string; channelId: string; title: string; thumbnail: string | null; customUrl: string | null };
  summary: {
    subscriberCount: number; totalChannelViews: number; totalChannelVideos: number;
    recentVideosFetched: number; totalViews: number; totalLikes: number; totalComments: number;
    avgViews: number; publishedToday: number; publishedThisWeek: number; publishedThisMonth: number;
  };
  charts: { views: { date: string; value: number; title: string }[] };
  recentVideos: Video_[];
  bestVideo: Video_ | null;
  worstVideo: Video_ | null;
  fetchedAt: string;
  fromCache?: boolean;
}

type ViewMode = "channels" | "dashboard";

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n ?? 0);
}

function fmtDate(s: string): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  catch { return s; }
}

function fmtDateTime(s: string | null): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return s; }
}

function fmtDuration(iso: string | null): string {
  if (!iso) return "";
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!match) return "";
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function hasMetric(v: number | undefined | null): boolean {
  return typeof v === "number" && isFinite(v) && v > 0;
}

function isValidVideo(v: Video_ | null | undefined): boolean {
  return !!(v && v.id && (v.views > 0 || v.likes > 0 || v.comments > 0));
}

async function fetchChannels(): Promise<AnalyticsChannel[]> {
  const res = await authFetch(apiUrl("/youtube-analytics/channels"));
  if (!res.ok) throw new Error("Failed to load YouTube channels");
  return res.json();
}

function StatCard({ icon: Icon, label, value, color, sub }: { icon: React.ElementType; label: string; value: string; color: string; sub?: string }) {
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

function SmallStatCard({ icon: Icon, label, value, iconColor }: { icon: React.ElementType; label: string; value: string | number; iconColor: string }) {
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

function VideoCard({ video, label, icon: Icon, iconColor }: { video: Video_; label: string; icon: React.ElementType; iconColor: string }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className={`px-4 py-2 flex items-center gap-2 text-xs font-semibold ${iconColor} border-b`}>
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="p-4 space-y-3">
        {video.thumbnail && (
          <img src={video.thumbnail} alt="" className="w-full h-32 object-cover rounded-lg" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        )}
        <p className="text-sm line-clamp-2 text-foreground/90 font-medium">{video.title}</p>
        <p className="text-xs text-muted-foreground">{fmtDateTime(video.publishedAt)}</p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t">
          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmt(video.views)}</span>
          <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{fmt(video.likes)}</span>
          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{fmt(video.comments)}</span>
        </div>
      </div>
    </div>
  );
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const title = payload[0]?.payload?.title;
  return (
    <div className="bg-popover border rounded-xl shadow-xl p-3 text-sm max-w-[220px]">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {title && <p className="text-xs text-muted-foreground mb-1 line-clamp-2">{title}</p>}
      <p style={{ color: payload[0]?.color }} className="font-medium">
        Views: <span className="text-foreground">{fmt(payload[0].value)}</span>
      </p>
    </div>
  );
}

function PermissionErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-destructive" />
        <div>
          <p className="text-sm font-semibold text-destructive">Failed to Load Analytics</p>
          <p className="text-xs mt-1 text-destructive/80">{message}</p>
        </div>
      </div>
    </div>
  );
}

export default function YoutubeAnalytics() {
  const [view, setView] = useState<ViewMode>("channels");
  const [selectedChannel, setSelectedChannel] = useState<AnalyticsChannel | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const stableDataRef = useRef<AnalyticsData | null>(null);

  function goChannels() { setView("channels"); setSelectedChannel(null); stableDataRef.current = null; }
  function goDashboard(ch: AnalyticsChannel) { setSelectedChannel(ch); setView("dashboard"); stableDataRef.current = null; }

  const channelsQuery = useQuery({
    queryKey: ["youtube-analytics-channels"],
    queryFn: fetchChannels,
    staleTime: 60_000,
  });

  const analyticsQuery = useQuery({
    queryKey: ["youtube-analytics-dashboard", selectedChannel?.id, refreshKey],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/youtube-analytics/channels/${selectedChannel!.id}`));
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to load analytics" }));
        throw Object.assign(new Error(err.error || "Failed to load analytics"), { permissionError: err.permissionError });
      }
      return res.json() as Promise<AnalyticsData>;
    },
    enabled: !!selectedChannel && view === "dashboard",
    staleTime: 55_000,
    retry: false,
  });

  if (analyticsQuery.data) stableDataRef.current = analyticsQuery.data;
  const effectiveData = analyticsQuery.data ?? stableDataRef.current;
  const loading = analyticsQuery.isLoading && !effectiveData;
  const error = analyticsQuery.error as (Error & { permissionError?: boolean }) | null;
  const s = effectiveData?.summary;

  if (view === "channels") {
    const channels = channelsQuery.data ?? [];
    const loadingCh = channelsQuery.isLoading;

    return (
      <Layout>
        <div className="flex flex-col gap-6">
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                <Youtube className="h-7 w-7 text-red-500" />
                YouTube Analytics
              </h1>
              <p className="text-muted-foreground mt-1">Live channel and video stats from the YouTube Data API.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => channelsQuery.refetch()} disabled={loadingCh} className="gap-2">
              <RefreshCw className={`w-3.5 h-3.5 ${loadingCh ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {loadingCh ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
            </div>
          ) : channelsQuery.error ? (
            <PermissionErrorBanner message={(channelsQuery.error as Error).message} />
          ) : !channels.length ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="bg-primary/10 p-4 rounded-full mb-4">
                <BarChart2 className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-bold mb-1">No YouTube Channels Connected</h3>
              <p className="text-muted-foreground max-w-sm">Connect a Google account in YouTube Accounts to start viewing analytics.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {channels.map((ch) => (
                <Card key={ch.id} className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group" onClick={() => goDashboard(ch)}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <Avatar className="h-12 w-12 border shadow-sm flex-shrink-0">
                        <AvatarImage src={ch.thumbnail ?? undefined} />
                        <AvatarFallback className="bg-red-500/10 text-red-600 font-bold">
                          <Youtube className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{ch.title}</p>
                        {ch.customUrl && <p className="text-xs text-muted-foreground truncate">{ch.customUrl}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                      <div className="text-center p-2 rounded-lg bg-muted/40">
                        <p className="text-base font-bold text-primary">{fmt(ch.subscriberCount)}</p>
                        <p className="text-muted-foreground mt-0.5">Subscribers</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/40">
                        <p className="text-base font-bold">{fmt(ch.videoCount)}</p>
                        <p className="text-muted-foreground mt-0.5">Videos</p>
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

  // ---- Dashboard view ----

  const statCardDefs = s ? [
    { icon: Users, label: "Subscribers", value: s.subscriberCount, color: "bg-red-500", show: true },
    { icon: Eye, label: "Total Channel Views", value: s.totalChannelViews, color: "bg-violet-500", show: hasMetric(s.totalChannelViews) },
    { icon: Video, label: "Total Videos", value: s.totalChannelVideos, color: "bg-amber-500", show: hasMetric(s.totalChannelVideos) },
    { icon: Eye, label: "Views (Recent Uploads)", value: s.totalViews, color: "bg-cyan-500", show: hasMetric(s.totalViews), sub: `${s.recentVideosFetched} videos` },
    { icon: ThumbsUp, label: "Likes (Recent)", value: s.totalLikes, color: "bg-pink-500", show: hasMetric(s.totalLikes) },
    { icon: MessageCircle, label: "Comments (Recent)", value: s.totalComments, color: "bg-orange-500", show: hasMetric(s.totalComments) },
    { icon: BarChart2, label: "Avg Views / Video", value: s.avgViews, color: "bg-emerald-500", show: hasMetric(s.avgViews) },
  ] : [];
  const visibleStatCards = statCardDefs.filter((c) => c.show);

  const pubToday = s?.publishedToday ?? 0;
  const pubWeek = s?.publishedThisWeek ?? 0;
  const pubMonth = s?.publishedThisMonth ?? 0;
  const showPublishing = pubToday > 0 || pubWeek > 0 || pubMonth > 0;

  const viewsChart = effectiveData?.charts?.views ?? [];
  const hasChart = viewsChart.length > 0 && viewsChart.some((d) => d.value > 0);

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
          <button onClick={goChannels} className="hover:text-foreground font-medium transition-colors">Analytics</button>
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-foreground font-medium">{selectedChannel!.title}</span>
        </div>

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border shadow-sm flex-shrink-0">
              <AvatarImage src={effectiveData?.channel.thumbnail ?? selectedChannel!.thumbnail ?? undefined} />
              <AvatarFallback className="font-bold"><Youtube className="h-5 w-5 text-red-500" /></AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-bold leading-tight">{effectiveData?.channel.title ?? selectedChannel!.title}</h2>
              {effectiveData?.channel.customUrl && <p className="text-sm text-muted-foreground">{effectiveData.channel.customUrl}</p>}
              {effectiveData?.fromCache && <p className="text-[10px] text-muted-foreground">Cached · refreshes every 60s</p>}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)} disabled={analyticsQuery.isFetching} className="gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${analyticsQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error && !effectiveData && <PermissionErrorBanner message={error.message} />}
        {error && !!effectiveData && (
          <div className="flex items-center gap-2 p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-xs text-yellow-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Latest refresh failed — showing previous data. {error.message}
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-56 rounded-xl" />
          </div>
        )}

        {effectiveData && !loading && (
          <>
            {visibleStatCards.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {visibleStatCards.map((c) => (
                  <StatCard key={c.label} icon={c.icon} label={c.label} value={fmt(c.value)} sub={(c as any).sub} color={c.color} />
                ))}
              </div>
            )}

            {showPublishing && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Uploads</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {pubToday > 0 && <SmallStatCard icon={Calendar} label="Today" value={pubToday} iconColor="bg-green-500" />}
                  {pubWeek > 0 && <SmallStatCard icon={Calendar} label="This Week" value={pubWeek} iconColor="bg-blue-500" />}
                  {pubMonth > 0 && <SmallStatCard icon={Calendar} label="This Month" value={pubMonth} iconColor="bg-violet-500" />}
                </div>
              </div>
            )}

            {hasChart && (
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Views per Recent Upload</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={viewsChart}>
                      <defs>
                        <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#dc2626" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={fmt} tick={{ fontSize: 10 }} width={40} />
                      <RechartTooltip content={<ChartTip />} />
                      <Area type="monotone" dataKey="value" name="Views" stroke="#dc2626" fill="url(#gViews)" strokeWidth={2} dot={{ r: 3 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {(isValidVideo(effectiveData.bestVideo) || isValidVideo(effectiveData.worstVideo)) && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Video Performance</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {isValidVideo(effectiveData.bestVideo) && (
                    <VideoCard video={effectiveData.bestVideo!} label="Best Performing Video" icon={Star} iconColor="bg-yellow-500/10 text-yellow-600 border-yellow-500/20" />
                  )}
                  {isValidVideo(effectiveData.worstVideo) && effectiveData.worstVideo!.id !== effectiveData.bestVideo?.id && (
                    <VideoCard video={effectiveData.worstVideo!} label="Lowest Performing Video" icon={ArrowDown} iconColor="bg-slate-500/10 text-slate-600 border-slate-500/20" />
                  )}
                </div>
              </div>
            )}

            {effectiveData.recentVideos.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Recent Uploads ({effectiveData.recentVideos.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {effectiveData.recentVideos.map((video) => (
                      <div key={video.id} className="flex items-start gap-4 px-4 sm:px-6 py-4">
                        {video.thumbnail && (
                          <img src={video.thumbnail} alt="" className="w-20 h-14 rounded-lg object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">{fmtDateTime(video.publishedAt)}</span>
                            {video.duration && <Badge variant="outline" className="text-[10px] py-0 h-4">{fmtDuration(video.duration)}</Badge>}
                          </div>
                          <p className="text-sm line-clamp-2 text-foreground/90 font-medium">{video.title}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground flex-shrink-0">
                          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmt(video.views)}</span>
                          <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{fmt(video.likes)}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{fmt(video.comments)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {effectiveData.recentVideos.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="bg-primary/10 p-4 rounded-full mb-4">
                  <FileText className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-1">No Uploads Yet</h3>
                <p className="text-muted-foreground max-w-sm">Once this channel has published videos, their stats will show up here.</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center">
              Last fetched: {new Date(effectiveData.fetchedAt).toLocaleTimeString()} · Data from YouTube Data API v3
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
