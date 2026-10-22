import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../dashboard/dashboard.css";
import "../groups/groups.css";
import "./series.css";
import "../chapters/chapters.css";

export const metadata: Metadata = {
  title: {
    default: "Series",
    template: "%s · HwaFlow",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function SeriesLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
