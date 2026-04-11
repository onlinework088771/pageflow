import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useGetOverviewStats, getGetOverviewStatsQueryKey } from "@workspace/api-client-react";
import { Activity, LayoutDashboard, Users, Files, Settings, LogOut, Coins, ShieldCheck, AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
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

  const initials = user?.name
    ? user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  function handleLogout() {
    logout();
    queryClient.clear();
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="sticky top-0 z-40 w-full border-b bg-card/80 backdrop-blur-lg">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 text-xl font-bold text-primary tracking-tight">
              <Activity className="h-6 w-6" />
              PageFlow
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = location === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-muted px-3 py-1.5 rounded-full text-sm font-medium">
              <Coins className="h-4 w-4 text-yellow-500" />
              <span>{stats?.tokenBalance?.toLocaleString() || "0"}</span>
            </div>

            <div className="hidden sm:flex items-center gap-2 bg-muted px-3 py-1.5 rounded-full text-sm font-medium">
              {stats?.systemStatus === "online" ? (
                <ShieldCheck className="h-4 w-4 text-green-500" />
              ) : stats?.systemStatus === "degraded" ? (
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              )}
              <span className="capitalize">{stats?.systemStatus || "Online"}</span>
            </div>

            <div className="flex items-center gap-3 border-l pl-4 ml-2">
              <div className="flex flex-col items-end">
                <span className="text-sm font-medium leading-none">{user?.name || "..."}</span>
                <span className="text-xs text-muted-foreground mt-1">{user?.agencyName || "Agency"}</span>
              </div>
              <Avatar className="h-9 w-9 border-2 border-primary/20">
                <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              <Button
                variant="ghost"
                size="icon"
                title="Sign out"
                className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <motion.div
          key={location}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
