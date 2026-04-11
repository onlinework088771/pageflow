import { useState } from "react";
import { Layout } from "@/components/layout";
import { useListAccounts, getListAccountsQueryKey, useCreateAccount, useDeleteAccount } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Facebook, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Accounts() {
  const { data: accounts, isLoading } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });
  const createAccount = useCreateAccount();
  const deleteAccount = useDeleteAccount();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", fbUserId: "", accessToken: "" });

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    createAccount.mutate(
      { data: formData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
          toast({ title: "Account connected successfully" });
          setIsConnectOpen(false);
          setFormData({ name: "", email: "", fbUserId: "", accessToken: "" });
        },
        onError: () => {
          toast({ title: "Failed to connect account", variant: "destructive" });
        }
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteAccount.mutate(
      { accountId: id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
          toast({ title: "Account disconnected" });
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
          
          <Dialog open={isConnectOpen} onOpenChange={setIsConnectOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Connect Account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Connect Facebook Account</DialogTitle>
                <DialogDescription>
                  Enter the details of the Facebook account you want to connect.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleConnect} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="john@example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fbUserId">Facebook User ID</Label>
                  <Input id="fbUserId" required value={formData.fbUserId} onChange={e => setFormData({ ...formData, fbUserId: e.target.value })} placeholder="1234567890" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accessToken">Access Token</Label>
                  <Input id="accessToken" type="password" required value={formData.accessToken} onChange={e => setFormData({ ...formData, accessToken: e.target.value })} placeholder="EAA..." />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsConnectOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createAccount.isPending}>Connect</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
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
                Connect a Facebook account to start managing pages and automating posts.
              </p>
              <Button onClick={() => setIsConnectOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Connect First Account
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map(account => (
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
                      <p className="font-medium">{account.pagesCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Status</p>
                      {account.status === "connected" ? (
                        <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20">Connected</Badge>
                      ) : account.status === "expired" ? (
                        <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 border-yellow-500/20">Token Expired</Badge>
                      ) : (
                        <Badge variant="destructive" className="bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-500/20">Error</Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-4 text-xs text-muted-foreground flex items-center justify-between">
                    <span>ID: {account.fbUserId}</span>
                    <span>Added {format(new Date(account.connectedAt), "MMM d, yyyy")}</span>
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
