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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Users, UserPlus, Copy, Trash2, ShieldCheck, Eye, Loader2, Crown } from "lucide-react";
import { authFetch, apiUrl } from "@/components/schedule-management-utils";

// Phase 7 — Team members. Independent of Facebook/YouTube logic; only manages
// who can log in and see this agency's shared dashboard data.

interface Member {
  id: string;
  email: string;
  role: "admin" | "member";
  status: "invited" | "active";
  invitedAt: string;
  acceptedAt?: string;
}

async function fetchTeam(): Promise<{ role: string; members: Member[] }> {
  const res = await authFetch(apiUrl("/team"));
  if (!res.ok) throw new Error("Failed to load team");
  return res.json();
}

export default function Team() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["team"], queryFn: fetchTeam });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const canManage = data?.role === "owner" || data?.role === "admin";

  async function invite() {
    if (!email) return;
    setInviting(true);
    try {
      const res = await authFetch(apiUrl("/team/invite"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to invite");
      setInviteLink(body.inviteLink);
      queryClient.invalidateQueries({ queryKey: ["team"] });
      toast({ title: "Invite created", description: `Share the link with ${email}` });
    } catch (err: any) {
      toast({ title: "Couldn't send invite", description: err.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  }

  async function removeMember(id: string) {
    const res = await authFetch(apiUrl(`/team/${id}`), { method: "DELETE" });
    if (res.ok || res.status === 204) {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      toast({ title: "Removed from team" });
    } else {
      const body = await res.json().catch(() => ({}));
      toast({ title: "Couldn't remove", description: body.error, variant: "destructive" });
    }
  }

  async function changeRole(id: string, newRole: "admin" | "member") {
    const res = await authFetch(apiUrl(`/team/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["team"] });
    } else {
      const body = await res.json().catch(() => ({}));
      toast({ title: "Couldn't update role", description: body.error, variant: "destructive" });
    }
  }

  function closeInviteDialog(open: boolean) {
    setInviteOpen(open);
    if (!open) { setEmail(""); setRole("member"); setInviteLink(null); }
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <Users className="h-7 w-7 text-primary" />
              Team
            </h1>
            <p className="text-muted-foreground mt-1">Invite people to share this agency's dashboard, pages, and channels.</p>
          </div>
          {canManage && (
            <Dialog open={inviteOpen} onOpenChange={closeInviteDialog}>
              <DialogTrigger asChild>
                <Button className="gap-2"><UserPlus className="w-4 h-4" />Invite Member</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite a team member</DialogTitle>
                  <DialogDescription>They'll get full access to your Facebook pages and YouTube channels based on their role.</DialogDescription>
                </DialogHeader>
                {!inviteLink ? (
                  <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" type="email" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Role</Label>
                      <Select value={role} onValueChange={(v) => setRole(v as "admin" | "member")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member — view + post, no settings/team changes</SelectItem>
                          <SelectItem value="admin">Admin — everything except billing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 py-2">
                    <p className="text-sm text-muted-foreground">Share this link with {email} — it lets them set up their login and join instantly.</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-muted px-3 py-2 rounded border break-all">{inviteLink}</code>
                      <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(inviteLink); toast({ title: "Copied" }); }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  {!inviteLink ? (
                    <Button onClick={invite} disabled={!email || inviting} className="gap-2">
                      {inviting && <Loader2 className="w-4 h-4 animate-spin" />}
                      Create Invite
                    </Button>
                  ) : (
                    <Button onClick={() => closeInviteDialog(false)}>Done</Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Members ({(data?.members.length ?? 0) + 1})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                <div className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center"><Crown className="w-4 h-4 text-primary" /></div>
                    <div>
                      <p className="text-sm font-medium">You (Owner)</p>
                      <p className="text-xs text-muted-foreground">Full access, including billing</p>
                    </div>
                  </div>
                  <Badge variant="secondary">Owner</Badge>
                </div>
                {data?.members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-6 py-4 gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        {m.role === "admin" ? <ShieldCheck className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{m.email}</p>
                        <p className="text-xs text-muted-foreground">{m.status === "invited" ? "Invite pending" : "Active"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {canManage ? (
                        <Select value={m.role} onValueChange={(v) => changeRole(m.id, v as "admin" | "member")}>
                          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className="capitalize">{m.role}</Badge>
                      )}
                      {canManage && (
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => removeMember(m.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {!data?.members.length && (
                  <div className="px-6 py-10 text-center text-sm text-muted-foreground">No team members yet — invite someone to get started.</div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
