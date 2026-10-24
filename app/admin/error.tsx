"use client";

import { ErrorState } from "@/components/error-state";

export default function AdminError({
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
      scope="admin"
      title="The admin console didn't load."
      copy="Group metadata could not be read this time. No group or member data was changed — try again, and use the rail to move to another screen meanwhile."
      framed={false}
    />
  );
}
