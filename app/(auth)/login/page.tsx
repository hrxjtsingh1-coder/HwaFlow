import type { Metadata } from "next";

import { AuthExperience } from "@/components/auth/auth-experience";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to HwaFlow to review translated chapters, approve releases, and keep your scanlation group moving.",
};

export default async function LoginPage() {
  /*
   * No redirect for a signed-in viewer here. `login()` sets the session cookie,
   * and setting a cookie in a Server Action re-renders this route in the same
   * response (next/dist/docs/01-app/03-api-reference/04-functions/cookies.md).
   * A redirect on that render fired before the client could paint the 3.2s
   * success screen, so the screen was skipped entirely. AuthExperience shows
   * its "already signed in" card for a viewer instead.
   */
  const user = await getViewer();

  return <AuthExperience initialMode="sign-in" initialUser={user} />;
}
