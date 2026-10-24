"use client";

import { ErrorState } from "@/components/error-state";

export default function ChaptersError({
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
      scope="chapters"
      title="The workspace didn't load."
      copy="This chapter could not be opened. Your saved pages and notes are still on the server — try again, and if it keeps failing open the series and continue from its chapter list."
      backHref="/groups"
      backLabel="Your groups"
    />
  );
}
