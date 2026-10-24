import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { Pipeline } from "@/components/pipeline";
import { Team } from "@/components/team";
import { Cta } from "@/components/cta";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Manhwa translation, made simple",
  description:
    "Upload raw manhwa panels, get natural English back, and keep every group's terms consistent. HwaFlow handles extraction, translation and proofreading so your team only reviews.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <div className="landing">
      <SiteHeader />
      <main id="main">
        <Hero />
        <Features />
        <Pipeline />
        <Team />
        <Cta />
      </main>
      <SiteFooter />
    </div>
  );
}
