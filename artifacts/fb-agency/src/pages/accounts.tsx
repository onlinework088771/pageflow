import { useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useListAccounts, getListAccountsQueryKey, useDeleteAccount, useSyncAccountPages } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Facebook, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Accounts() {
  const { data: accounts, isLoading } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });
  const deleteAccount = useDeleteAccount();
  const syncPages = useSyncAccountPages();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location] = useLocation();

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
      };
      toast({
        title: "Facebook connection failed",
        description: messages[fbError] ?? fbError,
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  function handleConnectFacebook() {
    const token = localStorage.getItem("pf_auth_token");
    window.location.href = `${BASE}/api/auth/facebook?token=${encodeURIComponent(token ?? "")}`;
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
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Facebook Accounts</h1>
            <p className="text-muted-foreground mt-1">Manage the Facebook accounts connected to your agency.</p>
          </div>

          <Button className="gap-2" onClick={handleConnectFacebook}>
            <Plus className="h-4 w-4" />
            Connect Account
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
              <Button onClick={handleConnectFacebook} className="gap-2">
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
    </Layout>
  );
}
