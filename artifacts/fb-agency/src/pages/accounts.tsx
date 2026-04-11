import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import {
  useListAccounts,
  getListAccountsQueryKey,
  useDeleteAccount,
  useSyncAccountPages,
  useGenerateMagicLink,
  useGetAgencySettings,
  getGetAgencySettingsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, Facebook, RefreshCw, AlertCircle, CheckCircle2, Loader2, Link, Copy, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Accounts() {
  const { data: accounts, isLoading } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });
  const { data: settings } = useGetAgencySettings({ query: { queryKey: getGetAgencySettingsQueryKey() } });
  const deleteAccount = useDeleteAccount();
  const syncPages = useSyncAccountPages();
  const generateMagicLink = useGenerateMagicLink();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [magicLinkUrl, setMagicLinkUrl] = useState<string | null>(null);
  const [magicLinkExpiry, setMagicLinkExpiry] = useState<string | null>(null);

  // Handle Facebook OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("fb_connected");
    const fbError = params.get("fb_error");

    if (connected === "1") {
      toast({ title: "Facebook account connected!", description: "Your pages have been synced automatically." });
      queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (fbError) {
      const messages: Record<string, string> = {
        app_not_configured: "Facebook App credentials not configured. Go to Settings → BYOC Wizard first.",
        no_code: "Facebook login was cancelled.",
        invalid_state: "Invalid OAuth state. Please try again.",
        access_denied: "Facebook access was denied.",
        magic_link_expired: "The magic link has expired. Please generate a new one.",
        invalid_magic_link: "Invalid magic link. Please generate a new one.",
      };
      toast({
        title: "Facebook connection failed",
        description: messages[fbError] ?? fbError,
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  function handleDirectConnect() {
    const token = localStorage.getItem("pf_auth_token");
    window.location.href = `${BASE}/api/auth/facebook?token=${encodeURIComponent(token ?? "")}`;
  }

  function handleGenerateMagicLink() {
    setMagicLinkUrl(null);
    generateMagicLink.mutate(undefined, {
      onSuccess: (data) => {
        setMagicLinkUrl(data.url);
        setMagicLinkExpiry(data.expiresAt);
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to generate magic link.";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    });
  }

  function copyMagicLink() {
    if (magicLinkUrl) {
      navigator.clipboard.writeText(magicLinkUrl);
      toast({ title: "Magic link copied to clipboard" });
    }
  }

  const handleDelete = (id: string) => {
    deleteAccount.mutate(
      { accountId: id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
          toast({ title: "Account disconnected" });
        },
        onError: () => {
          toast({ title: "Failed to disconnect account", variant: "destructive" });
        },
      }
    );
  };

  const handleSync = (id: string) => {
    syncPages.mutate(
      { accountId: id },
      {
        onSuccess: (data) => {
          toast({ title: `Synced ${data.synced} pages from Facebook` });
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        },
        onError: () => {
          toast({ title: "Sync failed", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
              <span>Agency</span>
              <span className="mx-1">›</span>
              <span>FB Accounts</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Facebook Accounts</h1>
            <p className="text-muted-foreground mt-1">Manage your connected Facebook accounts and their permissions.</p>
          </div>

          <Button className="gap-2" onClick={() => {
            setMagicLinkUrl(null);
            setIsConnectOpen(true);
          }}>
            <Facebook className="h-4 w-4" />
            Connect Facebook Account
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : !accounts?.length ? (
          <Card className="border-dashed bg-muted/50">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <div className="bg-primary/10 p-4 rounded-full mb-4">
                <Facebook className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-bold mb-1">No Accounts Connected</h3>
              <p className="text-muted-foreground max-w-sm mb-6">
                Connect a Facebook account via OAuth to start managing pages and automating posts.
              </p>
              <Button onClick={() => { setMagicLinkUrl(null); setIsConnectOpen(true); }} className="gap-2">
                <Facebook className="h-4 w-4" />
                Connect with Facebook
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => (
              <Card key={account.id} className="relative overflow-hidden group">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12 border">
                        <AvatarImage src={account.profilePicture} />
                        <AvatarFallback>{account.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold">{account.name}</h3>
                        <p className="text-xs text-muted-foreground">{account.email}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(account.id)}
                      disabled={deleteAccount.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-6 pt-6 border-t grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Pages</p>
                      <p className="font-medium">{account.pagesCount ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Status</p>
                      {account.status === "connected" ? (
                        <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20">
                          <CheckCircle2 className="h-3 w-3 mr-1" />Connected
                        </Badge>
                      ) : account.status === "expired" ? (
                        <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 border-yellow-500/20">Token Expired</Badge>
                      ) : (
                        <Badge variant="destructive" className="bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-500/20">
                          <AlertCircle className="h-3 w-3 mr-1" />Error
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 text-xs text-muted-foreground flex items-center justify-between">
                    <span>ID: {account.fbUserId}</span>
                    <span>Added {format(new Date(account.connectedAt), "MMM d, yyyy")}</span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-4 gap-2"
                    onClick={() => handleSync(account.id)}
                    disabled={syncPages.isPending}
                  >
                    <RefreshCw className={`h-3 w-3 ${syncPages.isPending ? "animate-spin" : ""}`} />
                    Sync Pages
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Connect Facebook Account Dialog */}
      <Dialog open={isConnectOpen} onOpenChange={setIsConnectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Facebook Account</DialogTitle>
            <DialogDescription>
              Authorize <strong>{settings?.agencyName || "your agency"}</strong> using your agency's configured App credentials.
            </DialogDescription>
          </DialogHeader>

          {!settings?.appConfigured ? (
            <div className="flex flex-col items-center text-center py-4 gap-3">
              <AlertCircle className="h-10 w-10 text-yellow-500" />
              <p className="text-sm text-muted-foreground">
                Your Facebook App is not configured yet. Complete the BYOC setup in Settings first.
              </p>
              <Button variant="outline" onClick={() => setIsConnectOpen(false)}>
                Go to Settings
              </Button>
            </div>
          ) : (
            <Tabs defaultValue="direct" className="mt-2">
              <TabsList className="w-full">
                <TabsTrigger value="direct" className="flex-1">Direct Connect</TabsTrigger>
                <TabsTrigger value="magic" className="flex-1">Magic Link</TabsTrigger>
              </TabsList>

              <TabsContent value="direct" className="mt-4">
                <div className="flex flex-col items-center text-center gap-4 py-2">
                  <div className="bg-primary/10 p-4 rounded-full">
                    <Facebook className="h-10 w-10 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Recommended if you are logged into Facebook in{" "}
                    <span className="font-semibold text-foreground">this browser</span>.
                  </p>
                  <Button className="w-full gap-2" onClick={() => { setIsConnectOpen(false); handleDirectConnect(); }}>
                    <Facebook className="h-4 w-4" />
                    Continue in This Browser
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="magic" className="mt-4">
                <div className="flex flex-col gap-4">
                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 font-medium mb-1">
                      <Link className="h-4 w-4 text-primary" />
                      Cross-Browser Connection
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use this link to reconnect Facebook accounts logged in on{" "}
                      <span className="font-medium text-foreground">other browsers or devices</span> without needing to log in to this website there.
                    </p>
                  </div>

                  {magicLinkUrl ? (
                    <div className="space-y-3">
                      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                        <p className="text-xs text-green-600 font-medium mb-2">Magic link generated — valid for 30 minutes</p>
                        <code className="text-xs break-all text-foreground/80">{magicLinkUrl}</code>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 gap-2" onClick={copyMagicLink}>
                          <Copy className="h-4 w-4" />
                          Copy Link
                        </Button>
                        <Button variant="outline" size="icon" asChild>
                          <a href={magicLinkUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-muted-foreground"
                        onClick={handleGenerateMagicLink}
                        disabled={generateMagicLink.isPending}
                      >
                        Generate New Link
                      </Button>
                    </div>
                  ) : (
                    <Button
                      className="w-full gap-2"
                      onClick={handleGenerateMagicLink}
                      disabled={generateMagicLink.isPending}
                    >
                      {generateMagicLink.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Link className="h-4 w-4" />
                      )}
                      Generate Secure Reconnection Link
                    </Button>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
