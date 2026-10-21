import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "../icons";

/**
 * Centered 403 panel for signed-in non-admins. Signed-out visitors are routed
 * to /login before this renders.
 */
export function Forbidden({ username }: { username: string }) {
  return (
    <div className="admin-forbidden" role="alert">
      <div className="admin-forbidden-panel">
        <span className="admin-forbidden-icon" aria-hidden="true">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <p className="eyebrow">403</p>
        <h1 className="admin-forbidden-title">Platform admin only</h1>
        <p className="admin-forbidden-copy">
          You&apos;re signed in as{" "}
          <strong>@{username}</strong>. This console creates groups and assigns
          Owners, so it is limited to the platform admin account.
        </p>
        <Link href="/dashboard" className="btn btn-primary admin-forbidden-action">
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
