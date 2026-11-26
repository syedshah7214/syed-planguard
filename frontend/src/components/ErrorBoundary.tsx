import { Component, type ErrorInfo, type ReactNode } from "react";

interface State { error: Error | null }

/** Keeps one broken page from taking down the whole application shell. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page crashed:", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card empty empty--error" role="alert">
        <b>This page hit an unexpected error</b>
        <p className="muted small mono">{this.state.error.message}</p>
        <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
