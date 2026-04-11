import { ReactNode, useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useGetOverviewStats, getGetOverviewStatsQueryKey } from "@workspace/api-client-react";
import {
  Activity, LayoutDashboard, Users, Files, Settings,
  LogOut, Coins, ShieldCheck, AlertTriangle, Menu, X,
  ChevronRight, Zap,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/auth-context";
import { useQueryClient } from "@tanstack/react-query";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/accounts", label: "FB Accounts", icon: Users },
  { href: "/pages", label: "Pages", icon: Files },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: stats } = useGetOverviewStats({ query: { queryKey: getGetOverviewStatsQueryKey() } });
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const initials = user?.name
    ? user.name.split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  function handleLogout() {
    logout();
    queryClient.clear();
    setMobileOpen(false);
  }

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    }
    if (mobileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileOpen]);

  const isOnline = stats?.systemStatus === "online";
  const isDegraded = stats?.systemStatus === "degraded";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full">
        <div
          className="border-b backdrop-blur-xl"
          style={{
            background: "linear-gradient(to bottom, hsl(var(--card)/0.95), hsl(var(--card)/0.85))",
            boxShadow: "0 1px 0 0 hsl(var(--border)), 0 4px 20px -4px rgba(0,0,0,0.15)",
          }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

            <div className="flex items-center gap-6 lg:gap-8 min-w-0">
              <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary rounded-xl blur-sm opacity-40 group-hover:opacity-60 transition-opacity" />
                  <div className="relative w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-md">
                    <Zap className="h-4 w-4 text-primary-foreground fill-current" />
                  </div>
                </div>
                <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  PageFlow
                </span>
              </Link>

              <nav className="hidden md:flex items-center gap-0.5">
                {navItems.map((item) => {
                  const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`
                        relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium
                        transition-all duration-200 select-none
                        ${isActive
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
                        }
                      `}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-lg bg-primary/10"
                          transition={{ type: "spring", stiffness: 400, damping: 35 }}
                        />
                      )}
                      <Icon className="h-4 w-4 relative z-10 shrink-0" />
                      <span className="relative z-10">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:flex items-center gap-2 bg-muted/60 hover:bg-muted transition-colors px-3 py-1.5 rounded-full border border-border/50 cursor-default">
                <Coins className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                <span className="text-xs font-semibold tabular-nums">
                  {(stats?.tokenBalance ?? 0).toLocaleString()}
                </span>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 bg-muted/60 hover:bg-muted transition-colors px-3 py-1.5 rounded-full border border-border/50 cursor-default">
                <div className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? "bg-green-500" : isDegraded ? "bg-yellow-500" : "bg-red-500"} ${isOnline ? "shadow-[0_0_6px_rgba(34,197,94,0.6)]" : ""}`} />
                <span className="text-xs font-medium capitalize text-muted-foreground">
                  {stats?.systemStatus ?? "online"}
                </span>
              </div>

              <div className="hidden md:flex items-center gap-2.5 pl-2 border-l border-border/60 ml-1">
                <div className="flex flex-col items-end leading-tight">
                  <span className="text-sm font-semibold truncate max-w-[120px]">{user?.name ?? "..."}</span>
                  <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">{user?.agencyName ?? "Agency"}</span>
                </div>
                <div className="relative">
                  <Avatar className="h-8 w-8 ring-2 ring-primary/20 ring-offset-1 ring-offset-background">
                    <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary text-xs font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Sign out"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all rounded-lg"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>

              <div className="md:hidden" ref={mobileMenuRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl border border-border/60 bg-muted/50 hover:bg-muted text-foreground"
                  onClick={() => setMobileOpen((v) => !v)}
                  aria-label="Toggle menu"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {mobileOpen ? (
                      <motion.div
                        key="close"
                        initial={{ rotate: -90, opacity: 0 }}
                        animate={{ rotate: 0, opacity: 1 }}
                        exit={{ rotate: 90, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        <X className="h-4.5 w-4.5" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="open"
                        initial={{ rotate: 90, opacity: 0 }}
                        animate={{ rotate: 0, opacity: 1 }}
                        exit={{ rotate: -90, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Menu className="h-4.5 w-4.5" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scaleY: 0.96 }}
              animate={{ opacity: 1, y: 0, scaleY: 1 }}
              exit={{ opacity: 0, y: -8, scaleY: 0.96 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{
                transformOrigin: "top",
                background: "hsl(var(--card))",
                boxShadow: "0 20px 40px -8px rgba(0,0,0,0.25), 0 0 0 1px hsl(var(--border))",
              }}
              className="md:hidden absolute w-full z-50 rounded-b-2xl overflow-hidden"
            >
              <div className="px-3 pt-3 pb-2">
                <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-muted/50 mb-3">
                  <div className="relative shrink-0">
                    <Avatar className="h-10 w-10 ring-2 ring-primary/20 ring-offset-1 ring-offset-card">
                      <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-card" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{user?.name ?? "..."}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.agencyName ?? "Agency"}</p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-background px-2.5 py-1 rounded-full border border-border/60">
                    <Coins className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                    <span className="text-xs font-bold tabular-nums">{(stats?.tokenBalance ?? 0).toLocaleString()}</span>
                  </div>
                </div>

                <nav className="space-y-0.5 mb-2">
                  {navItems.map((item, i) => {
                    const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                    const Icon = item.icon;
                    return (
                      <motion.div
                        key={item.href}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.2 }}
                      >
                        <Link
                          href={item.href}
                          className={`
                            flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                            transition-all duration-150 active:scale-[0.98]
                            ${isActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }
                          `}
                        >
                          <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? "text-primary" : ""}`} />
                          <span className="flex-1">{item.label}</span>
                          {isActive && (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          )}
                          {!isActive && <ChevronRight className="h-3.5 w-3.5 opacity-30" />}
                        </Link>
                      </motion.div>
                    );
                  })}
                </nav>

                <div className="border-t border-border/50 pt-2 pb-1 space-y-1">
                  <div className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]" : isDegraded ? "bg-yellow-500" : "bg-red-500"}`} />
                      <span className="text-xs text-muted-foreground capitalize font-medium">{stats?.systemStatus ?? "online"}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] py-0">v1.0</Badge>
                  </div>

                  <motion.button
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: navItems.length * 0.04 + 0.05, duration: 0.2 }}
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-all duration-150 active:scale-[0.98]"
                  >
                    <LogOut className="h-4.5 w-4.5 shrink-0" />
                    <span>Sign Out</span>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <motion.div
          key={location}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
