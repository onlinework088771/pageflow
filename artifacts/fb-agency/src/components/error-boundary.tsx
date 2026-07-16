import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <div className="space-y-2">
            <h2 className="text-xl font-bold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              This page hit an unexpected error. The error message below may help diagnose the issue.
            </p>
            <pre className="mt-3 text-left text-xs bg-muted rounded-lg px-4 py-3 max-w-xl overflow-auto whitespace-pre-wrap break-all">
              {this.state.error.message}
              {"\n"}
              {this.state.error.stack?.split("\n").slice(1, 6).join("\n")}
            </pre>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => this.setState({ error: null })}
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
