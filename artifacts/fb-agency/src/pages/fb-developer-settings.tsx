import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/auth-context";
import { authFetch, apiUrl } from "@/components/schedule-management-utils";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ShieldCheck,
  ChevronRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock,
  AlertCircle,
  Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DevSettings {
  id: string;
  agencyName: string;
  appId: string | null;
  appConfigured: boolean;
  appLive: boolean;
  setupStep: number;
  hasBackup: boolean;
  backupAppId: string | null;
  updatedAt: string;
}

interface ChangelogEntry {
  id: string;
  message: string;
  status: "success" | "error" | "info";
  metadata: {
    action?: string;
    newAppId?: string;
    previousAppId?: string | null;
    restoredAppId?: string;
    appName?: string | null;
    changedBy?: string;
  } | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

function StatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-red-500" />;
  return <Info className="h-4 w-4 text-blue-500" />;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FbDeveloperSettings() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const isAdmin = user?.role === "admin";

  // Current settings state
  const [settings, setSettings] = useState<DevSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // Form fields
  const [newAppId, setNewAppId] = useState("");
  const [newAppSecret, setNewAppSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  // Test connection state
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testResult, setTestResult] = useState<{ appName?: string; error?: string } | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);

  // Rollback state
  const [rollingBack, setRollingBack] = useState(false);

  // Changelog
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [changelogLoading, setChangelogLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await authFetch(apiUrl("/agency/developer-settings"));
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch {
      // silently ignore
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const fetchChangelog = useCallback(async () => {
    try {
      const res = await authFetch(apiUrl("/agency/developer-settings/changelog"));
      if (res.ok) {
        setChangelog(await res.json());
      }
    } catch {
      // silently ignore
    } finally {
      setChangelogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchSettings();
    fetchChangelog();
  }, [isAdmin, fetchSettings, fetchChangelog]);

  // Reset test state whenever credentials change
  useEffect(() => {
    setTestStatus("idle");
    setTestResult(null);
  }, [newAppId, newAppSecret]);

  async function handleTestConnection() {
    if (!newAppId.trim() || !newAppSecret.trim()) {
      toast({ title: "Enter both App ID and App Secret first", variant: "destructive" });
      return;
    }
    setTestStatus("testing");
    setTestResult(null);
    try {
      const res = await authFetch(apiUrl("/agency/developer-settings/test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: newAppId.trim(), appSecret: newAppSecret.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestStatus("success");
        setTestResult({ appName: data.appName });
        toast({ title: "Connection successful", description: `App: ${data.appName ?? data.appId}` });
      } else {
        setTestStatus("error");
        setTestResult({ error: data.error ?? "Verification failed" });
      }
    } catch {
      setTestStatus("error");
      setTestResult({ error: "Network error — could not reach Facebook" });
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await authFetch(apiUrl("/agency/developer-settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: newAppId.trim(), appSecret: newAppSecret.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings(data);
        setNewAppId("");
        setNewAppSecret("");
        setTestStatus("idle");
        setTestResult(null);
        toast({ title: "Credentials saved", description: `Active App ID: ${data.appId}` });
        fetchChangelog();
      } else {
        toast({ title: "Save failed", description: data.error ?? "Unknown error", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", description: "Could not save credentials", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleRollback() {
    setRollingBack(true);
    try {
      const res = await authFetch(apiUrl("/agency/developer-settings/rollback"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        setSettings(data);
        toast({ title: "Rolled back", description: `Active App ID: ${data.appId}` });
        fetchChangelog();
      } else {
        toast({ title: "Rollback failed", description: data.error ?? "Unknown error", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", description: "Could not roll back", variant: "destructive" });
    } finally {
      setRollingBack(false);
    }
  }

  // Non-admin gate
  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex flex-col gap-8 max-w-4xl mx-auto">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <button onClick={() => navigate("/settings")} className="hover:text-foreground transition-colors">Settings</button>
            <ChevronRight className="h-3 w-3" />
            <span>Facebook Developer Settings</span>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <p className="font-semibold">Admin access required</p>
                <p className="text-sm text-muted-foreground">Only administrators can manage Facebook Developer Settings.</p>
                <Button variant="outline" onClick={() => navigate("/settings")}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back to Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-8 max-w-4xl mx-auto">

        {/* Breadcrumb */}
        <div>
          <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
            <button onClick={() => navigate("/settings")} className="hover:text-foreground transition-colors">Settings</button>
            <ChevronRight className="h-3 w-3" />
            <span>Facebook Developer Settings</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Facebook Developer Settings</h1>
          <p className="text-muted-foreground mt-1">
            Update your Facebook App ID and App Secret. Changes apply immediately — no restart required.
          </p>
        </div>

        {/* Current Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Active Configuration</CardTitle>
              </div>
              {settingsLoading ? null : settings?.appConfigured ? (
                <Badge variant="outline" className="text-green-600 border-green-500/30 bg-green-500/10">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Configured
                </Badge>
              ) : (
                <Badge variant="outline" className="text-yellow-600 border-yellow-500/30 bg-yellow-500/10">
                  <AlertCircle className="h-3 w-3 mr-1" /> Not configured
                </Badge>
              )}
            </div>
            <CardDescription>Currently active Facebook App credentials.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settingsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-5 w-1/2" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">App ID</p>
                    <p className="font-mono text-sm font-medium">
                      {settings?.appId ?? <span className="text-muted-foreground italic">Not set</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">App Secret</p>
                    <p className="font-mono text-sm text-muted-foreground">
                      {settings?.appId ? "••••••••••••••••" : <span className="italic">Not set</span>}
                    </p>
                  </div>
                </div>

                {settings?.hasBackup && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start gap-3">
                    <RotateCcw className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Backup available</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Previous App ID: <span className="font-mono">{settings.backupAppId}</span>
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 border-amber-500/30 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                          disabled={rollingBack}
                        >
                          {rollingBack ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
                          Roll Back
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Roll back credentials?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will restore the previous App ID (<span className="font-mono font-medium">{settings.backupAppId}</span>) and its App Secret as the active configuration. The current backup will be cleared.
                            <br /><br />
                            Existing connected accounts and pages are not affected. All future Facebook requests will use the restored credentials immediately.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleRollback}>Yes, Roll Back</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Update Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Update Credentials</CardTitle>
            <CardDescription>
              Test the connection first, then save. The previous credentials are automatically backed up.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="newAppId">New App ID</Label>
              <Input
                id="newAppId"
                value={newAppId}
                onChange={(e) => setNewAppId(e.target.value)}
                placeholder="1064664161314204"
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newAppSecret">New App Secret</Label>
              <div className="relative">
                <Input
                  id="newAppSecret"
                  type={showSecret ? "text" : "password"}
                  value={newAppSecret}
                  onChange={(e) => setNewAppSecret(e.target.value)}
                  placeholder="••••••••••••••••••••••••••••••••"
                  className="font-mono pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 text-muted-foreground"
                  onClick={() => setShowSecret((v) => !v)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Found in your Facebook App Dashboard → App Settings → Basic.
              </p>
            </div>

            {/* Test result banner */}
            {testStatus === "success" && testResult && (
              <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-400">
                  Connection successful — App: <span className="font-medium">{testResult.appName ?? "Unknown"}</span>
                </p>
              </div>
            )}
            {testStatus === "error" && testResult && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3">
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
                <p className="text-sm text-destructive">{testResult.error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleTestConnection}
                disabled={testStatus === "testing" || !newAppId.trim() || !newAppSecret.trim()}
              >
                {testStatus === "testing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Test Connection
              </Button>

              <Button
                className="flex-1 gap-2"
                onClick={handleSave}
                disabled={saving || testStatus !== "success" || !newAppId.trim() || !newAppSecret.trim()}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save Credentials
              </Button>
            </div>

            {testStatus !== "success" && newAppId.trim() && newAppSecret.trim() && (
              <p className="text-xs text-muted-foreground text-center">
                Run "Test Connection" first to enable Save.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Change Log */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Change Log</CardTitle>
            </div>
            <CardDescription>Last 20 credential changes. App Secrets are never logged.</CardDescription>
          </CardHeader>
          <CardContent>
            {changelogLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : changelog.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                <Clock className="h-6 w-6 opacity-40" />
                <p className="text-sm">No changes recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {changelog.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 py-3">
                    <div className="mt-0.5 shrink-0">
                      <StatusIcon status={entry.status} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{entry.message}</p>
                      {entry.metadata?.changedBy && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          By: {entry.metadata.changedBy}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                      {formatRelative(entry.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Back link */}
        <div>
          <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={() => navigate("/settings")}>
            <ArrowLeft className="h-4 w-4" /> Back to Settings
          </Button>
        </div>
      </div>
    </Layout>
  );
}
