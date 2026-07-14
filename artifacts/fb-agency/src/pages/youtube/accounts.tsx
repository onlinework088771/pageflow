import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Youtube, Plus, RefreshCw, Trash2, Users, Video, Loader2 } from "lucide-react";
import { authFetch, apiUrl } from "@/components/schedule-management-utils";
import { getAuthToken } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";

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
  connectedAt: string;
  channels: YoutubeChannel[];
}

const ACCOUNTS_QUERY_KEY = ["youtube-accounts"];

async function fetchAccounts(): Promise<YoutubeAccount[]> {
  const res = await authFetch(apiUrl("/youtube/accounts"));
  if (!res.ok) throw new Error("Failed to load YouTube accounts");
  return res.json();
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const ERROR_MESSAGES: Record<string, string> = {
  app_not_configured: "Google OAuth credentials are not configured on the server yet.",
  no_code: "Google sign-in was cancelled.",
  invalid_state: "Invalid OAuth state. Please try again.",
  access_denied: "Google access was denied. Please try reconnecting and grant the requested permissions.",
  oauth_failed: "Something went wrong while connecting your Google account. Please try again.",
};

export default function YoutubeAccounts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: accounts, isLoading } = useQuery({
    queryKey: ACCOUNTS_QUERY_KEY,
    queryFn: fetchAccounts,
  });

  const disconnect = useMutation({
    mutationFn: async (accountId: number) => {
      const res = await authFetch(apiUrl(`/youtube/accounts/${accountId}/disconnect`), { method: "POST" });
      if (!res.ok) throw new Error("Failed to disconnect");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Account disconnected" });
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY });
    },
    onError: () => toast({ title: "Failed to disconnect account", variant: "destructive" }),
  });

  const refreshChannels = useMutation({
    mutationFn: async (accountId: number) => {
      const res = await authFetch(apiUrl(`/youtube/accounts/${accountId}/refresh-channels`), { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to refresh channels");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Channels refreshed" });
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY });
    },
    onError: (err: Error) => toast({ title: err.message || "Failed to refresh channels", variant: "destructive" }),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("yt_connected");
    const ytError = params.get("yt_error");

    if (connected === "1") {
      toast({ title: "Google account connected!", description: "Your YouTube channels have been synced." });
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (ytError) {
      toast({
        title: "YouTube connection failed",
        description: ERROR_MESSAGES[ytError] ?? ytError,
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  function handleConnect() {
    const token = getAuthToken();
    window.location.href = `${apiUrl("/auth/youtube")}?token=${encodeURIComponent(token ?? "")}`;
  }

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <Youtube className="h-7 w-7 text-red-500" />
              YouTube Accounts
            </h1>
            <p className="text-muted-foreground mt-1">
              Connect Google accounts to manage their YouTube channels.
            </p>
          </div>
          <Button onClick={handleConnect} className="gap-2">
            <Plus className="h-4 w-4" />
            Connect Google Account
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !accounts?.length ? (
          <Card>
            <CardHeader>
              <CardTitle>No accounts connected</CardTitle>
              <CardDescription>
                Connect a Google account to see its YouTube channels here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleConnect} className="gap-2">
                <Plus className="h-4 w-4" />
                Connect Google Account
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {accounts.map((account) => (
              <Card key={account.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarImage src={account.profilePicture ?? undefined} />
                      <AvatarFallback>{account.name?.[0]?.toUpperCase() ?? "G"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{account.name}</CardTitle>
                      <CardDescription className="truncate">{account.email}</CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant={account.status === "connected" ? "default" : "destructive"}
                    className="shrink-0 capitalize"
                  >
                    {account.status}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {account.channels.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No YouTube channels found on this account.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {account.channels.map((channel) => (
                        <div key={channel.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarImage src={channel.thumbnail ?? undefined} />
                            <AvatarFallback>
                              <Youtube className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{channel.title}</p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" /> {formatCount(channel.subscriberCount)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Video className="h-3 w-3" /> {formatCount(channel.videoCount)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => refreshChannels.mutate(account.id)}
                      disabled={refreshChannels.isPending}
                    >
                      {refreshChannels.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Refresh
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={handleConnect}>
                      <Youtube className="h-3.5 w-3.5" />
                      Reconnect
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                          Disconnect
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Disconnect this account?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes {account.name} and its {account.channels.length} channel
                            {account.channels.length === 1 ? "" : "s"} from PageFlow. You can reconnect at any time.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => disconnect.mutate(account.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Disconnect
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
