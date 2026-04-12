import { useState, useCallback } from "react";
import { Layout } from "@/components/layout";
import { BarChart2, Users, Eye, ThumbsUp, TrendingUp, FileText, ArrowLeft, RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

interface AnalyticsPage {
  id: string;
  fbPageId: string;
  name: string;
  category?: string;
  profilePicture?: string;
  followersCount: number;
  accountId: string;
  accountName: string;
  accountPicture?: string;
}

interface AnalyticsData {
  page: {
    id: string;
    fbPageId: string;
    name: string;
    category?: string;
    profilePicture?: string;
    followersCount: number;
  };
  summary: {
    followers: number;
    totalImpressions: number;
    uniqueReach: number;
    engagedUsers: number;
    totalEngagement: number;
    pageViews: number;
    postsCount: number;
  };
  charts: {
    impressions: { date: string; value: number }[];
    uniqueReach: { date: string; value: number }[];
    engagement: { date: string; value: number }[];
    followers: { date: string; value: number }[];
  };
  recentPosts: {
    id: string;
    message: string;
    createdTime: string;
    likes: number;
    comments: number;
    shares: number;
    hasVideo: boolean;
  }[];
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatCard({
  icon: Icon, label, value, color, loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  loading?: boolean;
}) {
  return (
    <Card className="border-0 shadow-sm bg-card/80 backdrop-blur">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-24 mt-1" />
            ) : (
              <p className="text-2xl font-bold tracking-tight">{value}</p>
            )}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border rounded-xl shadow-xl p-3 text-sm min-w-[120px]">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: <span className="text-foreground">{formatNumber(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export default function Analytics() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [pages, setPages] = useState<AnalyticsPage[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [pagesLoaded, setPagesLoaded] = useState(false);
  const [selectedPage, setSelectedPage] = useState<AnalyticsPage | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [range, setRange] = useState("7");

  const loadPages = useCallback(async () => {
    setLoadingPages(true);
    try {
      const res = await fetch(apiUrl("/analytics/pages"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load pages");
      const data = await res.json();
      setPages(data);
      setPagesLoaded(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingPages(false);
    }
  }, [token, toast]);

  const loadAnalytics = useCallback(async (page: AnalyticsPage, days: string) => {
    setLoadingAnalytics(true);
    setAnalytics(null);
    try {
      const res = await fetch(apiUrl(`/analytics/pages/${page.id}?range=${days}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load analytics");
      }
      const data = await res.json();
      setAnalytics(data);
    } catch (err: any) {
      toast({ title: "Analytics Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingAnalytics(false);
    }
  }, [token, toast]);

  function handleSelectPage(page: AnalyticsPage) {
    setSelectedPage(page);
    loadAnalytics(page, range);
  }

  function handleRangeChange(newRange: string) {
    setRange(newRange);
    if (selectedPage) loadAnalytics(selectedPage, newRange);
  }

  const groupedPages = pages.reduce((acc, p) => {
    const key = p.accountId;
    if (!acc[key]) acc[key] = { accountName: p.accountName, accountPicture: p.accountPicture, pages: [] };
    acc[key].pages.push(p);
    return acc;
  }, {} as Record<string, { accountName: string; accountPicture?: string; pages: AnalyticsPage[] }>);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <AnimatePresence mode="wait">
          {selectedPage && analytics ? (
            <motion.div
              key="detail"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
            >
              {/* Analytics Detail View */}
              <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPage(null)} className="gap-1">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </Button>
                  {selectedPage.profilePicture ? (
                    <img src={selectedPage.profilePicture} alt="" className="w-9 h-9 rounded-xl object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <BarChart2 className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div>
                    <h1 className="text-xl font-bold">{selectedPage.name}</h1>
                    {selectedPage.category && (
                      <p className="text-xs text-muted-foreground">{selectedPage.category}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg overflow-hidden border">
                    {["7", "30"].map((d) => (
                      <button
                        key={d}
                        onClick={() => handleRangeChange(d)}
                        className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                          range === d
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadAnalytics(selectedPage, range)}
                    disabled={loadingAnalytics}
                    className="gap-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingAnalytics ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </div>

              {loadingAnalytics ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-2xl" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <StatCard icon={Users} label="Followers" value={formatNumber(analytics.summary.followers)} color="bg-blue-500" />
                    <StatCard icon={Eye} label={`Impressions (${range}d)`} value={formatNumber(analytics.summary.totalImpressions)} color="bg-violet-500" />
                    <StatCard icon={TrendingUp} label={`Unique Reach (${range}d)`} value={formatNumber(analytics.summary.uniqueReach)} color="bg-emerald-500" />
                    <StatCard icon={ThumbsUp} label={`Engagement (${range}d)`} value={formatNumber(analytics.summary.totalEngagement)} color="bg-orange-500" />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-pink-100 dark:bg-pink-950 flex items-center justify-center">
                          <Users className="w-4 h-4 text-pink-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Engaged Users</p>
                          <p className="text-lg font-bold">{formatNumber(analytics.summary.engagedUsers)}</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-cyan-100 dark:bg-cyan-950 flex items-center justify-center">
                          <Eye className="w-4 h-4 text-cyan-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Page Views</p>
                          <p className="text-lg font-bold">{formatNumber(analytics.summary.pageViews)}</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Recent Posts</p>
                          <p className="text-lg font-bold">{analytics.summary.postsCount}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                    <Card className="border-0 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                          Impressions — Last {range} Days
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {analytics.charts.impressions.length ? (
                          <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={analytics.charts.impressions}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                              <YAxis tickFormatter={formatNumber} tick={{ fontSize: 11 }} width={45} />
                              <Tooltip content={<ChartTooltip />} />
                              <Line type="monotone" dataKey="value" name="Impressions" stroke="#7c3aed" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data for this period</div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-0 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                          Engagement — Last {range} Days
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {analytics.charts.engagement.length ? (
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={analytics.charts.engagement}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                              <YAxis tickFormatter={formatNumber} tick={{ fontSize: 11 }} width={45} />
                              <Tooltip content={<ChartTooltip />} />
                              <Bar dataKey="value" name="Engagement" fill="#f97316" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data for this period</div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-0 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                          Unique Reach — Last {range} Days
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {analytics.charts.uniqueReach.length ? (
                          <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={analytics.charts.uniqueReach}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                              <YAxis tickFormatter={formatNumber} tick={{ fontSize: 11 }} width={45} />
                              <Tooltip content={<ChartTooltip />} />
                              <Line type="monotone" dataKey="value" name="Unique Reach" stroke="#10b981" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data for this period</div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-0 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                          Followers Growth — Last {range} Days
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {analytics.charts.followers.length ? (
                          <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={analytics.charts.followers}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                              <YAxis tickFormatter={formatNumber} tick={{ fontSize: 11 }} width={50} />
                              <Tooltip content={<ChartTooltip />} />
                              <Line type="monotone" dataKey="value" name="Followers" stroke="#3b82f6" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data for this period</div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {analytics.recentPosts.length > 0 && (
                    <Card className="border-0 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                          Recent Posts
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {analytics.recentPosts.map((post) => (
                            <div key={post.id} className="flex items-start justify-between gap-4 py-3 border-b last:border-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm line-clamp-2 text-foreground/90">
                                  {post.message || <span className="text-muted-foreground italic">No text</span>}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(post.createdTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                  {post.hasVideo && <Badge variant="outline" className="ml-2 text-[10px] py-0">Video</Badge>}
                                </p>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                                <span title="Likes">👍 {post.likes}</span>
                                <span title="Comments">💬 {post.comments}</span>
                                <span title="Shares">↗ {post.shares}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
            >
              {/* Page Selection View */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
                  <p className="text-sm text-muted-foreground mt-0.5">Real-time Facebook page insights from the Graph API</p>
                </div>
                <Button onClick={loadPages} disabled={loadingPages} className="gap-2">
                  <RefreshCw className={`w-4 h-4 ${loadingPages ? "animate-spin" : ""}`} />
                  {pagesLoaded ? "Refresh" : "Load Pages"}
                </Button>
              </div>

              {!pagesLoaded && (
                <div className="text-center py-20 text-muted-foreground">
                  <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-base font-medium">Select a page to view analytics</p>
                  <p className="text-sm mt-1">Click "Load Pages" to see your connected Facebook pages</p>
                </div>
              )}

              {loadingPages && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-32 rounded-2xl" />
                  ))}
                </div>
              )}

              {pagesLoaded && !loadingPages && pages.length === 0 && (
                <div className="text-center py-20 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-base font-medium">No pages found</p>
                  <p className="text-sm mt-1">Connect a Facebook account with pages to see analytics</p>
                </div>
              )}

              {pagesLoaded && !loadingPages && Object.entries(groupedPages).map(([accountId, group]) => (
                <div key={accountId} className="mb-8">
                  <div className="flex items-center gap-2.5 mb-4">
                    {group.accountPicture ? (
                      <img src={group.accountPicture} alt="" className="w-7 h-7 rounded-full object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="w-3.5 h-3.5 text-primary" />
                      </div>
                    )}
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{group.accountName}</h2>
                    <Badge variant="secondary" className="text-xs">{group.pages.length} page{group.pages.length !== 1 ? "s" : ""}</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.pages.map((page) => (
                      <motion.div
                        key={page.id}
                        whileHover={{ scale: 1.01 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      >
                        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer bg-card/80 backdrop-blur overflow-hidden">
                          <CardContent className="p-5">
                            <div className="flex items-start gap-3 mb-4">
                              {page.profilePicture ? (
                                <img src={page.profilePicture} alt="" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
                                  <BarChart2 className="w-5 h-5 text-blue-600" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm leading-tight truncate">{page.name}</p>
                                {page.category && <p className="text-xs text-muted-foreground mt-0.5">{page.category}</p>}
                                <p className="text-xs text-muted-foreground mt-1">
                                  <span className="font-semibold text-foreground">{formatNumber(page.followersCount)}</span> followers
                                </p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              className="w-full gap-2"
                              onClick={() => handleSelectPage(page)}
                            >
                              <BarChart2 className="w-3.5 h-3.5" />
                              View Analytics
                            </Button>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
