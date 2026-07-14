import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Youtube } from "lucide-react";

// Phase 1 placeholder — no backend, no data. Structure only.
export default function YoutubeAnalytics() {
  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Youtube className="h-7 w-7 text-red-500" />
            YouTube Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Statistics, charts, and reports for your YouTube channels.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
            <CardDescription>
              Analytics and reporting will be implemented in the final phase.
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
