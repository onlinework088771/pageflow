import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background bg-[radial-gradient(800px_480px_at_80%_-10%,hsl(var(--primary)/0.10),transparent_60%)]">
      <Card className="w-full max-w-md mx-4 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.7)]">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-3 items-center">
            <span className="chip-blue flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
              <AlertCircle className="h-6 w-6" />
            </span>
            <h1 className="text-2xl font-bold text-foreground">404 Page Not Found</h1>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            The page you're looking for doesn't exist or has moved. Head back to your workspace to continue.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
