import type { Metadata } from "next";
import { AuthExperience } from "@/components/auth/auth-experience";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Create a HwaFlow account with a username and password. No email, no credit card — just pick up a panel and start translating.",
};

export default function RegisterPage() {
  return <AuthExperience initialMode="sign-up" />;
}
