import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppShell } from "@/components/layout/app-shell";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
 * The dark document is not a preference — RootRealm is a near-black interface
 * (DESIGN_SYSTEM §27), so the color scheme and the browser chrome are fixed
 * here. `themeColor` has to be a literal because the meta tag is written before
 * any CSS is parsed; it mirrors `--color-bg` (styles/tokens/color.css).
 */
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b0c0e",
};

/**
 * The root layout owns the document and the shell (Task 1.4) and nothing else:
 * every screen renders inside `AppShell`, which supplies the global background,
 * the content container and the `<main>` landmark.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

