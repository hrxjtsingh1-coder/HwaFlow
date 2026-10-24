"use client";

import { ErrorState } from "@/components/error-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      scope="app"
      title="This page hit an error it couldn't recover from."
      copy="Your work is saved on the server. Try loading the page again — if it keeps failing, go back to the dashboard and reopen what you were doing."
    />
  );
}
