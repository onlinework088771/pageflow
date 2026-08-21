import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Globe2,
  LockKeyhole,
  Search,
  ShieldAlert,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Link } from "wouter";
import { PageHeader } from "@/components/page-header";
import {
  CapabilityBadge,
  CapabilityFootnote,
  CapabilityNotice,
  FlowStep,
} from "@/components/group-automation-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function GroupAutoApprovalFinder() {
  const [country, setCountry] = useState("");
  const [niche, setNiche] = useState("");

  return (
    <div className="mx-auto w-full max-w-7xl space-y-7 px-4 pb-28 pt-6 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/group-automation" className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Group Automation
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">Auto Approval Finder</span>
      </div>

      <PageHeader
        eyebrow="Group Automation / Auto Approval Finder"
        title="Find relevant public Groups"
        description="Shape the future research workflow with country and niche targets while production discovery remains capability-gated."
        icon={<Search className="h-5 w-5 text-primary" aria-hidden="true" />}
        actions={<CapabilityBadge tone="limited">Limited access</CapabilityBadge>}
      />

      <CapabilityNotice tone="limited" title="Production discovery is not currently available">
        Meta’s public Group research surface is limited to controlled Content Library access, which is not part of PageFlow’s normal production Facebook integration. This page keeps the intended workflow visible without scraping, browser automation, unsupported APIs, fabricated Groups, or invented reach numbers.
      </CapabilityNotice>

      <Card className="surface-topline border-border/70 bg-card/70">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Research target</p>
              <CardTitle className="mt-1 text-lg">Define your audience</CardTitle>
            </div>
            <div className="chip-blue flex h-10 w-10 items-center justify-center rounded-xl">
              <Sparkles className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="group-country">Country target</Label>
              <div className="relative">
                <Globe2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="group-country" value={country} onChange={(event) => setCountry(event.target.value)} placeholder="e.g. United States" className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-niche">Niche target</Label>
              <div className="relative">
                <UsersRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="group-niche" value={niche} onChange={(event) => setNiche(event.target.value)} placeholder="e.g. Dogs / Animals" className="pl-9" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-300" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-muted-foreground">Finder execution stays disabled until an approved production data capability is available.</p>
            </div>
            <Button type="button" disabled className="w-full shrink-0 sm:w-auto">Run finder</Button>
          </div>
          <CapabilityFootnote>Inputs are local to this preview shell. They are not submitted, stored, or sent to Facebook.</CapabilityFootnote>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/60">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Intended workflow</p>
              <CardTitle className="mt-1 text-lg">From target to qualified result</CardTitle>
            </div>
            <span className="hidden text-xs text-muted-foreground sm:inline">Execution paused</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            <FlowStep index={1} icon={Globe2} title="Country + niche" description="Set the audience target." />
            <FlowStep index={2} icon={Search} title="Discovery" description="Use only legitimate Group data." />
            <FlowStep index={3} icon={Activity} title="High-reach scan" description="Show real signals, not fabricated reach." />
            <FlowStep index={4} icon={ShieldAlert} title="Eligibility" description="Separate evidence from assumption." />
            <FlowStep index={5} icon={CheckCircle2} title="Qualified result" description="Return only supported findings." />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="border-border/70 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Result state</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/15 px-6 text-center">
              <LockKeyhole className="mb-3 h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">No results generated</p>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">Qualified Groups will appear only when a supported, legitimate data source is available. No placeholder Group data is displayed.</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Evidence policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
              <span>Member and activity values will be shown only when returned by an approved source.</span>
            </div>
            <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <span>Auto-approval remains <strong className="font-semibold text-foreground">Unknown</strong> without reliable direct evidence.</span>
            </div>
            <CapabilityFootnote>Any future score will be labeled estimated or signal-based when exact reach is unavailable.</CapabilityFootnote>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
