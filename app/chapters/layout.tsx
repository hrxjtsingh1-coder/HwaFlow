import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../dashboard/dashboard.css";
import "../groups/groups.css";
import "./chapters.css";

export const metadata: Metadata = {
  title: {
    default: "Chapter",
    template: "%s · HwaFlow",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function ChaptersLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
