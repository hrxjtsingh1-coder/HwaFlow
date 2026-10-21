import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import "./admin.css";

export const metadata: Metadata = {
  // Re-declare the template: a plain `title` here consumes the root template,
  // which would leave child pages like `/admin/groups` without the site suffix.
  title: {
    default: "Admin",
    template: "%s · HwaFlow",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
