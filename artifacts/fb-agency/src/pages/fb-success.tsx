import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { CheckCircle2, Activity, ArrowRight, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface SyncResult {
  synced: boolean;
  pages: Array<{ fbPageId: string; name: string; profilePicture?: string; category?: string }>;
}

export default function FbSuccess() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const accountName = params.get("account") ?? "your account";
  const pagesCount = parseInt(params.get("pages") ?? "0", 10);
  const hasError = params.get("error") === "1";

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold text-primary mb-2">
          <Activity className="h-6 w-6" />
          PageFlow
        </Link>

        {hasError ? (
          <>
            <div className="bg-destructive/10 p-5 rounded-full">
              <XCircle className="h-12 w-12 text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-2">Connection Failed</h1>
              <p className="text-muted-foreground">
                We couldn't connect your Facebook account. Please try again.
              </p>
            </div>
            <Button asChild className="gap-2 w-full">
              <Link href="/accounts">
                Try Again
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </>
        ) : (
          <>
            <div className="bg-green-500/10 p-5 rounded-full">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-2">Account Connected!</h1>
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">{accountName}</span> has been successfully connected to PageFlow.
                {pagesCount > 0 && (
                  <> We found <span className="font-semibold text-foreground">{pagesCount} page{pagesCount !== 1 ? "s" : ""}</span> associated with this account.</>
                )}
              </p>
            </div>

            {pagesCount > 0 && (
              <Card className="w-full">
                <CardContent className="pt-5 pb-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    Your pages are ready to be added to management.
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Pages synced</span>
                    <span className="font-bold text-primary">{pagesCount}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-col gap-3 w-full">
              <Button asChild className="w-full gap-2">
                <Link href="/pages">
                  Manage Pages
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/">Go to Dashboard</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
