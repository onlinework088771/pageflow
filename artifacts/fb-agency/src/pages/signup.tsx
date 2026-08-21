import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageFlowLogo } from "@/components/pageflow-logo";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Signup() {
  const [name, setName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Weak password", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, agencyName, email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Signup failed", description: data.error ?? "Something went wrong.", variant: "destructive" });
        return;
      }

      login(data.token, data.user);
      toast({ title: "Account created!", description: `Welcome to PageFlow, ${data.user.name}.` });
      setLocation("/");
    } catch {
      toast({ title: "Network error", description: "Could not connect to server.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden bg-[radial-gradient(900px_520px_at_75%_-10%,hsl(var(--primary)/0.14),transparent_60%)]">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-15%] right-[-5%] h-[480px] w-[520px] rounded-full bg-[hsl(var(--primary)/0.14)] blur-[120px]" />
        <div className="absolute bottom-[-12%] left-[15%] h-[380px] w-[380px] rounded-full bg-[hsl(210_80%_55%/0.10)] blur-[110px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <PageFlowLogo size="xl" variant="dark" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Create your agency</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">Set up PageFlow for your team in minutes</p>
        </div>

        <div
          className="rounded-2xl p-[1px]"
          style={{ background: "linear-gradient(135deg, hsl(var(--primary)/0.5) 0%, hsl(217 85% 55%/0.22) 50%, hsl(var(--border)/0.4) 100%)" }}
        >
          <div className="bg-card/95 backdrop-blur-sm rounded-2xl p-6 sm:p-7 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.7)]">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-foreground/85 text-sm font-medium">Your Name</Label>
                  <Input
                    id="name"
                    placeholder="Jane Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-11 rounded-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agencyName" className="text-foreground/85 text-sm font-medium">Agency Name</Label>
                  <Input
                    id="agencyName"
                    placeholder="Acme Agency"
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    required
                    className="h-11 rounded-lg"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground/85 text-sm font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@agency.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground/85 text-sm font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 rounded-lg"
                />
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 rounded-lg font-semibold text-white shadow-[0_10px_30px_-8px_hsl(var(--primary)/0.5)] transition-all duration-200 hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.6),0_14px_36px_-10px_hsl(var(--primary)/0.65)] active:scale-[0.99]"
                style={{ background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" }}
              >
                {isLoading ? "Creating account..." : "Create account"}
              </Button>
            </form>

            <p className="text-center text-muted-foreground text-sm mt-5">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
