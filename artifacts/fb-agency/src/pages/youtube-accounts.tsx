import { useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useListYoutubeAccounts,
  getListYoutubeAccountsQueryKey,
  getListYoutubeChannelsQueryKey,
  useDeleteYoutubeAccount,
  useSyncYoutubeAccountChannels,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/contexts/auth-context";
import { QueryErrorState } from "@/components/query-error-state";
import {
  Youtube,
  Plus,
  RefreshCw,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
} from "lucide-react";
import { motion } from "framer-motion";

function getApiBase(): string {
  return import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
}

export default function YouTubeAccounts() {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Read query params for post-OAuth feedback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const channels = params.get("channels");
    const error = params.get("error");

    if (connected === "1") {
      toast({
        title: "YouTube account connected",
        description: `${channels ?? "0"} channel${Number(channels) !== 1 ? "s" : ""} synced successfully.`,
      });
      // Clean up URL params
      window.history.replaceState({}, "", window.location.pathname);
      void queryClient.invalidateQueries({ queryKey: getListYoutubeAccountsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListYoutubeChannelsQueryKey() });
    } else if (error) {
      const messages: Record<string, string> = {
        access_denied: "You cancelled the Google authorisation.",
        oauth_failed: "Failed to connect to YouTube. Please try again.",
        invalid_token: "Session expired — please log in again.",
        missing_params: "OAuth flow error. Please try again.",
      };
      toast({
        title: "Connection failed",
        description: messages[error] ?? "An unexpected error occurred.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const { data: accounts = [], isLoading, error: accountsError, refetch: refetchAccounts } = useListYoutubeAccounts({
    query: { queryKey: getListYoutubeAccountsQueryKey() },
  });

  const deleteMutation = useDeleteYoutubeAccount({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListYoutubeAccountsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListYoutubeChannelsQueryKey() });
        toast({ title: "YouTube account disconnected" });
      },
      onError: () => {
        toast({ title: "Failed to disconnect account", variant: "destructive" });
      },
    },
  });

  const syncMutation = useSyncYoutubeAccountChannels({
    mutation: {
      onSuccess: (data) => {
        void queryClient.invalidateQueries({ queryKey: getListYoutubeAccountsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListYoutubeChannelsQueryKey() });
        toast({ title: `Synced ${(data as any)?.synced ?? 0} channel(s)` });
      },
      onError: () => {
        toast({ title: "Sync failed", variant: "destructive" });
      },
    },
  });

  function handleConnect() {
    const token = getAuthToken();
    if (!token) {
      toast({ title: "Not logged in", variant: "destructive" });
      return;
    }
    const base = getApiBase();
    window.location.replace(`${base}/api/youtube/auth/start?token=${encodeURIComponent(token)}`);
  }

  function statusBadge(status: string) {
    if (status === "connected")
      return (
        <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
        </Badge>
      );
    if (status === "expired")
      return (
        <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30 text-xs">
          <Clock className="h-3 w-3 mr-1" /> Expired
        </Badge>
      );
    return (
      <Badge variant="destructive" className="text-xs">
        <AlertCircle className="h-3 w-3 mr-1" /> Error
      </Badge>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-red-500/10">
              <Youtube className="h-5 w-5 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">YouTube Accounts</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Connect your Google accounts to manage YouTube channel automation.
          </p>
        </div>
        <Button onClick={handleConnect} className="shrink-0 gap-2">
          <Plus className="h-4 w-4" />
          Connect YouTube Account
        </Button>
      </div>

      {/* Setup notice */}
      {accounts.length === 0 && !isLoading && !accountsError && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 flex gap-3"
        >
          <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-foreground mb-1">Setup required</p>
            <p className="text-muted-foreground">
              To use YouTube automation, your administrator must set{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">GOOGLE_CLIENT_ID</code> and{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">GOOGLE_CLIENT_SECRET</code>{" "}
              environment variables from a Google Cloud project with the YouTube Data API v3 enabled.
            </p>
            <a
              href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-500 hover:underline mt-2 font-medium"
            >
              Open Google Cloud Console <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </motion.div>
      )}

      {/* Account cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2].map((i) => (
            <Card key={i} className="p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : accountsError ? (
        <QueryErrorState error={accountsError} onRetry={() => void refetchAccounts()} />
      ) : accounts.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account, i) => (
            <motion.div
              key={account.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-11 w-11 ring-2 ring-border shrink-0">
                        <AvatarImage src={account.profilePicture ?? undefined} alt={account.name} />
                        <AvatarFallback className="bg-red-500/10 text-red-600 font-bold text-sm">
                          {account.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold truncate">
                          {account.name}
                        </CardTitle>
                        {account.email && (
                          <p className="text-xs text-muted-foreground truncate">{account.email}</p>
                        )}
                      </div>
                    </div>
                    {statusBadge(account.status)}
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-center">
                      <p className="text-lg font-bold">{account.channelsCount}</p>
                      <p className="text-xs text-muted-foreground">
                        {account.channelsCount === 1 ? "channel" : "channels"}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Connected{" "}
                      {new Date(account.connectedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>

                  {account.status === "expired" && (
                    <div className="mb-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
                      Token expired — reconnect this account to resume automation.
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5 text-xs"
                      disabled={syncMutation.isPending}
                      onClick={() =>
                        syncMutation.mutate({ accountId: account.id })
                      }
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`}
                      />
                      Sync Channels
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive px-2.5"
                      disabled={deleteMutation.isPending}
                      onClick={() =>
                        deleteMutation.mutate({ accountId: account.id })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-4">
            <Youtube className="h-8 w-8 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No YouTube accounts connected</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
            Connect a Google account to start automating YouTube channel uploads.
          </p>
          <Button onClick={handleConnect} className="gap-2">
            <Plus className="h-4 w-4" /> Connect YouTube Account
          </Button>
        </div>
      )}
    </Layout>
  );
}
