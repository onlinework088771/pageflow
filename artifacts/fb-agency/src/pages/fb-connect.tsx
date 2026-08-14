import { useEffect, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { Activity, Link2, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Status = "loading" | "success" | "error" | "expired";

export default function FbConnect() {
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(searchString);
  const token = params.get("token");

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No magic link token provided.");
      return;
    }

    const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const apiBase = BASE_URL.replace(/\/[^/]*$/, "/api-server");

    async function verifyLink() {
      try {
        const res = await fetch(`${apiBase}/agency/magic-link/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (res.ok) {
          const data = await res.json();
          setStatus("success");
          setMessage(data.message ?? "Connection verified successfully.");
        } else if (res.status === 410) {
          setStatus("expired");
          setMessage("This magic link has expired. Please request a new one.");
        } else {
          const data = await res.json().catch(() => ({}));
          setStatus("error");
          setMessage(data.error ?? "Invalid or used magic link.");
        }
      } catch {
        setStatus("error");
        setMessage("Network error. Please try again.");
      }
    }

    verifyLink();
  }, [token]);

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
                  <h2 className="text-xl font-bold mb-1">Verifying Connection</h2>
                  <p className="text-muted-foreground text-sm">
                    Please wait while we verify your magic link…
                  </p>
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
                  Your Facebook account has been linked. You can close this window and return to the dashboard.
                </p>
                <Button onClick={() => navigate("/")} className="w-full mt-2">
                  Go to Dashboard
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
                <Button onClick={() => navigate("/accounts")} variant="outline" className="w-full mt-2">
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
                  <h2 className="text-xl font-bold mb-1">Verification Failed</h2>
                  <p className="text-muted-foreground text-sm">{message}</p>
                </div>
                <Button onClick={() => navigate("/")} variant="outline" className="w-full mt-2">
                  Back to Dashboard
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Having issues? Contact your agency admin.
        </p>
      </div>
    </div>
  );
}
