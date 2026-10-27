import type { Metadata, Viewport } from "next";
import {
  Archivo_Black,
  IBM_Plex_Mono,
  Inter,
} from "next/font/google";
import { CookieBanner } from "@/components/cookie-banner";
import { FocusTracker } from "@/components/focus-tracker";
import { THEME_COLOR, THEME_KEY } from "@/lib/theme-contract";
import "./globals.css";
import "./motion.css";
import "./landing.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const archivo = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-archivo",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const title = "HwaFlow — Manhwa translation, made simple";
const description =
  "HwaFlow turns raw manhwa panels into natural English. Your team reviews the words, approves the chapter, and gets credit for the work, without the busywork.";

export const metadata: Metadata = {
  title: {
    default: title,
    template: "%s · HwaFlow",
  },
  description,
  applicationName: "HwaFlow",
  keywords: [
    "manhwa translation",
    "scanlation",
    "translation workflow",
    "Korean to English",
    "Japanese to English",
    "Chinese to English",
  ],
  openGraph: {
    title,
    description,
    siteName: "HwaFlow",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  /*
   * Two entries keyed to the OS preference, so the browser chrome is the right
   * colour before any JavaScript runs. The inline script below overwrites both
   * as soon as a stored choice exists, because a stored choice outranks the OS.
   */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
  colorScheme: "light dark",
};

/**
 * Runs before the app paints, so a stored dark preference never flashes
 * light first. Kept inline and dependency-free on purpose.
 */
const THEME_BOOTSTRAP =
  `(function(){try{var d=document.documentElement;` +
  `var p=localStorage.getItem(${JSON.stringify(THEME_KEY)});` +
  `var t=(p==="light"||p==="dark")?p:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");` +
  `d.dataset.theme=t;d.style.colorScheme=t;` +
  `var m=document.querySelectorAll('meta[name="theme-color"]');` +
  `for(var i=0;i<m.length;i++)m[i].setAttribute("content",t==="dark"?${JSON.stringify(THEME_COLOR.dark)}:${JSON.stringify(THEME_COLOR.light)});` +
  `}catch(e){document.documentElement.dataset.theme="light";}` +
  `document.documentElement.classList.add("js");})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${archivo.variable} ${plexMono.variable} font-sans antialiased`}
      >
        <script
          id="theme-bootstrap"
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }}
        />
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <FocusTracker>{children}</FocusTracker>
        <CookieBanner />
      </body>
    </html>
  );
}
