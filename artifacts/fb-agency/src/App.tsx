import { Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/auth-context";
import { ProtectedRoute } from "@/components/protected-route";
import { Spinner } from "@/components/ui/spinner";

// Route-level code splitting keeps the initial bundle small; heavy pages
// (analytics, upload wizards) load on demand.
const NotFound = lazy(() => import("@/pages/not-found"));
const Login = lazy(() => import("@/pages/login"));
const Signup = lazy(() => import("@/pages/signup"));
const Overview = lazy(() => import("@/pages/overview"));
const Accounts = lazy(() => import("@/pages/accounts"));
const PagesManagement = lazy(() => import("@/pages/pages-management"));
const PageDetail = lazy(() => import("@/pages/page-detail"));
const FbSuccess = lazy(() => import("@/pages/fb-success"));
const FbConnect = lazy(() => import("@/pages/fb-connect"));
const SettingsHub = lazy(() => import("@/pages/settings-hub"));
const FbAppSettings = lazy(() => import("@/pages/settings"));
const FbDeveloperSettings = lazy(() => import("@/pages/fb-developer-settings"));
const UploadScheduler = lazy(() => import("@/pages/upload-scheduler"));
const AnalyticsHub = lazy(() => import("@/pages/analytics-hub"));
const Analytics = lazy(() => import("@/pages/analytics"));
const FacebookOverview = lazy(() => import("@/pages/facebook/overview"));
const SchedulerHub = lazy(() => import("@/pages/scheduler-hub"));
const PageManagement = lazy(() => import("@/pages/page-management"));
const YouTubeAccounts = lazy(() => import("@/pages/youtube-accounts"));
const YouTubeAutomation = lazy(() => import("@/pages/youtube-automation"));
const YouTubeChannelDetail = lazy(() => import("@/pages/youtube-channel-detail"));
const AcceptInvite = lazy(() => import("@/pages/accept-invite"));
const ScheduleManager = lazy(() => import("@/pages/schedule-manager"));
const Team = lazy(() => import("@/pages/team"));
const Billing = lazy(() => import("@/pages/billing"));
const ApiKeys = lazy(() => import("@/pages/api-keys"));
const Privacy = lazy(() => import("@/pages/privacy"));
const Terms = lazy(() => import("@/pages/terms"));
const DataDeletion = lazy(() => import("@/pages/data-deletion"));
const YoutubeDashboard = lazy(() => import("@/pages/youtube/dashboard"));
const YoutubeBulkUpload = lazy(() => import("@/pages/youtube/bulk-upload"));
const YoutubeScheduler = lazy(() => import("@/pages/youtube/scheduler"));
const YoutubeAnalytics = lazy(() => import("@/pages/youtube/analytics"));
const YoutubeDeveloperSettings = lazy(() => import("@/pages/youtube/developer-settings"));

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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
