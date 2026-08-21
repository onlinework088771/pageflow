import { ReactNode, useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useGetOverviewStats, getGetOverviewStatsQueryKey } from "@workspace/api-client-react";
import {
  LogOut, Coins, Menu, ChevronsUpDown, ChevronRight,
  Plus, UserCircle2, ExternalLink,
  LayoutDashboard, Facebook, Youtube,
} from "lucide-react";
import { authFetch, apiUrl } from "@/components/schedule-management-utils";
import { PageFlowLogo } from "@/components/pageflow-logo";
import { NAV, isGroup, isActivePath, resolveActiveNav, ACCENT_CLASSES, type NavLeaf } from "@/components/nav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton,
  SidebarMenuSubItem, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/auth-context";
import { useQueryClient } from "@tanstack/react-query";

/* ─── Shared bits ─────────────────────────────────────────────────────────── */

function StatusDot({ status }: { status?: string }) {
  const cls =
    status === "degraded" ? "bg-yellow-500" : status === "offline" ? "bg-red-500" : "bg-emerald-500";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} aria-hidden="true" />;
}

function TokenChip({ balance, compact }: { balance?: number; compact?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/60 px-2.5 py-1" title="Token balance">
      <Coins className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
      <span className="text-xs font-semibold tabular-nums">
        {(balance ?? 0).toLocaleString()}
      </span>
      {!compact && <span className="sr-only">tokens available</span>}
    </div>
  );
}

/* ─── Desktop sidebar ─────────────────────────────────────────────────────── */

