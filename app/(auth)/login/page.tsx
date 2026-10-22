import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthExperience } from "@/components/auth/auth-experience";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to HwaFlow to review translated chapters, approve releases, and keep your scanlation group moving.",
};

export default async function LoginPage() {
  const user = await getViewer();
  if (user) redirect("/dashboard");

  return <AuthExperience initialMode="sign-in" initialUser={user} />;
}
