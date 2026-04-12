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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-15%] left-[50%] -translate-x-1/2 w-[700px] h-[400px] bg-violet-600/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[20%] w-[400px] h-[300px] bg-indigo-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <PageFlowLogo size="lg" variant="dark" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Create your agency</h1>
          <p className="text-gray-400 mt-1.5 text-sm">Set up PageFlow for your team in minutes</p>
        </div>

        <div
          className="rounded-2xl p-[1px]"
          style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.4) 0%, rgba(99,102,241,0.15) 50%, rgba(255,255,255,0.05) 100%)" }}
        >
          <div className="bg-gray-900/95 backdrop-blur-sm rounded-2xl p-6 sm:p-7">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-gray-300 text-sm font-medium">Your Name</Label>
                  <Input
                    id="name"
                    placeholder="Jane Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="bg-gray-800/80 border-gray-700/70 text-white placeholder-gray-500 focus:border-violet-500 focus:ring-violet-500/20 h-11 rounded-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agencyName" className="text-gray-300 text-sm font-medium">Agency Name</Label>
                  <Input
                    id="agencyName"
                    placeholder="Acme Agency"
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    required
                    className="bg-gray-800/80 border-gray-700/70 text-white placeholder-gray-500 focus:border-violet-500 focus:ring-violet-500/20 h-11 rounded-lg"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-300 text-sm font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@agency.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-gray-800/80 border-gray-700/70 text-white placeholder-gray-500 focus:border-violet-500 focus:ring-violet-500/20 h-11 rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-300 text-sm font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-gray-800/80 border-gray-700/70 text-white placeholder-gray-500 focus:border-violet-500 focus:ring-violet-500/20 h-11 rounded-lg"
                />
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 rounded-lg font-semibold text-white shadow-lg shadow-violet-900/30 transition-all duration-200 hover:shadow-violet-700/40 hover:scale-[1.01] active:scale-[0.99]"
                style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }}
              >
                {isLoading ? "Creating account..." : "Create account"}
              </Button>
            </form>

            <p className="text-center text-gray-500 text-sm mt-5">
              Already have an account?{" "}
              <Link href="/login" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
