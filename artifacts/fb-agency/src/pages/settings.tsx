import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import {
  useGetAgencySettings,
  getGetAgencySettingsQueryKey,
  useSetupFacebookApp,
  useUpdateAgencySettings,
  useVerifyFacebookCredentials,
  useGenerateMagicLink,
  useResetAgencySettings,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  ArrowLeft,
  Play,
  Loader2,
  Link2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

const TOTAL_STEPS = 5;

function StepIndicator({ currentStep }: { currentStep: number }) {
  const labels = ["Create App", "Privacy", "Go Live", "Auth Redirect", "Verification"];
  return (
    <div className="flex items-center justify-between mb-8 relative">
      <div className="absolute left-0 top-5 w-full h-0.5 bg-muted -z-10">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${((Math.min(currentStep, TOTAL_STEPS) - 1) / (TOTAL_STEPS - 1)) * 100}%` }}
        />
      </div>
      {labels.map((label, i) => {
        const s = i + 1;
        const done = currentStep > s;
        const active = currentStep === s;
        return (
          <div key={s} className="flex flex-col items-center gap-1">
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm border-2 bg-background transition-colors
                ${done ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary text-primary" : "border-muted text-muted-foreground"}`}
            >
              {done ? <CheckCircle2 className="h-5 w-5" /> : s}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${active ? "text-primary" : done ? "text-primary/70" : "text-muted-foreground"}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CopyableField({ value, label }: { value: string; label?: string }) {
  const { toast } = useToast();
  return (
    <div className="space-y-1">
      {label && <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>}
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-muted px-3 py-2 rounded border border-muted-foreground/20 text-foreground break-all">
          {value}
        </code>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast({ title: "Copied to clipboard" });
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { data: settings, isLoading } = useGetAgencySettings({ query: { queryKey: getGetAgencySettingsQueryKey() } });
  const setupFacebookApp = useSetupFacebookApp();
  const updateSettings = useUpdateAgencySettings();
  const verifyCredentials = useVerifyFacebookCredentials();
  const resetSettings = useResetAgencySettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyAppId, setVerifyAppId] = useState("");
  const [verifyAppSecret, setVerifyAppSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [removeExisting, setRemoveExisting] = useState(false);
  const [isReconfiguring, setIsReconfiguring] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const directCallbackUrl = `${origin}/api/auth/facebook/callback`;
  const magicCallbackUrl = `${origin}/api/auth/facebook/magic-callback`;
  const generatedPrivacyUrl = `${origin}/privacy`;

  const isConfigured = settings?.appConfigured && settings?.setupStep >= 5 && !isReconfiguring;

  const [initialized, setInitialized] = useState(false);

  // Only run once when settings first loads — never override local step after that
  useEffect(() => {
    if (settings && !initialized) {
      setInitialized(true);
      const savedStep = settings.setupStep ?? 0;
      if (settings.appConfigured && savedStep >= 5) {
        setStep(5);
      } else {
        setStep(Math.max(savedStep, 1));
      }
      setAppId(settings.appId || "");
      setAppSecret(settings.appSecret || "");
      setVerifyAppId(settings.appId || "");
      setPrivacyPolicyUrl(settings.privacyPolicyUrl || generatedPrivacyUrl);
      setAgencyName(settings.agencyName || "");
    }
  }, [settings, initialized, generatedPrivacyUrl]);

  const saveStep = (targetStep: number, extraData: Record<string, unknown> = {}) => {
    // Advance UI immediately — persist to backend in the background
    setStep(targetStep);
    setupFacebookApp.mutate(
      { data: { step: targetStep, ...extraData } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAgencySettingsQueryKey() });
        },
        onError: () => toast({ title: "Failed to save step — please try again", variant: "destructive" }),
      }
    );
  };

  const handleResetCredentials = () => {
    resetSettings.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAgencySettingsQueryKey() });
        setInitialized(false);
        setIsReconfiguring(false);
        setStep(1);
        setAppId("");
        setAppSecret("");
        setVerifyAppId("");
        setVerifyAppSecret("");
        setPrivacyPolicyUrl("");
        toast({ title: "Credentials removed", description: "Your Facebook app configuration has been permanently deleted." });
      },
      onError: () => {
        toast({ title: "Failed to remove credentials", variant: "destructive" });
      },
    });
  };

  const handleVerifyAndSave = () => {
    if (!verifyAppId || !verifyAppSecret) {
      toast({ title: "Please enter both App ID and App Secret", variant: "destructive" });
      return;
    }
    verifyCredentials.mutate(
      { data: { appId: verifyAppId, appSecret: verifyAppSecret } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getGetAgencySettingsQueryKey() });
          setIsReconfiguring(false);
          setStep(5);
          toast({ title: "App credentials verified!", description: `"${data.agencyName}" is ready to connect Facebook accounts.` });
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Verification failed. Check your App ID and Secret.";
          toast({ title: "Verification failed", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const renderConfiguredState = () => (
    <div className="space-y-6">
      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
        <div className="flex items-center gap-2 text-green-600 font-semibold mb-1">
          <CheckCircle2 className="h-5 w-5" />
          App Credentials Verified
        </div>
        <p className="text-sm text-muted-foreground">Your agency is ready to connect Facebook accounts.</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">App ID</Label>
          <p className="font-mono text-sm mt-1 font-medium">{settings?.appId}</p>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">App Secret</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type={showSecret ? "text" : "password"}
              value={settings?.appSecret || "••••••••••••••"}
              readOnly
              className="bg-muted/50 font-mono text-sm"
            />
            <Button variant="ghost" size="icon" onClick={() => setShowSecret((v) => !v)}>
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={removeExisting}
            onChange={(e) => setRemoveExisting(e.target.checked)}
            className="rounded"
          />
          <span className="text-muted-foreground">Remove existing accounts to update App ID</span>
        </label>
      </div>

      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={() => setIsReconfiguring(true)}
      >
        Update Credentials
      </Button>
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="bg-muted rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                <div>
                  <p className="text-sm font-medium">Create your Developer App</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Go to the <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">Facebook Developers Portal</a> and create a new App. You can follow this tutorial for step-by-step guidance.
                  </p>
                </div>
              </div>
              <div className="pl-9">
                <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10" asChild>
                  <a href="https://www.youtube.com/results?search_query=facebook+developer+app+setup+tutorial" target="_blank" rel="noreferrer">
                    <Play className="h-3.5 w-3.5" />
                    Watch Setup Tutorial
                  </a>
                </Button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                className="flex-1 gap-2"
                onClick={() => saveStep(2)}
                disabled={setupFacebookApp.isPending}
              >
                {setupFacebookApp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Next Step <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="bg-muted rounded-lg p-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Set Privacy Policy URL</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">
                    In your FB App Dashboard, go to <strong>App Settings → Basic</strong> in the left panel. Copy and paste the URL below into the <em>Privacy Policy URL</em> field.
                  </p>
                  <CopyableField value={generatedPrivacyUrl} />
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                <div>
                  <p className="text-sm font-medium">Save Changes</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Scroll to the bottom of the page and click the <strong>Save changes</strong> button.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="gap-2" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => saveStep(3, { privacyPolicyUrl: generatedPrivacyUrl })}
                disabled={setupFacebookApp.isPending}
              >
                {setupFacebookApp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Next Step <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="bg-muted rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                <div>
                  <p className="text-sm font-medium">Activate App Live Mode</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Look at the top bar of your Facebook Developer dashboard. Find the toggle that says{" "}
                    <strong>App Mode: Development</strong> and switch it to <strong>Live</strong>.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="gap-2" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => saveStep(4)}
                disabled={setupFacebookApp.isPending}
              >
                {setupFacebookApp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Next Step <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="bg-muted rounded-lg p-4 space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                <div>
                  <p className="text-sm font-medium">Add Facebook Login for Business</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    In the left side panel, click <strong>+ Add Product</strong> and find <strong>Facebook Login for Business</strong>. If you already see it in your sidebar, skip this step.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Configure Redirect URI</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">
                    Go to <strong>Facebook Login for Business → Settings</strong>. Paste this URL into <em>Valid OAuth Redirect URIs</em> and click <strong>Save changes</strong>.
                  </p>
                  <div className="space-y-3">
                    <CopyableField label="Direct Connection Callback" value={directCallbackUrl} />
                    <CopyableField label="Magic Link Callback" value={magicCallbackUrl} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Add <strong>both</strong> URLs to your Facebook app's Valid OAuth Redirect URIs.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="gap-2" onClick={() => setStep(3)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => saveStep(5)}
                disabled={setupFacebookApp.isPending}
              >
                {setupFacebookApp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Next Step <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="verifyAppId">Facebook App ID</Label>
                <Input
                  id="verifyAppId"
                  value={verifyAppId}
                  onChange={(e) => setVerifyAppId(e.target.value)}
                  placeholder="1064664161314204"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="verifyAppSecret">Facebook App Secret</Label>
                <div className="relative">
                  <Input
                    id="verifyAppSecret"
                    type={showSecret ? "text" : "password"}
                    value={verifyAppSecret}
                    onChange={(e) => setVerifyAppSecret(e.target.value)}
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
                <p className="text-xs text-muted-foreground">Found in App Settings → Basic of your FB Developer Dashboard.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="gap-2" onClick={() => setStep(4)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={handleVerifyAndSave}
                disabled={verifyCredentials.isPending || !verifyAppId || !verifyAppSecret}
              >
                {verifyCredentials.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Verify & Save
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const stepTitles: Record<number, string> = {
    1: "Step 1: Create App",
    2: "Step 2: Privacy Settings",
    3: "Step 3: Go Live",
    4: "Step 4: Auth Redirect",
    5: "Step 5: Verification",
  };

  return (
    <Layout>
      <div className="flex flex-col gap-8 max-w-4xl mx-auto">
        <div>
          <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
            <span>Agency</span>
            <ChevronRight className="h-3 w-3" />
            <span>Settings</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Agency Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your agency configuration and API credentials.</p>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-[300px] w-full" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        ) : (
          <Card className="border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                <span className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">BYOC Configuration</span>
              </div>
              {isConfigured && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2 text-xs"
                      disabled={resetSettings.isPending}
                    >
                      {resetSettings.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      {resetSettings.isPending ? "Removing..." : "Remove"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove Facebook App Credentials?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete your Facebook App ID, App Secret, and all BYOC configuration from the database. You will need to go through the setup wizard again to reconnect.
                        <br /><br />
                        <strong>This action cannot be undone.</strong>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={handleResetCredentials}
                      >
                        Yes, Remove Permanently
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              {isConfigured ? (
                <div className="space-y-2">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">{settings?.agencyName}</h3>
                    {settings?.appId && (
                      <p className="text-sm text-muted-foreground">App ID: {settings.appId}</p>
                    )}
                  </div>
                  {renderConfiguredState()}
                </div>
              ) : (
                <div className="max-w-xl mx-auto pt-4">
                  <StepIndicator currentStep={step} />
                  <div className="mb-4">
                    <h2 className="text-xl font-bold">{stepTitles[step] ?? "Setup"}</h2>
                  </div>
                  {renderStep()}
                  <div className="mt-6 flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => setStep(1)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
