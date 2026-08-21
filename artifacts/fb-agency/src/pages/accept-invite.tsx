import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageFlowLogo } from "@/components/pageflow-logo";
import { Loader2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface InvitePreview {
  email: string;
  role: string;
  agencyName: string;
  needsPassword: boolean;
}

// Phase 7 — public page for accepting a team invite (token-based, no login required first).
export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/team/invite/${token}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Invalid invite");
        setPreview(body);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/api/team/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to accept invite");
      login(body.token, body.user);
      toast({ title: "Welcome to the team!" });
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Couldn't accept invite", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden bg-[radial-gradient(900px_520px_at_75%_-10%,hsl(var(--primary)/0.14),transparent_60%)]">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-15%] right-[-5%] h-[440px] w-[500px] rounded-full bg-[hsl(var(--primary)/0.14)] blur-[120px]" />
      </div>
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5"><PageFlowLogo size="xl" variant="dark" /></div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Join {preview?.agencyName ?? "the team"}</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">{preview ? `Invited as ${preview.email} (${preview.role})` : "Checking your invite..."}</p>
        </div>

        <div className="rounded-2xl p-[1px]" style={{ background: "linear-gradient(135deg, hsl(var(--primary)/0.5) 0%, hsl(217 85% 55%/0.22) 50%, hsl(var(--border)/0.4) 100%)" }}>
          <div className="bg-card/95 backdrop-blur-sm rounded-2xl p-6 sm:p-7 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.7)]">
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            {!error && !preview && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /></div>}
            {preview && !error && (
              <form onSubmit={handleAccept} className="space-y-4">
                {preview.needsPassword && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-foreground/85 text-sm font-medium">Your Name</Label>
                      <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-foreground/85 text-sm font-medium">Create a Password</Label>
                      <Input id="password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                  </>
                )}
                {!preview.needsPassword && (
                  <p className="text-sm text-muted-foreground">You already have a PageFlow account — accepting will link this team to it.</p>
                )}
                <Button type="submit" disabled={submitting} className="w-full gap-2">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Join Team
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
