import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorBanner, sanitizeErrorMessage } from "./ErrorBanner";

interface Props {
  children?: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) {
      // In development, log for debugging without leaking in production
      console.error("[ErrorBoundary caught error]:", error, errorInfo);
    }
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      const technicalMsg = this.state.error?.message ? sanitizeErrorMessage(this.state.error.message) : undefined;
      return (
        <div className="flex min-h-[50vh] items-center justify-center p-6">
          <div className="w-full max-w-lg">
            <ErrorBanner
              title={this.props.fallbackTitle ?? "Something went wrong"}
              message="An unexpected error occurred. You can reload the page or return to Wilsify Studio."
              actionLabel="Reload page"
              onAction={() => window.location.reload()}
              secondaryActionLabel="Return to Studio"
              onSecondaryAction={() => window.location.assign("/studio")}
              technicalDetails={technicalMsg}
              role="alert"
            />
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