function AppSidebar({ pendingCount }: { pendingCount: number }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { setOpenMobile } = useSidebar();
  const initials = user?.name
    ? user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  // Close the mobile drawer after navigating anywhere.
  useEffect(() => {
    setOpenMobile(false);
  }, [location, setOpenMobile]);

  function handleLogout() {
    logout();
    queryClient.clear();
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="PageFlow">
              <Link href="/">
                <div className="chip-blue flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                  <PageFlowLogo size="xs" variant="nav" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold text-foreground">PageFlow</span>
                  <span className="truncate text-xs text-muted-foreground">Social media workspace</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((entry) => {
          if (!isGroup(entry)) {
            const active = isActivePath(location, entry.href);
            return (
              <SidebarGroup key={entry.href} className="py-1">
                {entry.section && (
                  <SidebarGroupLabel className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {entry.section}
                  </SidebarGroupLabel>
                )}
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton isActive={active} tooltip={entry.label} asChild>
                        <Link href={entry.href}>
                          <entry.icon aria-hidden="true" />
                          <span>{entry.label}</span>
                          {entry.href === "/scheduler" && pendingCount > 0 && (
                            <SidebarMenuBadge>{pendingCount > 99 ? "99+" : pendingCount}</SidebarMenuBadge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          // Expandable platform group (Facebook / YouTube)
          const groupActive = entry.children.some((c) => isActivePath(location, c.href));
          return (
            <SidebarGroup key={entry.href} className="py-1">
              {entry.section && (
                <SidebarGroupLabel className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {entry.section}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  <Collapsible defaultOpen={groupActive} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={entry.label}>
                          <entry.icon className={ACCENT_CLASSES[entry.accent]} aria-hidden="true" />
                          <span>{entry.label}</span>
                          {entry.label === "Facebook" && pendingCount > 0 && (
                            <SidebarMenuBadge>{pendingCount > 99 ? "99+" : pendingCount}</SidebarMenuBadge>
                          )}
                          <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 [[data-state=open]>&]:rotate-90" aria-hidden="true" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {entry.children.map((child) => (
                            <SidebarMenuSubItem key={child.href}>
                              <SidebarMenuSubButton asChild isActive={isActivePath(location, child.href)}>
                                <Link href={child.href}>
                                  {child.showPendingBadge && pendingCount > 0 && (
                                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white">
                                      {pendingCount > 99 ? "99+" : pendingCount}
                                    </span>
                                  )}
                                  <span className="truncate">{child.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={user?.name ?? "Account"}>
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user?.name ?? "..."}</span>
                    <span className="truncate text-xs text-muted-foreground">{user?.agencyName ?? "Agency"}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-semibold">{user?.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="w-full">
                    <UserCircle2 className="h-4 w-4" aria-hidden="true" /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/team" className="w-full">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" /> Team & roles
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

/* ─── Mobile bottom tab bar ───────────────────────────────────────────────── */

const MOBILE_TAB_CLASSES =
  "flex min-h-[52px] flex-col items-center justify-center gap-1 py-1.5 transition-colors";

function MobileTabBar({ onMore }: { onMore: () => void }) {
  const [location] = useLocation();
  const isFbActive =
    location.startsWith("/facebook") ||
    ["/accounts", "/pages", "/upload", "/schedule", "/page-management"].some((p) => location.startsWith(p));
  const isYtActive =
    location.startsWith("/youtube") ||
    ["/youtube-accounts", "/youtube-automation"].some((p) => location.startsWith(p));

  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      {/* Floating glass dock — rounded, softly bordered, safe-area aware */}
      <div className="px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pt-2 sm:px-6">
        <div className="relative mx-auto max-w-lg rounded-2xl border border-border/80 bg-[#0a0f19]/90 shadow-[0_-6px_30px_-12px_rgba(0,0,0,0.7),0_0_0_1px_hsl(217_60%_50%/0.08)] backdrop-blur-xl">
          <div className="grid grid-cols-5 px-1.5 py-1.5">
            <Link
              href="/"
              aria-current={location === "/" ? "page" : undefined}
              className={`${MOBILE_TAB_CLASSES} ${location === "/" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
              <span className="text-[10px] font-medium">Home</span>
            </Link>

            <Link
              href="/facebook"
              aria-current={isFbActive ? "page" : undefined}
              className={`${MOBILE_TAB_CLASSES} ${isFbActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <span className="relative flex flex-col items-center">
                <Facebook className="h-5 w-5" aria-hidden="true" />
                {isFbActive && <span className="absolute -bottom-2 h-1 w-1 rounded-full bg-primary" aria-hidden="true" />}
              </span>
              <span className="text-[10px] font-medium">Facebook</span>
            </Link>

            {/* Center create action */}
            <Link
              href="/upload"
              aria-label="Create content"
              className="flex items-end justify-center"
            >
              <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_24px_-6px_hsl(var(--primary)/0.6)] transition-transform duration-150 active:scale-95">
                <Plus className="h-6 w-6" aria-hidden="true" />
              </span>
            </Link>

            <Link
              href="/youtube"
              aria-current={isYtActive ? "page" : undefined}
              className={`${MOBILE_TAB_CLASSES} ${isYtActive ? "text-red-400" : "text-muted-foreground hover:text-foreground"}`}
            >
              <span className="relative flex flex-col items-center">
                <Youtube className="h-5 w-5" aria-hidden="true" />
                {isYtActive && <span className="absolute -bottom-2 h-1 w-1 rounded-full bg-red-400" aria-hidden="true" />}
              </span>
              <span className="text-[10px] font-medium">YouTube</span>
            </Link>

            <button
              type="button"
              onClick={onMore}
              className={`${MOBILE_TAB_CLASSES} text-muted-foreground hover:text-foreground`}
              aria-label="Open menu"
            >
              <span className="relative flex flex-col items-center">
                <Menu className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-[10px] font-medium">More</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

/* ─── Topbar ──────────────────────────────────────────────────────────────── */

function Topbar({ stats }: { stats?: { tokenBalance?: number; systemStatus?: string } }) {
  const [location] = useLocation();
  const { leaf, group } = resolveActiveNav(location);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/70 bg-background/75 px-4 backdrop-blur-xl sm:px-6">
      <SidebarTrigger className="-ml-1" />
      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        {group && (
          <>
            <span className={`hidden font-medium sm:inline ${ACCENT_CLASSES[group.accent]}`}>{group.label}</span>
            <ChevronsRight />
          </>
        )}
        <span className="truncate font-semibold text-foreground">
          {leaf?.label ?? (location === "/" ? "Overview" : "PageFlow")}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-1.5 rounded-full border border-border/60 bg-muted/60 px-2.5 py-1 sm:flex" title="System status">
          <StatusDot status={stats?.systemStatus} />
          <span className="text-xs font-medium capitalize text-muted-foreground">
            {stats?.systemStatus ?? "online"}
          </span>
        </div>
        <TokenChip balance={stats?.tokenBalance} />
      </div>
    </header>
  );
}

function ChevronsRight() {
  return <span className="text-muted-foreground/50" aria-hidden="true">/</span>;
}

/* ─── Layout (public API — every page wraps itself in this) ───────────────── */

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: stats } = useGetOverviewStats({ query: { queryKey: getGetOverviewStatsQueryKey() } });
  const [pendingCount, setPendingCount] = useState(0);

  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await authFetch(apiUrl("/scheduled-videos"));
      if (!res.ok) return;
      const videos: { status: string }[] = await res.json();
      setPendingCount(videos.filter((v) => v.status === "pending" || v.status === "processing").length);
    } catch { /* offline — badge simply stays at last value */ }
  }, []);

  useEffect(() => {
    fetchPendingCount();
    const t = setInterval(fetchPendingCount, 30_000);
    return () => clearInterval(t);
  }, [fetchPendingCount]);

  return (
    <SidebarProvider>
      <AppSidebar pendingCount={pendingCount} />
      <SidebarInset>
        <Topbar stats={stats} />
        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-8">
            <motion.div
              key={location}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </div>
        </main>
        <MobileTabBarContainer />
      </SidebarInset>
    </SidebarProvider>
  );
}

/** Opens the mobile drawer via the sidebar context — must be a descendant of
 * SidebarProvider, so it can't be called directly in Layout. */
function MobileTabBarContainer() {
  const { setOpenMobile } = useSidebar();
  return <MobileTabBar onMore={() => setOpenMobile(true)} />;
}
