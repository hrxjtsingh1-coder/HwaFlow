import type { Metadata } from "next";
import { AuthExperience } from "@/components/auth/auth-experience";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to HwaFlow to review translated chapters, approve releases, and keep your scanlation group moving.",
};

export default function LoginPage() {
  return <AuthExperience initialMode="sign-in" />;
}
