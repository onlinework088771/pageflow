import { Layout } from "@/components/layout";
import { useGetOverviewStats, getGetOverviewStatsQueryKey, useAddTokens } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Plus, Activity, Files, ShieldCheck, Coins, AlertCircle, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Overview() {
  const { data: stats, isLoading } = useGetOverviewStats({ query: { queryKey: getGetOverviewStatsQueryKey() } });
  const addTokens = useAddTokens();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleAddTokens = () => {
    addTokens.mutate(
      { data: { amount: 1000 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetOverviewStatsQueryKey() });
          toast({ title: "Tokens added successfully" });
        },
      }
    );
  };

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome back, Shakil</h1>
            <p className="text-muted-foreground mt-1">Here's what's happening with your pages today.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button onClick={handleAddTokens} disabled={addTokens.isPending} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Tokens
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Pages</CardTitle>
              <Files className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.activePagesCount || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Out of {stats?.totalPagesCount || 0} total pages
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Automation Health</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.automationActiveCount || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Pages actively automating
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Account Health</CardTitle>
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="flex items-center gap-2 text-2xl font-bold capitalize">
                    {stats?.accountHealth === "active" && <CheckCircle2 className="h-6 w-6 text-green-500" />}
                    {stats?.accountHealth === "warning" && <AlertCircle className="h-6 w-6 text-yellow-500" />}
                    {stats?.accountHealth === "inactive" && <AlertCircle className="h-6 w-6 text-red-500" />}
                    {stats?.accountHealth || "Unknown"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Overall FB account status
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Token Balance</CardTitle>
              <Coins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.tokenBalance?.toLocaleString() || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Available for API usage
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="col-span-full">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest actions across your managed pages.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !stats?.recentActivity?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                No recent activity.
              </div>
            ) : (
              <div className="space-y-4">
                {stats.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">{activity.message}</span>
                      {activity.pageName && (
                        <span className="text-xs text-muted-foreground">Page: {activity.pageName}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(activity.timestamp), "MMM d, h:mm a")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
