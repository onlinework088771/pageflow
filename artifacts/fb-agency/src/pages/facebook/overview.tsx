import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { useQuery } from "@tanstack/react-query";
import { useListAccounts, useListPages, getListAccountsQueryKey, getListPagesQueryKey, useGetOverviewStats, getGetOverviewStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Facebook, Users, Files, PenSquare, Clock, ListVideo, LineChart,
  ArrowRight, Plus, CheckCircle2, AlertCircle, CalendarClock, Coins,
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { authFetch, apiUrl } from "@/components/schedule-management-utils";

interface ScheduledVideo {
  id: string; title: string; postType?: string; scheduledAt: string;
  status: string; pageIds: string[];
}

const SECTION_LINKS = [
  { href: "/accounts", label: "Accounts", desc: "Connected Facebook accounts & permissions", icon: Users },
  { href: "/pages", label: "Pages", desc: "Manage pages and content automation", icon: Files },
  { href: "/upload", label: "Create Post", desc: "Post or schedule videos, reels & images", icon: PenSquare },
  { href: "/schedule", label: "Scheduler", desc: "Scheduled content, history & retry", icon: Clock },
  { href: "/page-management", label: "Published Posts", desc: "Browse and delete published posts", icon: ListVideo },
  { href: "/facebook/analytics", label: "Analytics", desc: "Reach, engagement & follower insights", icon: LineChart },
];

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  processing: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  posted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default function FacebookOverview() {
  const { data: accounts, isLoading: accountsLoading } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });
  const { data: pages, isLoading: pagesLoading } = useListPages(undefined, { query: { queryKey: getListPagesQueryKey() } });
  const { data: stats } = useGetOverviewStats({ query: { queryKey: getGetOverviewStatsQueryKey() } });

  const { data: scheduled } = useQuery<ScheduledVideo[]>({
    queryKey: ["scheduled-videos", "fb-overview"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/scheduled-videos"));
      if (!res.ok) return [];
      return res.json();
    },
  });

  const pending = (scheduled ?? []).filter((v) => v.status === "pending" || v.status === "processing");
  const upcoming = [...pending].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()).slice(0, 4);
  const loading = accountsLoading || pagesLoading;
  const hasAccounts = !!accounts?.length;

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Facebook"
          icon={<Facebook className="h-5 w-5 text-[#1877F2]" />}
          title="Facebook Workspace"
          description="Everything Facebook: accounts, pages, content creation, scheduling and analytics."
          actions={
            <Button size="sm" asChild className="gap-2">
              <Link href="/upload"><Plus className="h-4 w-4" /> Create Post</Link>
            </Button>
          }
        />

        {/* Summary strip */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat loading={loading} label="Accounts" value={accounts?.length ?? 0} icon={<Users className="h-4 w-4" />} />
          <MiniStat loading={loading} label="Pages" value={pages?.length ?? 0} icon={<Files className="h-4 w-4" />} />
          <MiniStat loading={false} label="Automations" value={stats?.automationActiveCount ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} />
          <MiniStat loading={false} label="Scheduled" value={pending.length} icon={<CalendarClock className="h-4 w-4" />} />
        </div>

        {!hasAccounts && !accountsLoading ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
              <div className="rounded-full bg-[#1877F2]/10 p-4">
                <Facebook className="h-7 w-7 text-[#1877F2]" />
              </div>
              <div>
                <h3 className="font-semibold">No Facebook accounts connected</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Connect a Facebook account to start managing pages, scheduling posts and tracking analytics.
                </p>
              </div>
              <Button asChild className="gap-2">
                <Link href="/accounts"><Facebook className="h-4 w-4" /> Connect Facebook Account</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Accounts list */}
            <Card className="lg:col-span-1">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Connected Accounts</h3>
                  <Button variant="ghost" size="sm" asChild className="h-7 gap-1 px-2 text-xs text-muted-foreground">
                    <Link href="/accounts">Manage <ArrowRight className="h-3 w-3" /></Link>
                  </Button>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {accountsLoading ? (
                    [1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)
                  ) : accounts?.slice(0, 4).map((a) => (
                    <li key={a.id} className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8 border">
                        <AvatarImage src={a.profilePicture} />
                        <AvatarFallback className="text-xs">{a.name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.pagesCount ?? 0} pages</p>
                      </div>
                      {a.status === "connected"
                        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Connected" />
                        : <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" aria-label="Needs attention" />}
                    </li>
                  ))}
                </ul>
                {(accounts?.length ?? 0) > 4 && (
                  <p className="mt-3 text-xs text-muted-foreground">+{accounts!.length - 4} more</p>
                )}
              </CardContent>
            </Card>

            {/* Upcoming */}
            <Card className="lg:col-span-2">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Upcoming Posts</h3>
                  <Button variant="ghost" size="sm" asChild className="h-7 gap-1 px-2 text-xs text-muted-foreground">
                    <Link href="/schedule">Scheduler <ArrowRight className="h-3 w-3" /></Link>
                  </Button>
                </div>
                {upcoming.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nothing scheduled — create your next post.</p>
                ) : (
                  <ul className="mt-3 divide-y">
                    {upcoming.map((v) => (
                      <li key={v.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_BADGE[v.status] ?? STATUS_BADGE.pending}`}>{v.status}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{v.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {format(new Date(v.scheduledAt), "MMM d, h:mm a")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Section links */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTION_LINKS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg border bg-muted/50 p-2 text-muted-foreground">
                  <s.icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-sm font-semibold">
                    {s.label}
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}

function MiniStat({ loading, label, value, icon }: { loading: boolean; label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="mt-1 h-7 w-12" /> : <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>}
        </div>
        <span className="text-muted-foreground">{icon}</span>
      </CardContent>
    </Card>
  );
}
