import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QueryErrorStateProps {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  compact?: boolean;
}

function getMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "The request could not be completed.";
}

function isAuthenticationError(message: string): boolean {
  return /\b401\b|authentication required|invalid or expired token|unauthorized|session expired/i.test(message);
}

export function QueryErrorState({ error, title, onRetry, compact = false }: QueryErrorStateProps) {
  const message = getMessage(error);
  const authenticationError = isAuthenticationError(message);

  return (
    <div className={`flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 ${compact ? "p-3" : "p-5"}`} role="alert">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-destructive">
            {title ?? (authenticationError ? "Authentication required" : "Unable to load data")}
          </p>
          <p className="mt-1 break-words text-xs text-destructive/80">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="w-fit gap-2">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}
