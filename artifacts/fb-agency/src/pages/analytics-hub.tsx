import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Facebook, Youtube, BarChart2, ArrowRight, Users, Eye, TrendingUp, MonitorPlay } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { authFetch, apiUrl } from "@/components/schedule-management-utils";
import { Skeleton } from "@/components/ui/skeleton";

interface YtChannel { id: number; title: string; subscriberCount: number; videoCount: number }

export default function AnalyticsHub() {
  const { data: channels, isLoading } = useQuery<YtChannel[]>({
    queryKey: ["youtube-channels", "analytics-hub"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/youtube/channels"));
      if (!res.ok) return [];
      return res.json();
    },
  });
  const ytSubs = (channels ?? []).reduce((s, c) => s + (c.subscriberCount ?? 0), 0);

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Analytics"
          icon={<BarChart2 className="h-5 w-5" />}
          description="Performance insights for your Facebook pages and YouTube channels."
        />

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Facebook analytics card */}
          <Link
            href="/facebook/analytics"
            className="group rounded-xl border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-muted/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg border bg-[#1877F2]/5 p-2.5">
                  <Facebook className="h-5 w-5 text-[#1877F2]" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-semibold">Facebook Insights</h3>
                  <p className="text-xs text-muted-foreground">Per-page page insights via Meta API</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
            </div>
            <ul className="mt-5 grid grid-cols-3 gap-2 text-sm">
              <InsightPill icon={<TrendingUp className="h-3.5 w-3.5" />} label="Reach" />
              <InsightPill icon={<Eye className="h-3.5 w-3.5" />} label="Engagement" />
              <InsightPill icon={<Users className="h-3.5 w-3.5" />} label="Followers" />
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">Pick an account and page, then explore impressions, reach, engagement and follower growth over time.</p>
          </Link>

          {/* YouTube analytics card */}
          <Link
            href="/youtube/analytics"
            className="group rounded-xl border bg-card p-6 transition-colors hover:border-red-500/40 hover:bg-muted/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg border bg-red-500/5 p-2.5">
                  <Youtube className="h-5 w-5 text-[#FF0000]" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-semibold">YouTube Analytics</h3>
                  <p className="text-xs text-muted-foreground">Live data from YouTube Data API v3</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
            </div>
            <ul className="mt-5 grid grid-cols-3 gap-2 text-sm">
              {isLoading ? (
                <li className="col-span-3"><Skeleton className="h-8 w-full" /></li>
              ) : (
                <>
                  <InsightPill icon={<MonitorPlay className="h-3.5 w-3.5" />} label={`${channels?.length ?? 0} channels`} />
                  <InsightPill icon={<Users className="h-3.5 w-3.5" />} label={`${ytSubs.toLocaleString()} subs`} />
                  <InsightPill icon={<Eye className="h-3.5 w-3.5" />} label="Views & likes" />
                </>
              )}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">Subscriber counts, views per upload, engagement and best/worst performing videos per channel.</p>
          </Link>
        </div>
      </div>
    </Layout>
  );
}

function InsightPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-2 text-xs font-medium text-muted-foreground">
      {icon} <span className="truncate">{label}</span>
    </li>
  );
}
