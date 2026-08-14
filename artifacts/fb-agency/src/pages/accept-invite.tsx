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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-15%] left-[50%] -translate-x-1/2 w-[700px] h-[400px] bg-violet-600/15 rounded-full blur-[120px]" />
      </div>
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5"><PageFlowLogo size="xl" variant="dark" /></div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Join {preview?.agencyName ?? "the team"}</h1>
          <p className="text-gray-400 mt-1.5 text-sm">{preview ? `Invited as ${preview.email} (${preview.role})` : "Checking your invite..."}</p>
        </div>

        <div className="rounded-2xl p-[1px]" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.4) 0%, rgba(99,102,241,0.15) 50%, rgba(255,255,255,0.05) 100%)" }}>
          <div className="bg-gray-900/95 backdrop-blur-sm rounded-2xl p-6 sm:p-7">
            {error && <p className="text-sm text-red-400 text-center">{error}</p>}
            {!error && !preview && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-gray-400 animate-spin" /></div>}
            {preview && !error && (
              <form onSubmit={handleAccept} className="space-y-4">
                {preview.needsPassword && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-gray-300 text-sm font-medium">Your Name</Label>
                      <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required className="bg-gray-800/50 border-gray-700 text-white" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-gray-300 text-sm font-medium">Create a Password</Label>
                      <Input id="password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-gray-800/50 border-gray-700 text-white" />
                    </div>
                  </>
                )}
                {!preview.needsPassword && (
                  <p className="text-sm text-gray-400">You already have a PageFlow account — accepting will link this team to it.</p>
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
