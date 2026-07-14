import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Youtube } from "lucide-react";

// Phase 1 placeholder — no backend, no data. Structure only.
export default function YoutubeScheduler() {
  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Youtube className="h-7 w-7 text-red-500" />
            YouTube Scheduler
          </h1>
          <p className="text-muted-foreground mt-1">
            Upload, schedule, and manage Shorts and long-form videos.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
            <CardDescription>
              Single/bulk upload, drafts, scheduled, published, failed, and history views will be
              implemented in a later phase.
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
