import { SiteHeader } from "@/components/site-header";
import { Hero } from "@/components/hero";
import { CapabilityMarquee } from "@/components/capability-marquee";
import { Features } from "@/components/features";
import { Pipeline } from "@/components/pipeline";
import { Team } from "@/components/team";
import { Cta } from "@/components/cta";
import { SiteFooter } from "@/components/site-footer";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Hero />
        <CapabilityMarquee />
        <Features />
        <Pipeline />
        <Team />
        <Cta />
      </main>
      <SiteFooter />
    </>
  );
}
