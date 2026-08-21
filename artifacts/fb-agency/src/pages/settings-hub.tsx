import { useState } from "react";
import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Settings, Facebook, Youtube, UsersRound, CreditCard, KeyRound, ShieldCheck,
  UserCircle2, ArrowRight, Coins, LogOut, Bot, Wrench, CreditCard as BillingIcon,
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useGetOverviewStats, getGetOverviewStatsQueryKey, useAddTokens } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type Section = "general" | "facebook" | "youtube" | "workspace" | "security";

const SECTIONS: { id: Section; label: string; icon: typeof Settings }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "facebook", label: "Facebook", icon: Facebook },
  { id: "youtube", label: "YouTube", icon: Youtube },
  { id: "workspace", label: "Workspace", icon: UsersRound },
  { id: "security", label: "Security", icon: ShieldCheck },
];

export default function SettingsHub() {
  const [section, setSection] = useState<Section>("general");

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Settings"
          icon={<Settings className="h-5 w-5" />}
          description="Manage your profile, platform apps, workspace and security."
        />

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Section nav: vertical on desktop, scrollable pills on mobile */}
          <nav aria-label="Settings sections" className="lg:w-56 lg:shrink-0">
            <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
              {SECTIONS.map((s) => (
                <li key={s.id} className="shrink-0 lg:w-full">
                  <button
                    type="button"
                    onClick={() => setSection(s.id)}
                    aria-current={section === s.id ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      section === s.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <s.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="whitespace-nowrap">{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 flex-1">
            {section === "general" && <GeneralSection />}
            {section === "facebook" && <FacebookSection />}
            {section === "youtube" && <YoutubeSection />}
            {section === "workspace" && <WorkspaceSection />}
            {section === "security" && <SecuritySection />}
          </div>
        </div>
      </div>
    </Layout>
  );
}

/* ─── General ─────────────────────────────────────────────────────────────── */

function GeneralSection() {
  const { user } = useAuth();
  const { data: stats, isLoading } = useGetOverviewStats({ query: { queryKey: getGetOverviewStatsQueryKey() } });
  const addTokens = useAddTokens();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const initials = user?.name?.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() ?? "?";

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <Avatar className="h-14 w-14 border">
            <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">{user?.name ?? "—"}</h3>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-full border bg-muted/60 px-2 py-0.5 font-medium capitalize">{user?.role ?? "member"}</span>
              <span className="rounded-full border bg-muted/60 px-2 py-0.5 font-medium">{user?.agencyName ?? "Agency"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border bg-amber-500/5 p-2.5">
              <Coins className="h-4 w-4 text-amber-500" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-semibold">API Tokens</h3>
              <p className="text-sm text-muted-foreground">
                {isLoading ? <Skeleton className="inline-block h-4 w-16" /> : `${(stats?.tokenBalance ?? 0).toLocaleString()} tokens available`}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            disabled={addTokens.isPending}
            onClick={() =>
              addTokens.mutate(
                { data: { amount: 1000 } },
                {
                  onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: getGetOverviewStatsQueryKey() });
                    toast({ title: "1,000 tokens added" });
                  },
                }
              )
            }
          >
            Add 1,000 tokens
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Link-card list helper ───────────────────────────────────────────────── */

function LinkCard({ href, icon, title, desc, accent }: {
  href: string; icon: React.ReactNode; title: string; desc: string; accent?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <div className={cn("rounded-lg border bg-muted/50 p-2 text-muted-foreground", accent)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-sm font-semibold">
          {title}
          <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
    </Link>
  );
}

/* ─── Facebook ────────────────────────────────────────────────────────────── */

function FacebookSection() {
  return (
    <div className="grid gap-3">
      <LinkCard
        href="/settings/facebook-app"
        icon={<Facebook className="h-4 w-4 text-[#1877F2]" />}
        title="Facebook App Setup (BYOC)"
        desc="Connect your own Facebook app: 5-step wizard, credential verification and testing."
      />
      <LinkCard
        href="/settings/developer"
        icon={<Wrench className="h-4 w-4" />}
        title="Developer Settings"
        desc="Advanced credential management, rollback and change history (admin only)."
      />
    </div>
  );
}

/* ─── YouTube ─────────────────────────────────────────────────────────────── */

function YoutubeSection() {
  return (
    <div className="grid gap-3">
      <LinkCard
        href="/youtube/developer-settings"
        icon={<Youtube className="h-4 w-4 text-[#FF0000]" />}
        title="Google / YouTube App Setup"
        desc="OAuth credentials for YouTube uploads, testing, rollback and change history (admin only)."
      />
      <LinkCard
        href="/youtube/automation"
        icon={<Bot className="h-4 w-4" />}
        title="Automation Defaults"
        desc="Configure per-channel posting automation, sources and smart features."
      />
    </div>
  );
}

/* ─── Workspace ───────────────────────────────────────────────────────────── */

function WorkspaceSection() {
  return (
    <div className="grid gap-3">
      <LinkCard
        href="/team"
        icon={<UsersRound className="h-4 w-4" />}
        title="Team & Roles"
        desc="Invite teammates, assign roles and manage agency access."
      />
      <LinkCard
        href="/billing"
        icon={<BillingIcon className="h-4 w-4" />}
        title="Billing & Plans"
        desc="View usage and switch between Free, Facebook, YouTube and Agency plans."
      />
      <LinkCard
        href="/api-keys"
        icon={<KeyRound className="h-4 w-4" />}
        title="API Keys"
        desc="Create and revoke keys for the public API."
      />
    </div>
  );
}

/* ─── Security ────────────────────────────────────────────────────────────── */

function SecuritySection() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCircle2 className="h-4 w-4 text-muted-foreground" /> Session
          </CardTitle>
          <CardDescription>You're signed in on this device.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-0 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{user?.email}</span>
          </p>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { logout(); queryClient.clear(); }}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Authentication
          </CardTitle>
          <CardDescription>How PageFlow protects your account.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" /> JWT-based sessions with server-side verification</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" /> Role-based access control (admin / member)</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" /> Per-agency data isolation across Facebook and YouTube</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
