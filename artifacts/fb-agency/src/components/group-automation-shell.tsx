import { ArrowRight, CheckCircle2, CircleSlash2, Info, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type CapabilityTone = "unavailable" | "limited" | "available";

const CAPABILITY_TONE_STYLES: Record<CapabilityTone, string> = {
  unavailable: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  limited: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  available: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
};

const CAPABILITY_ICONS: Record<CapabilityTone, LucideIcon> = {
  unavailable: CircleSlash2,
  limited: ShieldAlert,
  available: CheckCircle2,
};

export function CapabilityBadge({
  tone,
  children,
}: {
  tone: CapabilityTone;
  children: ReactNode;
}) {
  const Icon = CAPABILITY_ICONS[tone];
  return (
    <Badge variant="outline" className={cn("gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", CAPABILITY_TONE_STYLES[tone])}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </Badge>
  );
}

export function CapabilityNotice({
  tone = "unavailable",
  title,
  children,
}: {
  tone?: CapabilityTone;
  title: string;
  children: ReactNode;
}) {
  const Icon = tone === "limited" ? ShieldAlert : tone === "available" ? CheckCircle2 : CircleSlash2;
  return (
    <div className={cn(
      "flex gap-3 rounded-2xl border px-4 py-3.5",
      tone === "unavailable" && "border-rose-400/20 bg-rose-400/[0.07]",
      tone === "limited" && "border-amber-400/20 bg-amber-400/[0.07]",
      tone === "available" && "border-emerald-400/20 bg-emerald-400/[0.07]",
    )}>
      <Icon className={cn(
        "mt-0.5 h-5 w-5 shrink-0",
        tone === "unavailable" && "text-rose-300",
        tone === "limited" && "text-amber-300",
        tone === "available" && "text-emerald-300",
      )} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export function FlowStep({
  index,
  icon: Icon,
  title,
  description,
  muted = true,
}: {
  index: number;
  icon: LucideIcon;
  title: string;
  description: string;
  muted?: boolean;
}) {
  return (
    <div className={cn("relative flex min-w-0 flex-1 items-start gap-3", muted && "opacity-75")}>
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-muted/40 text-primary shadow-sm">
        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border border-background bg-background px-1 text-[10px] font-bold text-muted-foreground">
          {index}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function ModuleLinkCard({
  href,
  icon: Icon,
  eyebrow,
  title,
  description,
  tone,
  status,
}: {
  href: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  tone: CapabilityTone;
  status: string;
}) {
  return (
    <Link href={href} className="group block min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
      <Card className="surface-topline h-full border-border/70 bg-card/80 transition-[transform,border-color,background-color] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:bg-card group-focus-visible:border-primary/50">
        <CardContent className="flex h-full flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="chip-blue flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-[0_4px_16px_-6px_hsl(var(--primary)/0.45)]">
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <CapabilityBadge tone={tone}>{status}</CapabilityBadge>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-primary transition-[gap] duration-200 group-hover:gap-2.5">
            Open module <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function CapabilityFootnote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
