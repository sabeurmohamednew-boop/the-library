"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ReaderFailure } from "@/components/reader/ReaderFailure";

type ReaderErrorBoundaryProps = {
  children: ReactNode;
  downloadUrl: string;
  resetKey: string;
};

type ReaderErrorBoundaryState = {
  error: Error | null;
};

export class ReaderErrorBoundary extends Component<ReaderErrorBoundaryProps, ReaderErrorBoundaryState> {
  state: ReaderErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[reader-boundary]", error, info.componentStack);
    }
  }

  componentDidUpdate(previousProps: ReaderErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <ReaderFailure
          message="The reader hit an unexpected error. You can retry or download the file directly."
          downloadUrl={this.props.downloadUrl}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }

    return this.props.children;
  }
}
