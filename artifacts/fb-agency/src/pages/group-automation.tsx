import {
  ArrowUpRight,
  Boxes,
  Gauge,
  LockKeyhole,
  Search,
  UsersRound,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  CapabilityBadge,
  CapabilityFootnote,
  CapabilityNotice,
  FlowStep,
  ModuleLinkCard,
} from "@/components/group-automation-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

export default function GroupAutomation() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-7 px-4 pb-28 pt-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Group Automation"
        title="A capability-first workspace for Facebook Groups"
        description="Two focused modules keep connected Group workflows separate from public discovery analysis while Meta capability access is evaluated."
        icon={<Boxes className="h-5 w-5 text-primary" aria-hidden="true" />}
        actions={<CapabilityBadge tone="limited">Capability-gated</CapabilityBadge>}
      />

      <CapabilityNotice tone="limited" title="No unsupported Group operations are running">
        This shell does not call Group APIs, create schedules, publish content, scrape Facebook, or claim approval behavior. The controls below are intentionally scoped to the capabilities currently available to PageFlow.
      </CapabilityNotice>

      <section aria-labelledby="group-automation-modules" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Workspace modules</p>
            <h2 id="group-automation-modules" className="mt-1 text-xl font-semibold tracking-tight text-foreground">Choose a focused workflow</h2>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:inline">Separate data and authorization boundaries</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ModuleLinkCard
            href="/group-automation/connected-groups"
            icon={UsersRound}
            eyebrow="Module 01"
            title="Connected Groups"
            description="Reserved for Groups legitimately available to a connected Facebook identity. Group retrieval and publishing are currently unavailable in PageFlow’s supported Meta architecture."
            tone="unavailable"
            status="Currently unavailable"
          />
          <ModuleLinkCard
            href="/group-automation/auto-approval-finder"
            icon={Search}
            eyebrow="Module 02"
            title="Auto Approval Finder"
            description="A future country-and-niche research workflow. Official Group data is limited to controlled research access, and approval behavior remains unverified without direct evidence."
            tone="limited"
            status="Limited access"
          />
        </div>
      </section>

      <Card className="surface-topline border-border/70 bg-card/70">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Product flow</p>
              <CardTitle className="mt-1 text-lg">Capability before automation</CardTitle>
            </div>
            <div className="chip-blue flex h-10 w-10 items-center justify-center rounded-xl">
              <Gauge className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <FlowStep index={1} icon={Search} title="Validate capability" description="Use only current, officially supported Meta access and data." />
            <FlowStep index={2} icon={LockKeyhole} title="Keep boundaries isolated" description="Separate connected-identity workflows from public research signals." />
            <FlowStep index={3} icon={ArrowUpRight} title="Enable only when ready" description="Activate actions only after the required capability is verified." />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/70 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">What this shell protects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                "No fabricated Group results or reach numbers",
                "No browser automation or Facebook scraping",
                "No active Group scheduling or publishing",
                "No changes to PageFlow’s existing schedulers",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5 text-sm text-muted-foreground">
                  <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary/80" aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Continue exploring</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/group-automation/connected-groups" className="group flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3 text-sm transition-colors hover:border-primary/35 hover:bg-muted/40">
              <span className="font-medium text-foreground">Connected Groups</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <Link href="/group-automation/auto-approval-finder" className="group flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3 text-sm transition-colors hover:border-primary/35 hover:bg-muted/40">
              <span className="font-medium text-foreground">Auto Approval Finder</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <CapabilityFootnote>Both modules remain visibly separate so future capability work cannot accidentally mix Group data or automation logic.</CapabilityFootnote>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
