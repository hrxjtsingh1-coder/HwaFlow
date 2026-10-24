"use client";

import { ErrorState } from "@/components/error-state";

export default function GroupsError({
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
      scope="groups"
      title="Your groups didn't load."
      copy="The list of groups could not be read this time. Nothing was changed — try again, or head back to the dashboard and reopen a group from there."
    />
  );
}
