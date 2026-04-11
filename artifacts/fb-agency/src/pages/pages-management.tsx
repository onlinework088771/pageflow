import { useState } from "react";
import { Layout } from "@/components/layout";
import { useListPages, getListPagesQueryKey, useCreatePage, useDeletePage, useUpdatePage, useListAccounts, getListAccountsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Files, Filter, Play, Pause, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function PagesManagement() {
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  
  const { data: pages, isLoading } = useListPages({ status: statusFilter }, { query: { queryKey: getListPagesQueryKey({ status: statusFilter }) } });
  const { data: accounts } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });
  
  const createPage = useCreatePage();
  const deletePage = useDeletePage();
  const updatePage = useUpdatePage();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", fbPageId: "", accountId: "", postingFrequency: "daily" as any, category: "" });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    createPage.mutate(
      { data: formData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() });
          toast({ title: "Page added successfully" });
          setIsAddOpen(false);
          setFormData({ name: "", fbPageId: "", accountId: "", postingFrequency: "daily", category: "" });
        },
        onError: () => {
          toast({ title: "Failed to add page", variant: "destructive" });
        }
      }
    );
  };

  const handleDelete = (id: string) => {
    deletePage.mutate(
      { pageId: id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() });
          toast({ title: "Page removed" });
        },
      }
    );
  };

  const handleToggleAutomation = (id: string, enabled: boolean) => {
    updatePage.mutate(
      { pageId: id, data: { automationEnabled: enabled, status: enabled ? "active" : "paused" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() });
          toast({ title: `Automation ${enabled ? 'enabled' : 'paused'}` });
        },
      }
    );
  };

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Pages</h1>
            <p className="text-muted-foreground mt-1">Manage and monitor automation for your Facebook pages.</p>
          </div>
          
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Page
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Facebook Page</DialogTitle>
                <DialogDescription>
                  Enter the details of the Facebook page to automate.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Page Name</Label>
                  <Input id="name" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Awesome Agency Page" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fbPageId">Facebook Page ID</Label>
                  <Input id="fbPageId" required value={formData.fbPageId} onChange={e => setFormData({ ...formData, fbPageId: e.target.value })} placeholder="1029384756" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input id="category" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} placeholder="Marketing Agency" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountId">Facebook Account</Label>
                  <Select value={formData.accountId} onValueChange={(val) => setFormData({ ...formData, accountId: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select connected account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts?.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postingFrequency">Posting Frequency</Label>
                  <Select value={formData.postingFrequency} onValueChange={(val: any) => setFormData({ ...formData, postingFrequency: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="twice_daily">Twice Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createPage.isPending}>Add Page</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader className="p-0 border-b">
            <Tabs value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <div className="px-6 pt-4 flex items-center justify-between">
                <TabsList className="bg-transparent space-x-2">
                  <TabsTrigger value="all" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md px-4">All Pages</TabsTrigger>
                  <TabsTrigger value="active" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md px-4">Active</TabsTrigger>
                  <TabsTrigger value="paused" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md px-4">Paused</TabsTrigger>
                </TabsList>
              </div>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : !pages?.length ? (
              <div className="flex flex-col items-center justify-center p-16 text-center">
                <div className="bg-primary/10 p-4 rounded-full mb-4">
                  <Files className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-1">No Pages Found</h3>
                <p className="text-muted-foreground max-w-sm mb-6">
                  {statusFilter === "all" ? "You haven't added any pages yet." : `You don't have any ${statusFilter} pages.`}
                </p>
                {statusFilter === "all" && (
                  <Button onClick={() => setIsAddOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add First Page
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Page</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Last Posted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Automation</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map(page => (
                    <TableRow key={page.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border shadow-sm">
                            <AvatarImage src={page.profilePicture} />
                            <AvatarFallback>{page.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-semibold text-sm">{page.name}</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              ID: {page.fbPageId} 
                              <ExternalLink className="h-3 w-3 inline" />
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{page.category || "—"}</TableCell>
                      <TableCell>
                        <span className="capitalize text-sm font-medium">{page.postingFrequency?.replace('_', ' ')}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {page.lastPostedAt ? format(new Date(page.lastPostedAt), "MMM d, h:mm a") : "Never"}
                      </TableCell>
                      <TableCell>
                        {page.status === "active" ? (
                          <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20">Active</Badge>
                        ) : page.status === "paused" ? (
                          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 border-yellow-500/20">Paused</Badge>
                        ) : (
                          <Badge variant="destructive" className="bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-500/20">Error</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch 
                          checked={page.automationEnabled}
                          onCheckedChange={(c) => handleToggleAutomation(page.id, c)}
                          disabled={updatePage.isPending}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDelete(page.id)}
                          disabled={deletePage.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
