import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useListYoutubeChannels,
  getListYoutubeChannelsQueryKey,
  useListYoutubeAccounts,
  getListYoutubeAccountsQueryKey,
  useUpdateYoutubeChannel,
  useDeleteYoutubeChannel,
  useUpdateYoutubeChannelSource,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Youtube,
  PlayCircle,
  Trash2,
  Settings2,
  AlertCircle,
  CheckCircle2,
  PauseCircle,
  ArrowRight,
  Users,
  TrendingUp,
  Zap,
  Link2,
} from "lucide-react";
import { motion } from "framer-motion";

const SOURCE_LABELS: Record<string, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
};

function statusBadge(status: string, automationEnabled: boolean) {
  if (!automationEnabled)
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        <PauseCircle className="h-3 w-3 mr-1" /> Paused
      </Badge>
    );
  if (status === "active")
    return (
      <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Active
      </Badge>
    );
  if (status === "error")
    return (
      <Badge variant="destructive" className="text-xs">
        <AlertCircle className="h-3 w-3 mr-1" /> Error
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">
      <PauseCircle className="h-3 w-3 mr-1" /> Paused
    </Badge>
  );
}

export default function YouTubeAutomation() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Source setup dialog state
  const [sourceDialog, setSourceDialog] = useState<{
    open: boolean;
    channelId: string;
    sourceType: string;
    sourceIdentity: string;
  }>({ open: false, channelId: "", sourceType: "youtube", sourceIdentity: "" });

  const { data: channels = [], isLoading: channelsLoading } = useListYoutubeChannels({
    query: { queryKey: getListYoutubeChannelsQueryKey() },
  });
  const { data: accounts = [], isLoading: accountsLoading } = useListYoutubeAccounts({
    query: { queryKey: getListYoutubeAccountsQueryKey() },
  });

  const updateMutation = useUpdateYoutubeChannel({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListYoutubeChannelsQueryKey() });
      },
      onError: () => toast({ title: "Update failed", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteYoutubeChannel({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListYoutubeChannelsQueryKey() });
        toast({ title: "Channel removed" });
      },
      onError: () => toast({ title: "Delete failed", variant: "destructive" }),
    },
  });

  const sourceMutation = useUpdateYoutubeChannelSource({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListYoutubeChannelsQueryKey() });
        setSourceDialog((s) => ({ ...s, open: false }));
        toast({ title: "Source updated" });
      },
      onError: () => toast({ title: "Source update failed", variant: "destructive" }),
    },
  });

  function handleToggleAutomation(channelId: string, current: boolean) {
    updateMutation.mutate({
      channelId,
      data: { automationEnabled: !current },
    });
  }

  function handleToggleStatus(channelId: string, currentStatus: string) {
    updateMutation.mutate({
      channelId,
      data: { status: currentStatus === "active" ? "paused" : "active" },
    });
  }

  function openSourceDialog(ch: (typeof channels)[0]) {
    setSourceDialog({
      open: true,
      channelId: ch.id,
      sourceType: ch.sourceType ?? "youtube",
      sourceIdentity: ch.sourceIdentity ?? "",
    });
  }

  function saveSource() {
    if (!sourceDialog.sourceIdentity.trim()) {
      toast({ title: "Please enter a source identity", variant: "destructive" });
      return;
    }
    sourceMutation.mutate({
      channelId: sourceDialog.channelId,
      data: {
        sourceType: sourceDialog.sourceType as any,
        sourceIdentity: sourceDialog.sourceIdentity.trim(),
      },
    });
  }

  const isLoading = channelsLoading || accountsLoading;
  const hasAccounts = accounts.length > 0;

  // Stats
  const activeCount = channels.filter((c) => c.automationEnabled && c.status === "active").length;
  const totalPosted = channels.reduce((s, c) => s + c.totalPosted, 0);

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-red-500/10">
              <PlayCircle className="h-5 w-5 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">YouTube Automation</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Auto-upload content from Instagram, TikTok, or other YouTube channels to your YouTube channels.
          </p>
        </div>
        <Button
          variant="outline"
          className="shrink-0 gap-2"
          onClick={() => navigate("/youtube-accounts")}
        >
          <Youtube className="h-4 w-4" />
          Manage Accounts
        </Button>
      </div>

      {/* Stats row */}
      {channels.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {[
            { label: "Total Channels", value: channels.length, icon: Youtube },
            { label: "Active Automations", value: activeCount, icon: Zap },
            { label: "Total Uploaded", value: totalPosted, icon: TrendingUp },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </div>
              <p className="text-2xl font-bold">{value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* No accounts guard */}
      {!isLoading && !hasAccounts && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-5 flex gap-3 mb-6"
        >
          <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm mb-1">No YouTube accounts connected</p>
            <p className="text-sm text-muted-foreground mb-3">
              Connect a Google account first to manage YouTube channel automation.
            </p>
            <Button size="sm" onClick={() => navigate("/youtube-accounts")} className="gap-1.5">
              <Youtube className="h-3.5 w-3.5" /> Connect Account
            </Button>
          </div>
        </motion.div>
      )}

      {/* Channel cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-12 w-12 rounded-full mb-3" />
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-3 w-24 mb-4" />
              <Skeleton className="h-8 w-full" />
            </Card>
          ))}
        </div>
      ) : channels.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((ch, i) => (
            <motion.div
              key={ch.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card
                className="hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => navigate(`/youtube/${ch.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      {ch.thumbnailUrl ? (
                        <img
                          src={ch.thumbnailUrl}
                          alt={ch.name}
                          className="h-11 w-11 rounded-full object-cover ring-2 ring-border shrink-0"
                        />
                      ) : (
                        <div className="h-11 w-11 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                          <Youtube className="h-5 w-5 text-red-500" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                          {ch.name}
                        </CardTitle>
                        {ch.subscriberCount > 0 && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Users className="h-3 w-3" />
                            {ch.subscriberCount.toLocaleString()} subscribers
                          </p>
                        )}
                      </div>
                    </div>
                    {statusBadge(ch.status, ch.automationEnabled)}
                  </div>
                </CardHeader>

                <CardContent className="pt-0" onClick={(e) => e.stopPropagation()}>
                  {/* Source info */}
                  {ch.sourceType && ch.sourceIdentity ? (
                    <div className="flex items-center gap-2 mb-4 bg-muted/50 rounded-lg px-3 py-2">
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium text-muted-foreground truncate">
                        {SOURCE_LABELS[ch.sourceType] ?? ch.sourceType}:{" "}
                        <span className="text-foreground">{ch.sourceIdentity}</span>
                      </span>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2 mb-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 cursor-pointer hover:bg-yellow-500/15 transition-colors"
                      onClick={() => openSourceDialog(ch)}
                    >
                      <AlertCircle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                      <span className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">
                        No source configured — click to set up
                      </span>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="text-center bg-muted/40 rounded-lg py-2">
                      <p className="text-base font-bold text-green-600">{ch.totalPosted}</p>
                      <p className="text-[10px] text-muted-foreground">Uploaded</p>
                    </div>
                    <div className="text-center bg-muted/40 rounded-lg py-2">
                      <p className="text-base font-bold text-red-500">{ch.totalFailed}</p>
                      <p className="text-[10px] text-muted-foreground">Failed</p>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={ch.automationEnabled}
                        onCheckedChange={() => handleToggleAutomation(ch.id, ch.automationEnabled)}
                        disabled={updateMutation.isPending}
                        className="scale-90"
                      />
                      <span className="text-xs text-muted-foreground">
                        {ch.automationEnabled ? "Auto on" : "Auto off"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => openSourceDialog(ch)}
                        title="Configure source"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        onClick={() => navigate(`/youtube/${ch.id}`)}
                        title="Open channel settings"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate({ channelId: ch.id })}
                        disabled={deleteMutation.isPending}
                        title="Remove channel"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : hasAccounts ? (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-4">
            <PlayCircle className="h-8 w-8 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No channels yet</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
            Your connected YouTube channels will appear here after syncing your accounts.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate("/youtube-accounts")}
            className="gap-2"
          >
            <Youtube className="h-4 w-4" /> Sync Channels
          </Button>
        </div>
      ) : null}

      {/* Source setup dialog */}
      <Dialog
        open={sourceDialog.open}
        onOpenChange={(o) => setSourceDialog((s) => ({ ...s, open: o }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configure Content Source</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sourceType">Source Platform</Label>
              <Select
                value={sourceDialog.sourceType}
                onValueChange={(v) => setSourceDialog((s) => ({ ...s, sourceType: v }))}
              >
                <SelectTrigger id="sourceType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="youtube">YouTube Channel</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sourceIdentity">
                {sourceDialog.sourceType === "youtube"
                  ? "YouTube Handle or Channel ID"
                  : sourceDialog.sourceType === "instagram"
                  ? "Instagram Handle (e.g. @username)"
                  : "TikTok Handle (e.g. @username)"}
              </Label>
              <Input
                id="sourceIdentity"
                placeholder={
                  sourceDialog.sourceType === "youtube"
                    ? "@channelhandle or UCxxxxxx"
                    : "@handle"
                }
                value={sourceDialog.sourceIdentity}
                onChange={(e) =>
                  setSourceDialog((s) => ({ ...s, sourceIdentity: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Content from this source will be automatically uploaded to your YouTube channel.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSourceDialog((s) => ({ ...s, open: false }))}
            >
              Cancel
            </Button>
            <Button onClick={saveSource} disabled={sourceMutation.isPending}>
              Save Source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
