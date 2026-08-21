import { useEffect, useMemo, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getListAccountsQueryKey, getListPagesQueryKey, getGetOverviewStatsQueryKey } from "@workspace/api-client-react";
import { Activity, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Status = "loading" | "success" | "error" | "expired";

const ERROR_MESSAGES: Record<string, string> = {
  app_not_configured: "Facebook App credentials are not configured. Please ask your agency admin to complete the Facebook App setup.",
  no_code: "Facebook login was cancelled.",
  invalid_state: "The Facebook connection could not be verified. Please try again.",
  access_denied: "Facebook access was denied. Please try reconnecting and grant all requested permissions.",
  magic_link_expired: "This magic link has expired. Please request a new one.",
  invalid_magic_link: "This magic link is invalid. Please request a new one.",
  "pages_read_engagement permission": "The 'pages_read_engagement' permission was not granted. Please reconnect and approve all permissions.",
};

function getErrorMessage(errorCode: string) {
  const matchingKey = Object.keys(ERROR_MESSAGES).find((key) => errorCode.includes(key));
  return matchingKey ? ERROR_MESSAGES[matchingKey] : errorCode || "The Facebook connection could not be completed.";
}

export default function FbConnect() {
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const connected = params.get("fb_connected") === "1";
  const fbError = params.get("fb_error");

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (connected) {
      void queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListPagesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetOverviewStatsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: ["scheduled-videos", "overview"] });
      void queryClient.invalidateQueries({ queryKey: ["scheduled-videos", "fb-overview"] });
      setStatus("success");
      setMessage("Your Facebook account and available Pages were connected successfully.");
      return;
    }

    if (fbError) {
      const isExpired = fbError.includes("magic_link_expired");
      setStatus(isExpired ? "expired" : "error");
      setMessage(getErrorMessage(fbError));
      return;
    }

    setStatus("error");
    setMessage("The Facebook connection result is missing. Please start the connection again from Accounts.");
  }, [connected, fbError, queryClient]);

  const goToAccounts = () => navigate("/accounts", { replace: true });
  const goToDashboard = () => navigate("/", { replace: true });

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-2 text-xl font-bold text-primary mb-2">
          <Activity className="h-6 w-6" />
          PageFlow
        </div>

        <Card className="w-full">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
            {status === "loading" && (
              <>
                <div className="bg-primary/10 p-5 rounded-full">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-1">Processing Connection</h2>
                  <p className="text-muted-foreground text-sm">Please wait while we process the Facebook connection result…</p>
                </div>
              </>
            )}

            {status === "success" && (
              <>
                <div className="bg-green-500/10 p-5 rounded-full">
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-1">Connection Verified!</h2>
                  <p className="text-muted-foreground text-sm">{message}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Open Accounts to confirm the connected account and manage its Pages.
                </p>
                <Button onClick={goToAccounts} className="w-full mt-2">
                  Go to Accounts
                </Button>
              </>
            )}

            {status === "expired" && (
              <>
                <div className="bg-yellow-500/10 p-5 rounded-full">
                  <XCircle className="h-10 w-10 text-yellow-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-1">Link Expired</h2>
                  <p className="text-muted-foreground text-sm">{message}</p>
                </div>
                <Button onClick={goToAccounts} variant="outline" className="w-full mt-2">
                  Go to Accounts
                </Button>
              </>
            )}

            {status === "error" && (
              <>
                <div className="bg-destructive/10 p-5 rounded-full">
                  <XCircle className="h-10 w-10 text-destructive" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-1">Connection Failed</h2>
                  <p className="text-muted-foreground text-sm">{message}</p>
                </div>
                <Button onClick={goToDashboard} variant="outline" className="w-full mt-2">
                  Back to Dashboard
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">Having issues? Contact your agency admin.</p>
      </div>
    </div>
  );
}
