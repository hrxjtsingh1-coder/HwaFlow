import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  variable: "--font-instrument",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#101319" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${instrument.variable} font-sans antialiased`}
      >
        <Script id="js-flag" strategy="beforeInteractive">
          {`document.documentElement.classList.add('js')`}
        </Script>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
