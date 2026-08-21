import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import {
  useGetOverviewStats,
  getGetOverviewStatsQueryKey,
  useAddTokens,
  useListAccounts,
  getListAccountsQueryKey,
  useListPages,
  getListPagesQueryKey,
  useListYoutubeAccounts,
  getListYoutubeAccountsQueryKey,
  useListYoutubeChannels,
  getListYoutubeChannelsQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Facebook, Youtube, Plus, PenSquare, UploadCloud, CalendarClock, Coins, ArrowRight, Activity, ShieldCheck, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { authFetch, apiUrl } from "@/components/schedule-management-utils";
import { Link } from "wouter";
import { QueryErrorState } from "@/components/query-error-state";

interface ScheduledVideo { id: string; title: string; postType?: string; scheduledAt: string; timezone: string; status: string; pageIds: string[] }

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  processing: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  posted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default function Overview() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useGetOverviewStats({ query: { queryKey: getGetOverviewStatsQueryKey() } });
  const addTokens = useAddTokens();
  const { data: fbAccounts, isLoading: fbLoading, error: fbAccountsError, refetch: refetchFbAccounts } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });
  const { data: fbPages, isLoading: pagesLoading, error: fbPagesError, refetch: refetchFbPages } = useListPages(undefined, { query: { queryKey: getListPagesQueryKey() } });
  const { data: ytAccounts, isLoading: ytAccountsLoading, error: ytAccountsError, refetch: refetchYtAccounts } = useListYoutubeAccounts({ query: { queryKey: getListYoutubeAccountsQueryKey() } });
  const { data: ytChannels, isLoading: ytChannelsLoading, error: ytChannelsError, refetch: refetchYtChannels } = useListYoutubeChannels({ query: { queryKey: getListYoutubeChannelsQueryKey() } });

  const { data: scheduled, error: scheduledError, refetch: refetchScheduled } = useQuery<ScheduledVideo[]>({
    queryKey: ["scheduled-videos", "overview"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/scheduled-videos"));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Scheduled content request failed (${res.status})`);
      }
      return res.json();
    },
  });

  const upcoming = (scheduled ?? [])
    .filter((v) => v.status === "pending" || v.status === "processing")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, 5);

  const ytChannelCount = ytChannels?.length ?? 0;
  const isOnline = stats?.systemStatus !== "offline" && stats?.systemStatus !== "degraded";

  const handleAddTokens = () => {
    addTokens.mutate(
      { data: { amount: 1000 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetOverviewStatsQueryKey() });
          toast({ title: "1,000 tokens added" });
        },
      }
    );
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={`Welcome back, ${user?.name?.split(" ")[0] ?? "there"}`}
          description={format(new Date(), "EEEE, MMMM d — 'here''s what''s happening across your workspace.'")}
          actions={
            <>
              <Button variant="outline" size="sm" asChild className="gap-2">
                <Link href="/youtube/bulk-upload"><UploadCloud className="h-4 w-4" /> Upload YouTube</Link>
              </Button>
              <Button size="sm" asChild className="gap-2">
                <Link href="/upload"><PenSquare className="h-4 w-4" /> Create Facebook Post</Link>
              </Button>
            </>
          }
        />

        {(statsError || fbAccountsError || fbPagesError || ytAccountsError || ytChannelsError || scheduledError) && (
          <QueryErrorState
            error={statsError ?? fbAccountsError ?? fbPagesError ?? ytAccountsError ?? ytChannelsError ?? scheduledError}
            onRetry={() => {
              void refetchStats();
              void refetchFbAccounts();
              void refetchFbPages();
              void refetchYtAccounts();
              void refetchYtChannels();
              void refetchScheduled();
            }}
          />
        )}

        {/* System status strip */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
            isOnline ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                     : "border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400"}`}>
            {isOnline ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            System {stats?.systemStatus ?? "online"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Account {stats?.accountHealth ?? "active"}
          </span>
        </div>

        {/* Stats row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard loading={statsLoading} label="Active Pages" value={stats?.activePagesCount ?? 0} sub={`of ${stats?.totalPagesCount ?? 0} total`} icon={<Facebook className="h-4 w-4" />} />
          <StatCard loading={statsLoading} label="Automations Running" value={stats?.automationActiveCount ?? 0} sub="pages actively automating" icon={<Activity className="h-4 w-4" />} />
          <StatCard             loading={!!scheduledError} label="Scheduled Content" value={upcoming.length} sub="pending Facebook posts" icon={<CalendarClock className="h-4 w-4" />} />
          <StatCard
            loading={statsLoading}
            label="Token Balance"
            value={(stats?.tokenBalance ?? 0).toLocaleString()}
            sub="for API usage"
            icon={<Coins className="h-4 w-4" />}
            action={
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handleAddTokens} disabled={addTokens.isPending}>
                <Plus className="h-3 w-3" /> Add 1,000
              </Button>
            }
          />
        </div>

        {/* Platform cards */}
        <div className="grid gap-4 lg:grid-cols-2">
          <PlatformCard
            loading={fbLoading || pagesLoading}
            icon={<Facebook className="h-5 w-5 text-[#1877F2]" />}
            title="Facebook"
            href="/facebook"
            stats={[
              { label: "Accounts", value: fbAccounts?.length ?? 0 },
              { label: "Pages", value: fbPages?.length ?? 0 },
              { label: "Automated", value: stats?.automationActiveCount ?? 0 },
            ]}
            primaryAction={{ label: "Create Post", href: "/upload" }}
            empty={!fbAccounts?.length}
            emptyText="Connect a Facebook account to start managing pages."
          />
          <PlatformCard
            loading={ytAccountsLoading || ytChannelsLoading}
            icon={<Youtube className="h-5 w-5 text-[#FF0000]" />}
            title="YouTube"
            href="/youtube"
            stats={[
              { label: "Accounts", value: ytAccounts?.length ?? 0 },
              { label: "Channels", value: ytChannelCount },
            ]}
            primaryAction={{ label: "Upload Video", href: "/youtube/bulk-upload" }}
            empty={!ytAccounts?.length}
            emptyText="Connect a Google account to start uploading."
          />
        </div>

        {/* Upcoming + Recent activity */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-muted-foreground" /> Upcoming Facebook Posts
              </CardTitle>
              <CardDescription>Next scheduled content to publish.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {upcoming.length === 0 ? (
                <EmptyMini text="Nothing scheduled yet." action={{ label: "Schedule a post", href: "/upload" }} />
              ) : (
                <ul className="divide-y">
                  {upcoming.map((v) => (
                    <li key={v.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_BADGE[v.status] ?? STATUS_BADGE.pending}`}>{v.status}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{v.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {format(new Date(v.scheduledAt), "MMM d, h:mm a")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="ghost" size="sm" asChild className="mt-2 gap-1 text-muted-foreground">
                <Link href="/schedule">View all scheduled <ArrowRight className="h-3.5 w-3.5" /></Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-muted-foreground" /> Recent Activity
              </CardTitle>
              <CardDescription>Latest actions across your managed pages.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {statsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !stats?.recentActivity?.length ? (
                <EmptyMini text="No recent activity." />
              ) : (
                <ul className="divide-y">
                  {stats.recentActivity.slice(0, 5).map((activity) => (
                    <li key={activity.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{activity.message}</p>
                        {activity.pageName && (
                          <p className="truncate text-xs text-muted-foreground">{activity.pageName}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {format(new Date(activity.timestamp), "MMM d, h:mm a")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ loading, label, value, sub, icon, action }: {
  loading: boolean; label: string; value: number | string; sub: string; icon: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <Card className="card-hover">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <span className="chip-blue flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            {icon}
          </span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
            )}
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

interface PlatformCardProps {
  loading: boolean;
  icon: React.ReactNode;
  title: string;
  href: string;
  stats: { label: string; value: number }[];
  primaryAction: { label: string; href: string };
  empty: boolean;
  emptyText: string;
}

function PlatformCard({ loading, icon, title, href, stats, primaryAction, empty, emptyText }: PlatformCardProps) {
  return (
    <Card className="card-hover">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="chip-blue flex h-9 w-9 items-center justify-center rounded-xl">
              {icon}
            </span>
            <h3 className="text-base font-semibold">{title}</h3>
          </div>
          <Button variant="ghost" size="sm" asChild className="h-7 gap-1 px-2 text-xs text-muted-foreground">
            <Link href={href}>Open <ArrowRight className="h-3 w-3" /></Link>
          </Button>
        </div>
        {loading ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {stats.map((s) => <Skeleton key={s.label} className="h-12" />)}
          </div>
        ) : empty ? (
          <div className="mt-4 rounded-lg border border-dashed bg-muted/30 px-4 py-5 text-center">
            <p className="text-sm text-muted-foreground">{emptyText}</p>
            <Button size="sm" asChild className="mt-3">
              <Link href={href}>Get started</Link>
            </Button>
          </div>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-3 gap-3">
              {stats.map((s) => (
                <div key={s.label} className="rounded-lg border bg-muted/30 px-3 py-2.5">
                  <dd className="text-xl font-semibold tabular-nums">{s.value}</dd>
                  <dt className="text-xs text-muted-foreground">{s.label}</dt>
                </div>
              ))}
            </dl>
            <Button size="sm" asChild className="mt-4 w-full gap-2 sm:w-auto">
              <Link href={primaryAction.href}>{primaryAction.label}</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyMini({ text, action }: { text: string; action?: { label: string; href: string } }) {
  return (
    <div className="py-6 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      {action && (
        <Button variant="outline" size="sm" asChild className="mt-3">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
