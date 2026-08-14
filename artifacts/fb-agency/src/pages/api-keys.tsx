import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { KeyRound, Plus, Copy, Trash2, Loader2, Code2 } from "lucide-react";
import { authFetch, apiUrl } from "@/components/schedule-management-utils";

// Phase 7 — Public API keys (Agency plan only). Backend: routes/api-keys.ts (management)
// and routes/public-api.ts (the actual /v1/* endpoints these keys unlock).

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt?: string;
  revoked: boolean;
  createdAt: string;
}

async function fetchKeys(): Promise<ApiKey[]> {
  const res = await authFetch(apiUrl("/api-keys"));
  if (!res.ok) throw new Error("Failed to load API keys");
  return res.json();
}

export default function ApiKeys() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["api-keys"], queryFn: fetchKeys });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  async function create() {
    if (!name) return;
    setCreating(true);
    try {
      const res = await authFetch(apiUrl("/api-keys"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to create key");
      setNewKey(body.key);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    } catch (err: any) {
      toast({ title: "Couldn't create key", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    const res = await authFetch(apiUrl(`/api-keys/${id}`), { method: "DELETE" });
    if (res.ok || res.status === 204) {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "Key revoked" });
    } else {
      const body = await res.json().catch(() => ({}));
      toast({ title: "Couldn't revoke key", description: body.error, variant: "destructive" });
    }
  }

  function closeDialog(o: boolean) {
    setOpen(o);
    if (!o) { setName(""); setNewKey(null); }
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <KeyRound className="h-7 w-7 text-primary" />
              API Keys
            </h1>
            <p className="text-muted-foreground mt-1">Let external tools read your pages/analytics and schedule videos (Agency plan).</p>
          </div>
          <Dialog open={open} onOpenChange={closeDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" />New Key</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create an API key</DialogTitle>
                <DialogDescription>The full key is shown once — copy it somewhere safe.</DialogDescription>
              </DialogHeader>
              {!newKey ? (
                <div className="space-y-1.5 py-2">
                  <Label>Key name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zapier integration" />
                </div>
              ) : (
                <div className="space-y-2 py-2">
                  <code className="block text-xs bg-muted px-3 py-3 rounded border break-all">{newKey}</code>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => { navigator.clipboard.writeText(newKey); toast({ title: "Copied" }); }}>
                    <Copy className="w-3.5 h-3.5" />Copy
                  </Button>
                </div>
              )}
              <DialogFooter>
                {!newKey ? (
                  <Button onClick={create} disabled={!name || creating} className="gap-2">
                    {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                    Create
                  </Button>
                ) : (
                  <Button onClick={() => closeDialog(false)}>Done</Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {data?.map((k) => (
                  <div key={k.id} className="flex items-center justify-between px-6 py-4 gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-medium">{k.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{k.keyPrefix}••••••••</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {k.revoked ? <Badge variant="outline">Revoked</Badge> : <Badge variant="secondary">Active</Badge>}
                      {!k.revoked && (
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => revoke(k.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {!data?.length && (
                  <div className="px-6 py-10 text-center text-sm text-muted-foreground">No API keys yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Code2 className="w-4 h-4" />Available Endpoints
            </CardTitle>
            <CardDescription>Send your key in an <code className="text-xs">X-API-Key</code> header.</CardDescription>
          </CardHeader>
          <CardContent className="text-xs font-mono space-y-1.5 text-muted-foreground">
            <p>GET /api/v1/pages</p>
            <p>GET /api/v1/analytics</p>
            <p>GET /api/v1/automation-logs</p>
            <p>GET /api/v1/youtube/channels</p>
            <p>PATCH /api/v1/pages/:id/automation</p>
            <p>POST /api/v1/scheduled-videos</p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
