import type { Metadata } from "next";

import { AuthExperience } from "@/components/auth/auth-experience";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Create a HwaFlow account with a username and password. No email, no credit card — just pick up a panel and start translating.",
};

export default async function RegisterPage() {
  // See the note in `login/page.tsx`: no redirect on a cookie-setting render.
  const user = await getViewer();

  return <AuthExperience initialMode="sign-up" initialUser={user} />;
}
