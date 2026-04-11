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
import UploadScheduler from "@/pages/upload-scheduler";

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
      <Route path="/fb-success" component={FbSuccess} />
      <Route path="/fb-connect" component={FbConnect} />
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
      <Route path="/upload">
        <ProtectedRoute component={UploadScheduler} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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
