import type { Metadata } from "next";
import { DashboardHome } from "@/components/dashboard/dashboard-home";

export const metadata: Metadata = {
  title: "Overview",
  description:
    "Your HwaFlow workspace — review chapters, follow the translation pipeline, keep names consistent, and see what your group has shipped.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DashboardPage() {
  return <DashboardHome />;
}
