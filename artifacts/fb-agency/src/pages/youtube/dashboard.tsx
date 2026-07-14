import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Youtube } from "lucide-react";

// Phase 1 placeholder — no backend, no data. Structure only.
export default function YoutubeDashboard() {
  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Youtube className="h-7 w-7 text-red-500" />
            YouTube Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Overview of your YouTube channels, uploads, and automation — coming soon.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
            <CardDescription>
              This module is being built in phases. Connect accounts, scheduling, and automation
              will appear here as each phase ships.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            No functionality is live yet on this page — this is a structural placeholder.
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
