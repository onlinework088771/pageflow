import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/auth-context";
import { ProtectedRoute } from "@/components/protected-route";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import Overview from "@/pages/overview";
import Accounts from "@/pages/accounts";
import PagesManagement from "@/pages/pages-management";
import PageDetail from "@/pages/page-detail";
import FbSuccess from "@/pages/fb-success";
import FbConnect from "@/pages/fb-connect";
import Settings from "@/pages/settings";
import FbDeveloperSettings from "@/pages/fb-developer-settings";
import UploadScheduler from "@/pages/upload-scheduler";
import Analytics from "@/pages/analytics";
import PageManagement from "@/pages/page-management";
import YouTubeAccounts from "@/pages/youtube-accounts";
import YouTubeAutomation from "@/pages/youtube-automation";
import YouTubeChannelDetail from "@/pages/youtube-channel-detail";
import AcceptInvite from "@/pages/accept-invite";
import ScheduleManager from "@/pages/schedule-manager";
import Team from "@/pages/team";
import Billing from "@/pages/billing";
import ApiKeys from "@/pages/api-keys";
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";
import DataDeletion from "@/pages/data-deletion";
import YoutubeDashboard from "@/pages/youtube/dashboard";
import YoutubeBulkUpload from "@/pages/youtube/bulk-upload";
import YoutubeScheduler from "@/pages/youtube/scheduler";
import YoutubeAnalytics from "@/pages/youtube/analytics";
import YoutubeDeveloperSettings from "@/pages/youtube/developer-settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function Router() {
  return (
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
        <ProtectedRoute component={Settings} />
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
        <ProtectedRoute component={Analytics} />
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
