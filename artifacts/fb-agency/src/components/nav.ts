import {
  LayoutDashboard, Facebook, Youtube, CalendarClock, BarChart2, Settings,
  Users, Files, PenSquare, ListVideo, Layers, FolderOpen,
  MonitorPlay, UploadCloud, Bot, Clock, LineChart,
  type LucideIcon,
} from "lucide-react";

export interface NavLeaf {
  href: string;
  label: string;
  icon: LucideIcon;
  /** section label rendered as a small sidebar heading */
  section?: string;
  /** true when a pending-count badge should be shown on this item */
  showPendingBadge?: boolean;
}

export interface NavGroup {
  href: string;
  label: string;
  icon: LucideIcon;
  /** platform accent used for the group icon */
  accent: "facebook" | "youtube" | "default";
  /** section heading rendered above the group */
  section?: string;
  children: NavLeaf[];
}

export type NavEntry = NavLeaf | NavGroup;

function isGroup(e: NavEntry): e is NavGroup {
  return (e as NavGroup).children !== undefined;
}
export { isGroup };

/**
 * Single source of truth for the product's information architecture.
 * Used by the desktop sidebar, the mobile drawer and the mobile bottom bar.
 */
export const NAV: NavEntry[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, section: "Overview" },
  {
    href: "/facebook",
    label: "Facebook",
    icon: Facebook,
    accent: "facebook",
    section: "Facebook",
    children: [
      { href: "/facebook", label: "Overview", icon: LayoutDashboard },
      { href: "/accounts", label: "Accounts", icon: Users },
      { href: "/pages", label: "Pages", icon: Files },
      { href: "/upload", label: "Create Post", icon: PenSquare },
      { href: "/schedule", label: "Scheduler", icon: Clock, showPendingBadge: true },
      { href: "/page-management", label: "Published Posts", icon: ListVideo },
      { href: "/facebook/analytics", label: "Analytics", icon: LineChart },
    ],
  },
  {
    href: "/youtube",
    label: "YouTube",
    icon: Youtube,
    accent: "youtube",
    section: "YouTube",
    children: [
      { href: "/youtube", label: "Overview", icon: LayoutDashboard },
      { href: "/youtube/accounts", label: "Channels", icon: MonitorPlay },
      { href: "/youtube/bulk-upload", label: "Upload", icon: UploadCloud },
      { href: "/youtube/automation", label: "Automation", icon: Bot },
      { href: "/youtube/scheduler", label: "Scheduler", icon: Clock },
      { href: "/youtube/analytics", label: "Analytics", icon: LineChart },
    ],
  },
  { href: "/scheduler", label: "Scheduler", icon: CalendarClock, section: "Workspace" },
  { href: "/analytics", label: "Analytics", icon: BarChart2, section: "Workspace" },
  { href: "/settings", label: "Settings", icon: Settings, section: "Workspace" },
];

/** Flat list of every navigable leaf (for active-state resolution). */
export const NAV_LEAVES: NavLeaf[] = NAV.flatMap((e) =>
  isGroup(e) ? e.children.map((c) => ({ ...c, href: c.href })) : [e]
);

export function isActivePath(location: string, href: string): boolean {
  if (href === "/") return location === "/";
  return location === href || location.startsWith(href + "/") || location.startsWith(href + "?");
}

/** Returns the active leaf + its parent group (if any) for headers/breadcrumbs. */
export function resolveActiveNav(location: string): { leaf: NavLeaf | null; group: NavGroup | null } {
  // Longest href wins so /facebook/analytics beats /facebook
  const matches = NAV_LEAVES
    .filter((l) => isActivePath(location, l.href))
    .sort((a, b) => b.href.length - a.href.length);
  const leaf = matches[0] ?? null;
  if (!leaf) return { leaf: null, group: null };
  const group = NAV.find(
    (e): e is NavGroup => isGroup(e) && e.children.some((c) => c.href === leaf.href)
  ) ?? null;
  return { leaf, group };
}

export const ACCENT_CLASSES: Record<NavGroup["accent"], string> = {
  facebook: "text-[#1877F2]",
  youtube: "text-[#FF0000]",
  default: "text-muted-foreground",
};
