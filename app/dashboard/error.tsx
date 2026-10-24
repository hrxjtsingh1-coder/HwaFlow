"use client";

import { ErrorState } from "@/components/error-state";

export default function DashboardError({
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
      scope="dashboard"
      title="Your dashboard didn't load."
      copy="Something failed while loading this week's numbers. Nothing you saved is affected — try again, and if it keeps failing open a group and keep working."
      backHref="/groups"
      backLabel="Your groups"
    />
  );
}
