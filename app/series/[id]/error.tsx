"use client";

import { ErrorState } from "@/components/error-state";

export default function SeriesError({
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
      scope="series"
      title="This series didn't load."
      copy="The series and its chapters could not be read this time. Nothing was lost — try again, or go back to your groups and reopen it."
      backHref="/groups"
      backLabel="Your groups"
    />
  );
}
