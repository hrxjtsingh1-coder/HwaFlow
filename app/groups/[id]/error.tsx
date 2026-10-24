"use client";

import { ErrorState } from "@/components/error-state";

export default function GroupDetailError({
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
      scope="groups.detail"
      title="This group didn't load."
      copy="Members, series and earnings could not be read this time. The group still exists — try again, or open a different group from the dashboard."
    />
  );
}
