import { ReactNode } from "react";
import { Link } from "wouter";
import { PageFlowLogo } from "@/components/pageflow-logo";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b backdrop-blur-xl"
        style={{
          background: "linear-gradient(to bottom, hsl(var(--card)/0.95), hsl(var(--card)/0.85))",
          boxShadow: "0 1px 0 0 hsl(var(--border)), 0 4px 20px -4px rgba(0,0,0,0.15)",
        }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <PageFlowLogo size="md" className="group-hover:opacity-90 transition-opacity" />
          </Link>
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link href="/privacy" className="px-3 py-1.5 rounded-lg hover:text-foreground hover:bg-muted/70 transition-colors">Privacy</Link>
            <Link href="/terms" className="px-3 py-1.5 rounded-lg hover:text-foreground hover:bg-muted/70 transition-colors">Terms</Link>
            <Link href="/data-deletion" className="px-3 py-1.5 rounded-lg hover:text-foreground hover:bg-muted/70 transition-colors">Data Deletion</Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card/50 mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <PageFlowLogo size="xs" />
            <span>© {new Date().getFullYear()} PageFlow. All rights reserved.</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <Link href="/data-deletion" className="hover:text-foreground transition-colors">Data Deletion</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
