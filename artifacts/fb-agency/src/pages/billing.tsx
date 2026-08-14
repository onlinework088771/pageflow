import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Check, Facebook, Youtube, Layers, Loader2 } from "lucide-react";
import { authFetch, apiUrl } from "@/components/schedule-management-utils";
import { useAuth } from "@/contexts/auth-context";

// Phase 7 — Billing. No payment processor is connected (Stripe was offered and
// declined), so switching plans here is immediate/manual. It still fully
// drives feature gating everywhere else (connecting FB/YouTube, team size, API keys).

interface PlanDetail {
  plan: string;
  label: string;
  priceMonthly: number;
  facebook: boolean;
  youtube: boolean;
  teamMembers: number;
  apiKeys: boolean;
}

interface BillingData {
  plan: string;
  status: string;
  priceMonthly: number;
  limits: { facebook: boolean; youtube: boolean; teamMembers: number; apiKeys: boolean };
  usage: { facebookAccounts: number; facebookPages: number; youtubeAccounts: number; teamMembers: number };
  availablePlans: PlanDetail[];
  paymentsConnected: boolean;
}

async function fetchBilling(): Promise<BillingData> {
  const res = await authFetch(apiUrl("/billing"));
  if (!res.ok) throw new Error("Failed to load billing info");
  return res.json();
}

const PLAN_ICON: Record<string, any> = { free: Layers, facebook: Facebook, youtube: Youtube, agency: Layers };

export default function Billing() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["billing"], queryFn: fetchBilling });
  const [switching, setSwitching] = useState<string | null>(null);

  const isOwner = user?.role !== "member"; // team members always resolve to scoped owner data; billing route itself 403s non-owners server-side too

  async function changePlan(plan: string) {
    setSwitching(plan);
    try {
      const res = await authFetch(apiUrl("/billing/change-plan"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to change plan");
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      toast({ title: `Switched to the ${body.plan} plan` });
    } catch (err: any) {
      toast({ title: "Couldn't change plan", description: err.message, variant: "destructive" });
    } finally {
      setSwitching(null);
    }
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <CreditCard className="h-7 w-7 text-primary" />
            Billing
          </h1>
          <p className="text-muted-foreground mt-1">Choose the plan that matches which platforms you automate.</p>
        </div>

        {!data?.paymentsConnected && !isLoading && (
          <div className="text-xs text-muted-foreground bg-muted/40 border rounded-xl px-4 py-3">
            No payment processor is connected yet, so plan changes take effect immediately without a card charge.
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {data?.availablePlans.map((p) => {
                const Icon = PLAN_ICON[p.plan] ?? Layers;
                const isCurrent = data.plan === p.plan;
                return (
                  <Card key={p.plan} className={isCurrent ? "border-primary shadow-md ring-1 ring-primary/30" : ""}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center"><Icon className="w-4 h-4 text-primary" /></div>
                        {isCurrent && <Badge>Current</Badge>}
                      </div>
                      <CardTitle className="capitalize mt-2">{p.plan}</CardTitle>
                      <CardDescription>
                        <span className="text-2xl font-bold text-foreground">${p.priceMonthly}</span>
                        <span className="text-muted-foreground text-sm">/mo</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className={`flex items-center gap-2 ${p.facebook ? "" : "text-muted-foreground line-through"}`}><Check className="w-3.5 h-3.5" />Facebook automation</div>
                      <div className={`flex items-center gap-2 ${p.youtube ? "" : "text-muted-foreground line-through"}`}><Check className="w-3.5 h-3.5" />YouTube automation</div>
                      <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5" />{p.teamMembers} team member{p.teamMembers === 1 ? "" : "s"}</div>
                      <div className={`flex items-center gap-2 ${p.apiKeys ? "" : "text-muted-foreground line-through"}`}><Check className="w-3.5 h-3.5" />API access</div>
                    </CardContent>
                    <CardFooter>
                      <Button
                        className="w-full gap-2"
                        variant={isCurrent ? "outline" : "default"}
                        disabled={isCurrent || switching === p.plan}
                        onClick={() => changePlan(p.plan)}
                      >
                        {switching === p.plan && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isCurrent ? "Current Plan" : "Switch"}
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Current Usage</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><p className="text-2xl font-bold">{data?.usage.facebookAccounts}</p><p className="text-muted-foreground">FB Accounts</p></div>
                <div><p className="text-2xl font-bold">{data?.usage.facebookPages}</p><p className="text-muted-foreground">FB Pages</p></div>
                <div><p className="text-2xl font-bold">{data?.usage.youtubeAccounts}</p><p className="text-muted-foreground">YT Accounts</p></div>
                <div><p className="text-2xl font-bold">{data?.usage.teamMembers}</p><p className="text-muted-foreground">Team Members</p></div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
