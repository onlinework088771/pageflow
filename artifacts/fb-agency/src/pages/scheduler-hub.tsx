import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Facebook, Youtube, CalendarClock, ArrowRight, PenSquare, UploadCloud, Clock } from "lucide-react";
import { Link } from "wouter";
import { authFetch, apiUrl } from "@/components/schedule-management-utils";
import { QueryErrorState } from "@/components/query-error-state";

interface SV { id: string; status: string; scheduledAt: string }

async function readApiList(res: Response, label: string): Promise<SV[]> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${label} request failed (${res.status})`);
  }
  return res.json();
}

function useScheduleCounts() {
  const fb = useQuery<SV[]>({
    queryKey: ["scheduled-videos", "hub"],
    queryFn: () => authFetch(apiUrl("/scheduled-videos")).then((res) => readApiList(res, "Facebook scheduler")),
  });
  const yt = useQuery<SV[]>({
    queryKey: ["youtube-scheduled-videos", "hub"],
    queryFn: () => authFetch(apiUrl("/youtube/scheduled-videos")).then((res) => readApiList(res, "YouTube scheduler")),
  });
  const count = (list: SV[] | undefined, ...statuses: string[]) =>
    (list ?? []).filter((v) => statuses.includes(v.status)).length;
  return {
    loading: fb.isLoading || yt.isLoading,
    fbError: fb.error,
    ytError: yt.error,
    fbRefetch: fb.refetch,
    ytRefetch: yt.refetch,
    fb: {
      pending: count(fb.data, "pending", "processing"),
      posted: count(fb.data, "posted"),
      failed: count(fb.data, "failed"),
    },
    yt: {
      pending: count(yt.data, "pending", "processing"),
      posted: count(yt.data, "posted"),
      failed: count(yt.data, "failed"),
    },
  };
}

export default function SchedulerHub() {
  const { loading, fb, yt, fbError, ytError, fbRefetch, ytRefetch } = useScheduleCounts();

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Scheduler"
          icon={<CalendarClock className="h-5 w-5" />}
          description="All scheduled content across Facebook and YouTube — upcoming, published and failed."
          actions={
            <>
              <Button variant="outline" size="sm" asChild className="gap-2">
                <Link href="/upload"><PenSquare className="h-4 w-4" /> Facebook Post</Link>
              </Button>
              <Button size="sm" asChild className="gap-2">
                <Link href="/youtube/bulk-upload"><UploadCloud className="h-4 w-4" /> YouTube Upload</Link>
              </Button>
            </>
          }
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <PlatformScheduleCard
            loading={loading}
            icon={<Facebook className="h-5 w-5 text-[#1877F2]" />}
            title="Facebook"
            href="/schedule"
            createHref="/upload"
            createLabel="Create Facebook Post"
            {...fb}
            error={fbError}
            onRetry={() => void fbRefetch()}
          />
          <PlatformScheduleCard
            loading={loading}
            icon={<Youtube className="h-5 w-5 text-[#FF0000]" />}
            title="YouTube"
            href="/youtube/scheduler"
            createHref="/youtube/bulk-upload"
            createLabel="Upload YouTube Video"
            {...yt}
            error={ytError}
            onRetry={() => void ytRefetch()}
          />
        </div>
      </div>
    </Layout>
  );
}

function PlatformScheduleCard({ loading, icon, title, href, createHref, createLabel, pending, posted, failed, error, onRetry }: {
  loading: boolean; icon: React.ReactNode; title: string; href: string;
  createHref: string; createLabel: string; pending: number; posted: number; failed: number;
  error?: unknown; onRetry?: () => void;
}) {
  const items = [
    { label: "Pending", value: pending, cls: "text-blue-600 dark:text-blue-400" },
    { label: "Published", value: posted, cls: "text-emerald-600 dark:text-emerald-400" },
    { label: "Failed", value: failed, cls: failed > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground" },
  ];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {icon}
            <h3 className="font-semibold">{title} Scheduler</h3>
          </div>
          <Button variant="outline" size="sm" asChild className="gap-1">
            <Link href={href}>Open <ArrowRight className="h-3.5 w-3.5" /></Link>
          </Button>
        </div>
        {loading ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : error ? (
          <div className="mt-4">
            <QueryErrorState error={error} compact onRetry={onRetry} />
          </div>
        ) : (
          <dl className="mt-4 grid grid-cols-3 gap-3">
            {items.map((s) => (
              <div key={s.label} className="rounded-lg border bg-muted/30 px-3 py-2.5">
                <dd className={`text-xl font-semibold tabular-nums ${s.cls}`}>{s.value}</dd>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" aria-hidden="true" /> {s.label}
                </dt>
              </div>
            ))}
          </dl>
        )}
        <Button size="sm" asChild className="mt-4 w-full gap-2 sm:w-auto">
          <Link href={createHref}>{createLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
