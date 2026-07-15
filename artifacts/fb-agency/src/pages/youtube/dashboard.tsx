import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Youtube, Plus, Users, Video, ArrowRight } from "lucide-react";
import { authFetch, apiUrl } from "@/components/schedule-management-utils";
import { getAuthToken } from "@/contexts/auth-context";

interface YoutubeChannel {
  id: number;
  channelId: string;
  title: string;
  thumbnail: string | null;
  customUrl: string | null;
  subscriberCount: number;
  videoCount: number;
}

interface YoutubeAccount {
  id: number;
  name: string;
  email: string | null;
  profilePicture: string | null;
  status: "connected" | "expired" | "error";
  channels: YoutubeChannel[];
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function handleConnect() {
  const token = getAuthToken();
  window.location.href = `${apiUrl("/auth/youtube")}?token=${encodeURIComponent(token ?? "")}`;
}

export default function YoutubeDashboard() {
  const [, navigate] = useLocation();

  const { data: accounts, isLoading } = useQuery<YoutubeAccount[]>({
    queryKey: ["youtube-accounts"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/youtube/accounts"));
      if (!res.ok) throw new Error("Failed to load YouTube accounts");
      return res.json();
    },
  });

  const totalChannels = accounts?.reduce((sum, a) => sum + a.channels.length, 0) ?? 0;
  const connectedAccounts = accounts?.filter((a) => a.status === "connected") ?? [];
  const allChannels = accounts?.flatMap((a) => a.channels) ?? [];

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <Youtube className="h-7 w-7 text-red-500" />
              YouTube Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Overview of your connected Google accounts and YouTube channels.
            </p>
          </div>
          <Button onClick={handleConnect} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            Connect Google Account
          </Button>
        </div>

        {/* Stats row */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Google Accounts</p>
                <p className="text-3xl font-bold mt-1">{accounts?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {connectedAccounts.length} connected
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">YouTube Channels</p>
                <p className="text-3xl font-bold mt-1">{totalChannels}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  across all accounts
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* No accounts — big CTA */}
        {!isLoading && accounts?.length === 0 && (
          <Card className="border-dashed">
            <CardHeader className="text-center pb-2">
              <div className="flex justify-center mb-3">
                <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
                  <Youtube className="h-7 w-7 text-red-500" />
                </div>
              </div>
              <CardTitle>Connect your first Google account</CardTitle>
              <CardDescription>
                Link a Google account to manage its YouTube channels, schedule uploads, and automate posting.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pt-2 pb-6">
              <Button onClick={handleConnect} size="lg" className="gap-2">
                <Plus className="h-4 w-4" />
                Connect Google Account
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Channel list */}
        {!isLoading && allChannels.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Connected Channels</h2>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/youtube/accounts")}
              >
                Manage accounts
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {allChannels.map((channel) => (
                <Card key={channel.id}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={channel.thumbnail ?? undefined} />
                      <AvatarFallback>
                        <Youtube className="h-4 w-4 text-red-500" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{channel.title}</p>
                      {channel.customUrl && (
                        <p className="text-xs text-muted-foreground truncate">{channel.customUrl}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" /> {formatCount(channel.subscriberCount)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Video className="h-3 w-3" /> {formatCount(channel.videoCount)} videos
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">Active</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Quick links */}
        {!isLoading && totalChannels > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Card
              className="cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => navigate("/youtube/automation")}
            >
              <CardContent className="p-4">
                <p className="text-sm font-medium">Automation</p>
                <p className="text-xs text-muted-foreground mt-0.5">Configure auto-posting per channel</p>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => navigate("/youtube/scheduler")}
            >
              <CardContent className="p-4">
                <p className="text-sm font-medium">Scheduler</p>
                <p className="text-xs text-muted-foreground mt-0.5">Schedule individual video uploads</p>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => navigate("/youtube/analytics")}
            >
              <CardContent className="p-4">
                <p className="text-sm font-medium">Analytics</p>
                <p className="text-xs text-muted-foreground mt-0.5">View channel stats and performance</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
