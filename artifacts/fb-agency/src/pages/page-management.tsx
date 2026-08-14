import { useState, useEffect } from "react";
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronRight, Search, FileText, Image as ImageIcon, Play, Film,
  Trash2, Loader2, Facebook, RefreshCw, Heart, MessageCircle,
  Share2, CheckCircle2, XCircle, Clock, AlertCircle,
  Users, SortDesc, SortAsc, Layers, CheckSquare,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManagedAccount {
  id: string;
  fbUserId: string;
  name: string;
  email: string | null;
  profilePicture: string | null;
  status: "connected" | "expired" | "error";
  pagesCount: number;
  connectedAt: string;
}

interface ManagedPage {
  id: string;
  fbPageId: string;
  name: string;
  category: string | null;
  profilePicture: string | null;
  followersCount: number;
  likesCount: number;
  totalPosts: number | null;
  automationEnabled: boolean;
  status: string;
}

interface Post {
  id: string;
  type: "text" | "image" | "video" | "reel";
  message: string;
  createdTime: string;
  thumbnail: string | null;
  likes: number;
  comments: number;
  shares: number;
}

interface PostsPage {
  posts: Post[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface DeletionLog {
  id: number;
  status: "success" | "error" | "info";
  message: string;
  postId: string | null;
  error: string | null;
  bulk: boolean;
  createdAt: string;
}

interface DeleteResult {
  success: number;
  failed: number;
  remaining: number;
  errors: { postId: string; error: string }[];
}

type DeleteAction =
  | { kind: "selected"; postIds: string[] }
  | { kind: "type"; deleteType: string; label: string }
  | { kind: "all" };

type PostsView = "posts" | "logs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

async function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("pf_auth_token");
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> ?? {}),
    },
  });
}

const POST_TYPE_LABELS: Record<string, string> = {
  text: "Text", image: "Image", video: "Video", reel: "Reel",
};

const POST_TYPE_ICONS: Record<string, React.ReactNode> = {
  text: <FileText className="h-3.5 w-3.5" />,
  image: <ImageIcon className="h-3.5 w-3.5" />,
  video: <Play className="h-3.5 w-3.5" />,
  reel: <Film className="h-3.5 w-3.5" />,
};

const POST_TYPE_COLORS: Record<string, string> = {
  text: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  image: "bg-green-500/10 text-green-600 border-green-500/20",
  video: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  reel: "bg-pink-500/10 text-pink-600 border-pink-500/20",
};

function formatDate(iso: string) {
  try { return format(parseISO(iso), "MMM d, yyyy · h:mm a"); } catch { return iso; }
}

function numFmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getConfirmText(action: DeleteAction, pageName: string): string {
  if (action.kind === "selected") {
    return `This will permanently delete ${action.postIds.length} selected post${action.postIds.length !== 1 ? "s" : ""} from "${pageName}". This cannot be undone.`;
  }
  if (action.kind === "type") {
    return `This will permanently delete ALL ${action.label.toLowerCase()} posts from "${pageName}". This cannot be undone.`;
  }
  return `This will permanently delete ALL posts from "${pageName}". This is irreversible. Proceed only if you are certain.`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PageManagement() {
  const [view, setView] = useState<"accounts" | "pages" | "posts">("accounts");
  const [selectedAccount, setSelectedAccount] = useState<ManagedAccount | null>(null);
  const [selectedPage, setSelectedPage] = useState<ManagedPage | null>(null);
  const [postsView, setPostsView] = useState<PostsView>("posts");

  // Post filters
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Dialogs
  const [confirmAction, setConfirmAction] = useState<DeleteAction | null>(null);
  const [deleteResult, setDeleteResult] = useState<DeleteResult | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Clear selection on filter/page change
  useEffect(() => {
    setSelected(new Set());
  }, [typeFilter, search, sort, selectedPage?.id]);

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const { data: accounts, isLoading: accountsLoading, refetch: refetchAccounts } = useQuery({
    queryKey: ["pm-accounts"],
    queryFn: async () => {
      const res = await authFetch(`${API}/post-manager/accounts`);
      if (!res.ok) throw new Error("Failed to load accounts");
      return res.json() as Promise<ManagedAccount[]>;
    },
  });

  const { data: pages, isLoading: pagesLoading, refetch: refetchPages } = useQuery({
    queryKey: ["pm-pages", selectedAccount?.id],
    queryFn: async () => {
      const res = await authFetch(`${API}/post-manager/accounts/${selectedAccount!.id}/pages`);
      if (!res.ok) throw new Error("Failed to load pages");
      return res.json() as Promise<ManagedPage[]>;
    },
    enabled: !!selectedAccount,
  });

  const postsQuery = useInfiniteQuery({
    queryKey: ["pm-posts", selectedPage?.id, typeFilter, search, sort],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ type: typeFilter, sort, limit: "25" });
      if (search) params.set("search", search);
      if (pageParam) params.set("cursor", String(pageParam));
      const res = await authFetch(`${API}/post-manager/pages/${selectedPage!.id}/posts?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to load posts" }));
        throw new Error(err.error || "Failed to load posts");
      }
      return res.json() as Promise<PostsPage>;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last: PostsPage) => last.hasMore ? last.nextCursor : undefined,
    enabled: !!selectedPage && postsView === "posts",
  });

  const { data: logs, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ["pm-logs", selectedPage?.id],
    queryFn: async () => {
      const res = await authFetch(`${API}/post-manager/pages/${selectedPage!.id}/deletion-logs`);
      if (!res.ok) throw new Error("Failed to load logs");
      return res.json() as Promise<DeletionLog[]>;
    },
    enabled: !!selectedPage && postsView === "logs",
  });

  const allPosts = postsQuery.data?.pages.flatMap((p) => p.posts) ?? [];
  const postsLoading = postsQuery.isLoading;
  const postsError = postsQuery.error as Error | null;

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const deleteSingle = useMutation({
    mutationFn: async ({ pageId, postId }: { pageId: string; postId: string }) => {
      const res = await authFetch(`${API}/post-manager/posts/${pageId}/${postId}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: "Delete failed" }));
        throw new Error(e.error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-posts", selectedPage?.id] });
      queryClient.invalidateQueries({ queryKey: ["pm-logs", selectedPage?.id] });
      toast({ title: "Post deleted" });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const bulkDelete = useMutation({
    mutationFn: async (body: object) => {
      setIsDeleting(true);
      const res = await authFetch(`${API}/post-manager/pages/${selectedPage!.id}/bulk-delete`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: "Delete failed" }));
        throw new Error(e.error);
      }
      return res.json() as Promise<DeleteResult>;
    },
    onSuccess: (data) => {
      setIsDeleting(false);
      setDeleteResult(data);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["pm-posts", selectedPage?.id] });
      queryClient.invalidateQueries({ queryKey: ["pm-logs", selectedPage?.id] });
    },
    onError: (err: Error) => {
      setIsDeleting(false);
      toast({ title: err.message, variant: "destructive" });
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function goToPages(account: ManagedAccount) {
    setSelectedAccount(account);
    setView("pages");
    setSelectedPage(null);
  }

  function goToPosts(page: ManagedPage) {
    setSelectedPage(page);
    setView("posts");
    setPostsView("posts");
    setTypeFilter("all");
    setSearchInput("");
    setSearch("");
    setSort("newest");
    setSelected(new Set());
    setDeleteResult(null);
  }

  function goToAccounts() {
    setView("accounts");
    setSelectedAccount(null);
    setSelectedPage(null);
  }

  function goToPagesList() {
    setView("pages");
    setSelectedPage(null);
  }

  function toggleSelect(postId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allPosts.every((p) => selected.has(p.id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allPosts.map((p) => p.id)));
    }
  }

  function handleDeleteSelected() {
    if (!selected.size) return;
    setConfirmAction({ kind: "selected", postIds: Array.from(selected) });
  }

  function handleDeleteType(deleteType: string, label: string) {
    setConfirmAction({ kind: "type", deleteType, label });
  }

  function handleDeleteAll() {
    setConfirmAction({ kind: "all" });
  }

  function confirmDelete() {
    if (!confirmAction || !selectedPage) return;
    let body: object = {};
    if (confirmAction.kind === "selected") body = { postIds: confirmAction.postIds };
    else if (confirmAction.kind === "type") body = { deleteType: confirmAction.deleteType };
    else body = { deleteType: "all" };
    setConfirmAction(null);
    bulkDelete.mutate(body);
  }

  // ---------------------------------------------------------------------------
  // Breadcrumb
  // ---------------------------------------------------------------------------

  function Breadcrumb() {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
        <button onClick={goToAccounts} className="hover:text-foreground transition-colors font-medium">
          Page Management
        </button>
        {selectedAccount && (
          <>
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
            <button
              onClick={view === "posts" ? goToPagesList : undefined}
              className={`hover:text-foreground transition-colors font-medium ${view === "posts" ? "cursor-pointer" : "text-foreground"}`}
            >
              {selectedAccount.name}
            </button>
          </>
        )}
        {selectedPage && (
          <>
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-foreground font-medium">{selectedPage.name}</span>
          </>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Accounts View
  // ---------------------------------------------------------------------------

  if (view === "accounts") {
    return (
      <Layout>
        <div className="flex flex-col gap-6">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Page Management</h1>
              <p className="text-muted-foreground mt-1">Select a Facebook account to manage its pages and posts.</p>
            </div>
            <Button variant="outline" onClick={() => refetchAccounts()} className="gap-2" size="sm">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          {accountsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
            </div>
          ) : !accounts?.length ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="bg-primary/10 p-4 rounded-full mb-4">
                <Facebook className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-bold mb-1">No Facebook Accounts Connected</h3>
              <p className="text-muted-foreground max-w-sm">Connect a Facebook account in FB Accounts to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map((acc) => (
                <Card
                  key={acc.id}
                  className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
                  onClick={() => goToPages(acc)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12 border shadow-sm">
                          <AvatarImage src={acc.profilePicture ?? undefined} />
                          <AvatarFallback className="text-sm font-bold bg-blue-500/10 text-blue-600">
                            {acc.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-sm leading-tight">{acc.name}</p>
                          <p className="text-xs text-muted-foreground">{acc.email ?? "No email"}</p>
                        </div>
                      </div>
                      {acc.status === "connected" ? (
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-[11px]">Connected</Badge>
                      ) : acc.status === "expired" ? (
                        <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-[11px]">Expired</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[11px]">Error</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground mb-0.5">Facebook ID</p>
                        <p className="font-mono font-medium text-[11px] truncate">{acc.fbUserId}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Pages</p>
                        <p className="font-semibold">{acc.pagesCount}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground mb-0.5">Connected</p>
                        <p className="font-medium">{formatDate(acc.connectedAt)}</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Click to view pages</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
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

  // ---------------------------------------------------------------------------
  // Pages View
  // ---------------------------------------------------------------------------

  if (view === "pages") {
    return (
      <Layout>
        <div className="flex flex-col gap-6">
          <Breadcrumb />
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{selectedAccount!.name}</h2>
              <p className="text-muted-foreground mt-0.5">Select a page to manage its posts.</p>
            </div>
            <Button variant="outline" onClick={() => refetchPages()} size="sm" className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          {pagesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
            </div>
          ) : !pages?.length ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="bg-primary/10 p-4 rounded-full mb-4">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-bold mb-1">No Pages Found</h3>
              <p className="text-muted-foreground max-w-sm">Sync pages for this account from FB Accounts → Sync Pages.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pages.map((page) => (
                <Card
                  key={page.id}
                  className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
                  onClick={() => goToPosts(page)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3 mb-4">
                      <Avatar className="h-12 w-12 border shadow-sm flex-shrink-0">
                        <AvatarImage src={page.profilePicture ?? undefined} />
                        <AvatarFallback className="text-sm font-bold">
                          {page.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-tight line-clamp-1">{page.name}</p>
                        <p className="text-xs text-muted-foreground">{page.category ?? "Facebook Page"}</p>
                        {page.automationEnabled && (
                          <Badge className="mt-1 text-[10px] bg-primary/10 text-primary border-primary/20">Automated</Badge>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="text-center p-2 rounded-lg bg-muted/40">
                        <p className="text-lg font-bold text-primary">{numFmt(page.followersCount)}</p>
                        <p className="text-muted-foreground mt-0.5">Followers</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/40">
                        <p className="text-lg font-bold">{numFmt(page.likesCount)}</p>
                        <p className="text-muted-foreground mt-0.5">Likes</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/40">
                        <p className="text-lg font-bold">{page.totalPosts != null ? numFmt(page.totalPosts) : "—"}</p>
                        <p className="text-muted-foreground mt-0.5">Posts</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Click to manage posts</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
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

  // ---------------------------------------------------------------------------
  // Posts View
  // ---------------------------------------------------------------------------

  const allSelected = allPosts.length > 0 && allPosts.every((p) => selected.has(p.id));
  const someSelected = allPosts.some((p) => selected.has(p.id));
  const selectedCount = selected.size;

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <Breadcrumb />

        {/* Page header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border shadow-sm flex-shrink-0">
              <AvatarImage src={selectedPage!.profilePicture ?? undefined} />
              <AvatarFallback className="text-sm font-bold">
                {selectedPage!.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-bold leading-tight">{selectedPage!.name}</h2>
              <p className="text-sm text-muted-foreground">{selectedPage!.category ?? "Facebook Page"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={postsView} onValueChange={(v: any) => setPostsView(v)}>
              <TabsList>
                <TabsTrigger value="posts">Posts</TabsTrigger>
                <TabsTrigger value="logs">Deletion Logs</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* POSTS TAB                                                         */}
        {/* ---------------------------------------------------------------- */}
        {postsView === "posts" && (
          <>
            {/* Filters bar */}
            <div className="flex flex-wrap items-center gap-3">
              <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v)}>
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs px-3 h-6">All</TabsTrigger>
                  <TabsTrigger value="text" className="text-xs px-3 h-6">Text</TabsTrigger>
                  <TabsTrigger value="image" className="text-xs px-3 h-6">Images</TabsTrigger>
                  <TabsTrigger value="video" className="text-xs px-3 h-6">Videos</TabsTrigger>
                  <TabsTrigger value="reel" className="text-xs px-3 h-6">Reels</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search posts..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>

              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">
                    <span className="flex items-center gap-1.5"><SortDesc className="h-3.5 w-3.5" />Newest</span>
                  </SelectItem>
                  <SelectItem value="oldest">
                    <span className="flex items-center gap-1.5"><SortAsc className="h-3.5 w-3.5" />Oldest</span>
                  </SelectItem>
                </SelectContent>
              </Select>

              {allPosts.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={toggleSelectAll}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  {allSelected ? "Deselect All" : "Select All"}
                </Button>
              )}
            </div>

            {/* Selection toolbar */}
            {someSelected && (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border bg-primary/5 border-primary/20">
                <span className="text-sm font-semibold text-primary">{selectedCount} selected</span>
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleDeleteSelected}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete Selected ({selectedCount})
                </Button>
              </div>
            )}

            {/* Error state */}
            {postsError && (() => {
              const msg = postsError.message ?? "";
              const isPermError =
                msg.includes("pages_read_engagement") ||
                msg.includes("pages_manage_posts") ||
                msg.includes("pages_read_user_content") ||
                msg.includes("pages_manage_metadata") ||
                msg.includes("(#10)") ||
                msg.includes("permission");

              if (isPermError) {
                return (
                  <div className="flex flex-col gap-3 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-yellow-700">Missing Facebook Permission</p>
                        <p className="text-xs text-yellow-600 mt-0.5">
                          {msg.includes("pages_read_engagement")
                            ? "The \"pages_read_engagement\" permission is required to load posts."
                            : msg.includes("pages_manage_posts")
                            ? "The \"pages_manage_posts\" permission is required to manage posts."
                            : msg.includes("pages_read_user_content")
                            ? "The \"pages_read_user_content\" permission is required to read page content."
                            : msg.includes("pages_manage_metadata")
                            ? "The \"pages_manage_metadata\" permission is required."
                            : "One or more required Facebook permissions are missing."}
                        </p>
                        <p className="text-xs text-yellow-600 mt-1">
                          Go to <strong>FB Accounts</strong> and click{" "}
                          <strong>Reconnect Facebook Account</strong> to grant all required permissions.
                        </p>
                      </div>
                    </div>
                    <a
                      href={`${BASE}/accounts`}
                      className="inline-flex items-center justify-center gap-2 rounded-md text-xs font-medium h-8 px-3 bg-yellow-500 hover:bg-yellow-600 text-white transition-colors w-fit"
                    >
                      Go to FB Accounts → Reconnect
                    </a>
                  </div>
                );
              }

              return (
                <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{msg}</span>
                </div>
              );
            })()}

            {/* Posts grid */}
            {postsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-52 rounded-xl" />
                ))}
              </div>
            ) : !allPosts.length && !postsError ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="bg-muted p-4 rounded-full mb-3">
                  <Layers className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="font-semibold">No posts found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {typeFilter !== "all" || search ? "Try clearing the filter or search." : "This page has no posts yet."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {allPosts.map((post) => {
                  const isSelected = selected.has(post.id);
                  return (
                    <Card
                      key={post.id}
                      className={`relative transition-all cursor-pointer ${isSelected ? "border-primary ring-1 ring-primary/30 bg-primary/3" : "hover:shadow-sm"}`}
                      onClick={() => toggleSelect(post.id)}
                    >
                      {/* Checkbox */}
                      <div
                        className="absolute top-2.5 left-2.5 z-10"
                        onClick={(e) => { e.stopPropagation(); toggleSelect(post.id); }}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? "bg-primary border-primary" : "bg-background border-muted-foreground/40 hover:border-primary"}`}>
                          {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground" />}
                        </div>
                      </div>

                      {/* Thumbnail */}
                      {post.thumbnail ? (
                        <div className="h-36 rounded-t-lg overflow-hidden bg-muted">
                          <img
                            src={post.thumbnail}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        </div>
                      ) : (
                        <div className="h-28 rounded-t-lg bg-muted/50 flex items-center justify-center">
                          <div className="text-muted-foreground/40">
                            {POST_TYPE_ICONS[post.type]}
                          </div>
                        </div>
                      )}

                      <CardContent className="p-3 space-y-2">
                        {/* Type + Date */}
                        <div className="flex items-center justify-between gap-2">
                          <Badge className={`text-[10px] px-1.5 py-0 gap-1 ${POST_TYPE_COLORS[post.type]}`}>
                            {POST_TYPE_ICONS[post.type]}
                            {POST_TYPE_LABELS[post.type]}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(parseISO(post.createdTime), "MMM d, yyyy")}
                          </span>
                        </div>

                        {/* Caption */}
                        {post.message && (
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{post.message}</p>
                        )}

                        {/* Stats */}
                        <div className="flex items-center gap-3 pt-1 border-t">
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Heart className="h-3 w-3" />{numFmt(post.likes)}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <MessageCircle className="h-3 w-3" />{numFmt(post.comments)}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Share2 className="h-3 w-3" />{numFmt(post.shares)}
                          </span>
                          <div className="flex-1" />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!selectedPage) return;
                              if (window.confirm(`Delete this post? This cannot be undone.`)) {
                                deleteSingle.mutate({ pageId: selectedPage.id, postId: post.id });
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Load More */}
            {postsQuery.hasNextPage && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  onClick={() => postsQuery.fetchNextPage()}
                  disabled={postsQuery.isFetchingNextPage}
                  className="gap-2"
                >
                  {postsQuery.isFetchingNextPage
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Loading...</>
                    : "Load More Posts"}
                </Button>
              </div>
            )}

            {/* Bulk delete actions */}
            {!postsLoading && (
              <div className="mt-2 p-4 rounded-xl border bg-card space-y-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-destructive" />
                  Bulk Delete Actions
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 text-muted-foreground hover:text-destructive hover:border-destructive/50"
                    onClick={() => handleDeleteType("text", "Text")}
                  >
                    <FileText className="h-3 w-3 mr-1.5" />Delete All Text Posts
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 text-muted-foreground hover:text-destructive hover:border-destructive/50"
                    onClick={() => handleDeleteType("image", "Image")}
                  >
                    <ImageIcon className="h-3 w-3 mr-1.5" />Delete All Image Posts
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 text-muted-foreground hover:text-destructive hover:border-destructive/50"
                    onClick={() => handleDeleteType("video", "Video")}
                  >
                    <Play className="h-3 w-3 mr-1.5" />Delete All Video Posts
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 text-muted-foreground hover:text-destructive hover:border-destructive/50"
                    onClick={() => handleDeleteType("reel", "Reel")}
                  >
                    <Film className="h-3 w-3 mr-1.5" />Delete All Reel Posts
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="text-xs h-7"
                    onClick={handleDeleteAll}
                  >
                    <Trash2 className="h-3 w-3 mr-1.5" />Delete ALL Posts
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* LOGS TAB                                                          */}
        {/* ---------------------------------------------------------------- */}
        {postsView === "logs" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{logs?.length ?? 0} deletion records</p>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => refetchLogs()}>
                <RefreshCw className="h-3 w-3" />Refresh
              </Button>
            </div>

            {logsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : !logs?.length ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="bg-muted p-4 rounded-full mb-3">
                  <Clock className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="font-semibold">No deletion logs yet</p>
                <p className="text-sm text-muted-foreground mt-1">Logs appear here after posts are deleted.</p>
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Status</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Post ID</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground hidden md:table-cell">Type</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Message</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground hidden lg:table-cell">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5">
                          {log.status === "success"
                            ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                            : <XCircle className="h-4 w-4 text-red-500" />}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                          {log.postId ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          <Badge variant="outline" className="text-[10px]">
                            {log.bulk ? "Bulk" : "Single"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-xs max-w-xs truncate text-muted-foreground">
                          {log.error ? (
                            <span className="text-red-500">{log.error}</span>
                          ) : log.message}
                        </td>
                        <td className="px-4 py-2.5 text-[11px] text-muted-foreground whitespace-nowrap hidden lg:table-cell">
                          {formatDate(log.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Confirmation Dialog                                                 */}
      {/* ------------------------------------------------------------------ */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              {confirmAction?.kind === "all"
                ? "Delete ALL Posts?"
                : confirmAction?.kind === "type"
                ? `Delete All ${confirmAction.label} Posts?`
                : `Delete ${confirmAction?.postIds.length} Post${(confirmAction?.postIds.length ?? 0) !== 1 ? "s" : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              {confirmAction && selectedPage && getConfirmText(confirmAction, selectedPage.name)}
              {confirmAction?.kind === "all" && (
                <span className="block mt-2 text-destructive font-medium">
                  ⚠ This will attempt to delete up to 500 posts at a time. Large pages may need multiple runs.
                </span>
              )}
              {confirmAction?.kind === "type" && (
                <span className="block mt-2 text-muted-foreground">
                  Up to 500 matching posts will be deleted. Run again for more.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Yes, Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ------------------------------------------------------------------ */}
      {/* Deleting Progress Dialog                                            */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={isDeleting} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Deleting Posts…
            </DialogTitle>
            <DialogDescription>
              Posts are being deleted one by one with rate-limit protection. This may take a few minutes for large batches. Please keep this window open.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* Results Dialog                                                      */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={!!deleteResult} onOpenChange={(open) => { if (!open) setDeleteResult(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Deletion Complete</DialogTitle>
          </DialogHeader>
          {deleteResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <p className="text-2xl font-bold text-green-600">{deleteResult.success}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Deleted</p>
                </div>
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-2xl font-bold text-red-600">{deleteResult.failed}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Failed</p>
                </div>
                <div className="p-3 rounded-xl bg-muted border">
                  <p className="text-2xl font-bold text-muted-foreground">{deleteResult.remaining}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Remaining</p>
                </div>
              </div>
              {deleteResult.errors.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">Failed posts:</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {deleteResult.errors.map((e) => (
                      <div key={e.postId} className="text-xs p-2 rounded bg-muted/50 border">
                        <span className="font-mono text-muted-foreground">{e.postId}:</span>{" "}
                        <span className="text-red-500">{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDeleteResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
