import type { ReactNode } from "react";
import "../dashboard/dashboard.css";
import "./settings.css";

export default function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
