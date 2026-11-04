import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  /** Shown in the inline notice, e.g. "player". */
  label: string;
  /** Changing it clears a caught error (e.g. the audio URL of a new track). */
  resetKey?: unknown;
  children: ReactNode;
}

interface State {
  /** resetKey seen at the last render; a different one clears the error. */
  lastKey: unknown;
  failed: boolean;
}

/**
 * Keeps a render error in one Analysis card inside that card. Without it the
 * error reaches the router's errorElement and replaces the whole page with
 * the "Reload page" screen, mid-playback.
 */
export class SectionBoundary extends Component<Props, State> {
  state: State = { failed: false, lastKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // A new track (new resetKey) gets a fresh try.
    if (props.resetKey !== state.lastKey) return { failed: false, lastKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Analysis ${this.props.label} failed to render`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="status"
        className="mt-6 rounded-xl border border-[var(--color-ns-amber)]/35 bg-[var(--color-ns-amber)]/10 px-4 py-3 text-xs text-[var(--color-ns-text)] sm:text-sm"
      >
        The {this.props.label} couldn&apos;t be shown for this track. The rest of the analysis is still valid.
      </div>
    );
  }
}
