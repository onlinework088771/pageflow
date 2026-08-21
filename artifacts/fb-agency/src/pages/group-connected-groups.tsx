import { ArrowLeft, Facebook, Link2, LockKeyhole, UsersRound } from "lucide-react";
import { Link } from "wouter";
import { PageHeader } from "@/components/page-header";
import {
  CapabilityBadge,
  CapabilityFootnote,
  CapabilityNotice,
} from "@/components/group-automation-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function GroupConnectedGroups() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-7 px-4 pb-28 pt-6 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/group-automation" className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Group Automation
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">Connected Groups</span>
      </div>

      <PageHeader
        eyebrow="Group Automation / Connected Groups"
        title="Connected Groups"
        description="A dedicated space for Groups associated with your connected Facebook identities."
        icon={<UsersRound className="h-5 w-5 text-primary" aria-hidden="true" />}
        actions={<CapabilityBadge tone="unavailable">Currently unavailable</CapabilityBadge>}
      />

      <CapabilityNotice title="Group access is not available in PageFlow’s current Meta architecture">
        PageFlow can manage connected Facebook Pages, but its current supported Meta permissions and token model do not provide the required live Group access or management relationship. No Group API is called from this page, and no placeholder Group results are shown.
      </CapabilityNotice>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="surface-topline border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Identity scope</p>
                <CardTitle className="mt-1 text-lg">Connected Facebook ID</CardTitle>
              </div>
              <div className="chip-blue flex h-10 w-10 items-center justify-center rounded-xl">
                <Facebook className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
              <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-primary/80" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-foreground">Selection is reserved for supported access</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">When Meta provides a supported Group relationship for this product, the connected identity selector will appear here. Until then, PageFlow will not infer Group access from Page ownership.</p>
              </div>
            </div>
            <CapabilityFootnote>Page access tokens remain scoped to existing Page operations and are never exposed or reused as an assumed Group credential.</CapabilityFootnote>
          </CardContent>
        </Card>

        <Card className="surface-topline border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Group inventory</p>
                <CardTitle className="mt-1 text-lg">My Groups</CardTitle>
              </div>
              <CapabilityBadge tone="unavailable">No data loaded</CapabilityBadge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/15 px-6 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-background/60">
                <LockKeyhole className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-foreground">Currently unavailable</p>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">There are no Group results to display because the current official API access required for this module is not available.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">What will remain separate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Page Automation", "Existing Page source, schedule, and publishing behavior are unchanged."],
              ["Page Scheduler", "Existing scheduled videos and Reel publishing remain on their current lifecycle."],
              ["Group Scheduling", "No Group scheduler, queue, history, or database tables are active yet."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
