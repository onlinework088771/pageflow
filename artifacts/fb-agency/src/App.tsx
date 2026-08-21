import { type ComponentType, Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/auth-context";
import { ProtectedRoute } from "@/components/protected-route";
import { Spinner } from "@/components/ui/spinner";
import { ErrorBoundary } from "@/components/error-boundary";
import { UiInteractionSound } from "@/components/ui-interaction-sound";

// Route-level code splitting keeps the initial bundle small; heavy pages
// (analytics, upload wizards) load on demand.
// A single retry handles stale/missing chunks after a deploy. If the module
// still fails, the mounted ErrorBoundary renders the recovery screen instead
// of allowing the whole application to become blank.
function lazyWithRecovery<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    const retryKey = `pageflow:lazy-retry:${window.location.pathname}`;
    try {
      const module = await importer();
      try {
        window.sessionStorage.removeItem(retryKey);
      } catch {
        // Storage can be unavailable in privacy-restricted browsers.
      }
      return module;
    } catch (error) {
      let alreadyRetried = false;
      try {
        alreadyRetried = window.sessionStorage.getItem(retryKey) === "1";
      } catch {
        alreadyRetried = true;
      }

      if (!alreadyRetried) {
        try {
          window.sessionStorage.setItem(retryKey, "1");
        } catch {
          // Continue to the boundary if storage cannot be written.
        }
        window.location.reload();
        return new Promise<never>(() => undefined);
      }

      console.error("[PageFlow] Lazy route failed after retry", error);
      throw error;
    }
  });
}

