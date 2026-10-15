import type { Metadata, Viewport } from "next";
import { Alegreya_Sans, Cinzel, Geist, Geist_Mono } from "next/font/google";

import { AppShell } from "@/components/layout/app-shell";

import "./globals.css";
import "./landing.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const rootDisplay = Cinzel({
  variable: "--font-rootrealm-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const rootBody = Alegreya_Sans({
  variable: "--font-rootrealm-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "RootRealm",
    template: "%s — RootRealm",
  },
  description:
    "An RPG-inspired developer identity and progression platform that turns verifiable GitHub activity into transparent progression.",
};

/**
 * Keep the app chrome aligned to the existing neutral application surface.
 * The landing page's warmer palette is scoped to its own root element.
 */
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b0c0e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={[
        geistSans.variable,
        geistMono.variable,
        rootDisplay.variable,
        rootBody.variable,
        "h-full",
        "antialiased",
      ].join(" ")}
    >
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