const NotFound = lazyWithRecovery(() => import("@/pages/not-found"));
const Login = lazyWithRecovery(() => import("@/pages/login"));
const Signup = lazyWithRecovery(() => import("@/pages/signup"));
const Overview = lazyWithRecovery(() => import("@/pages/overview"));
const Accounts = lazyWithRecovery(() => import("@/pages/accounts"));
const PagesManagement = lazyWithRecovery(() => import("@/pages/pages-management"));
const PageDetail = lazyWithRecovery(() => import("@/pages/page-detail"));
const FbSuccess = lazyWithRecovery(() => import("@/pages/fb-success"));
const FbConnect = lazyWithRecovery(() => import("@/pages/fb-connect"));
const SettingsHub = lazyWithRecovery(() => import("@/pages/settings-hub"));
const FbAppSettings = lazyWithRecovery(() => import("@/pages/settings"));
const FbDeveloperSettings = lazyWithRecovery(() => import("@/pages/fb-developer-settings"));
const UploadScheduler = lazyWithRecovery(() => import("@/pages/upload-scheduler"));
const AnalyticsHub = lazyWithRecovery(() => import("@/pages/analytics-hub"));
const Analytics = lazyWithRecovery(() => import("@/pages/analytics"));
const FacebookOverview = lazyWithRecovery(() => import("@/pages/facebook/overview"));
const SchedulerHub = lazyWithRecovery(() => import("@/pages/scheduler-hub"));
const PageManagement = lazyWithRecovery(() => import("@/pages/page-management"));
const YouTubeAccounts = lazyWithRecovery(() => import("@/pages/youtube-accounts"));
const YouTubeAutomation = lazyWithRecovery(() => import("@/pages/youtube-automation"));
const YouTubeChannelDetail = lazyWithRecovery(() => import("@/pages/youtube-channel-detail"));
const AcceptInvite = lazyWithRecovery(() => import("@/pages/accept-invite"));
const ScheduleManager = lazyWithRecovery(() => import("@/pages/schedule-manager"));
const Team = lazyWithRecovery(() => import("@/pages/team"));
const Billing = lazyWithRecovery(() => import("@/pages/billing"));
const ApiKeys = lazyWithRecovery(() => import("@/pages/api-keys"));
const Privacy = lazyWithRecovery(() => import("@/pages/privacy"));
const Terms = lazyWithRecovery(() => import("@/pages/terms"));
const DataDeletion = lazyWithRecovery(() => import("@/pages/data-deletion"));
const YoutubeDashboard = lazyWithRecovery(() => import("@/pages/youtube/dashboard"));
const YoutubeBulkUpload = lazyWithRecovery(() => import("@/pages/youtube/bulk-upload"));
const YoutubeScheduler = lazyWithRecovery(() => import("@/pages/youtube/scheduler"));
const YoutubeAnalytics = lazyWithRecovery(() => import("@/pages/youtube/analytics"));
const YoutubeDeveloperSettings = lazyWithRecovery(() => import("@/pages/youtube/developer-settings"));
const GroupAutomation = lazyWithRecovery(() => import("@/pages/group-automation"));
const GroupConnectedGroups = lazyWithRecovery(() => import("@/pages/group-connected-groups"));
const GroupAutoApprovalFinder = lazyWithRecovery(() => import("@/pages/group-auto-approval-finder"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function PageLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading page">
      <Spinner className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/terms" component={Terms} />
        <Route path="/data-deletion" component={DataDeletion} />
        <Route path="/fb-success" component={FbSuccess} />
        <Route path="/fb-connect" component={FbConnect} />
        <Route path="/accept-invite/:token" component={AcceptInvite} />
        <Route path="/">
          <ProtectedRoute component={Overview} />
        </Route>
        <Route path="/facebook">
          <ProtectedRoute component={FacebookOverview} />
        </Route>
        <Route path="/facebook/analytics">
          <ProtectedRoute component={Analytics} />
        </Route>
        <Route path="/scheduler">
          <ProtectedRoute component={SchedulerHub} />
        </Route>
        <Route path="/accounts">
          <ProtectedRoute component={Accounts} />
        </Route>
        <Route path="/pages">
          <ProtectedRoute component={PagesManagement} />
        </Route>
        <Route path="/pages/:id">
          <ProtectedRoute component={PageDetail} />
        </Route>
        <Route path="/settings">
          <ProtectedRoute component={SettingsHub} />
        </Route>
        <Route path="/settings/facebook-app">
          <ProtectedRoute component={FbAppSettings} />
        </Route>
        <Route path="/settings/developer">
          <ProtectedRoute component={FbDeveloperSettings} />
        </Route>
        <Route path="/upload">
          <ProtectedRoute component={UploadScheduler} />
        </Route>
        <Route path="/schedule">
          <ProtectedRoute component={ScheduleManager} />
        </Route>
        <Route path="/analytics">
          <ProtectedRoute component={AnalyticsHub} />
        </Route>
        <Route path="/page-management">
          <ProtectedRoute component={PageManagement} />
        </Route>
        <Route path="/team">
          <ProtectedRoute component={Team} />
        </Route>
        <Route path="/billing">
          <ProtectedRoute component={Billing} />
        </Route>
        <Route path="/api-keys">
          <ProtectedRoute component={ApiKeys} />
        </Route>
        <Route path="/youtube">
          <ProtectedRoute component={YoutubeDashboard} />
        </Route>
        <Route path="/youtube/bulk-upload">
          <ProtectedRoute component={YoutubeBulkUpload} />
        </Route>
        <Route path="/youtube/automation">
          <ProtectedRoute component={YouTubeAutomation} />
        </Route>
        <Route path="/youtube/scheduler">
          <ProtectedRoute component={YoutubeScheduler} />
        </Route>
        <Route path="/youtube/accounts">
          <ProtectedRoute component={YouTubeAccounts} />
        </Route>
        <Route path="/youtube/analytics">
          <ProtectedRoute component={YoutubeAnalytics} />
        </Route>
        <Route path="/youtube/developer-settings">
          <ProtectedRoute component={YoutubeDeveloperSettings} />
        </Route>
        <Route path="/group-automation/connected-groups">
          <ProtectedRoute component={GroupConnectedGroups} />
        </Route>
        <Route path="/group-automation/auto-approval-finder">
          <ProtectedRoute component={GroupAutoApprovalFinder} />
        </Route>
        <Route path="/group-automation">
          <ProtectedRoute component={GroupAutomation} />
        </Route>
        <Route path="/youtube-accounts">
          <ProtectedRoute component={YouTubeAccounts} />
        </Route>
        <Route path="/youtube-automation">
          <ProtectedRoute component={YouTubeAutomation} />
        </Route>
        <Route path="/youtube/:id">
          <ProtectedRoute component={YouTubeChannelDetail} />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
          <UiInteractionSound />
        </AuthProvider>
      </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
