import type { Metadata } from "next";

import { LandingPage } from "@/components/landing/landing-page";

/**
 * The landing page is request-rendered so Next can attach the per-request CSP
 * nonce to the inline RSC scripts. See e2e/security.e2e.ts.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    absolute: "RootRealm — Build your skills. Shape your realm.",
  },
  description:
    "An RPG-inspired developer progression system that turns public GitHub activity into earned skills, a character profile, achievements, and cosmetics.",
};

export default function Home() {
  return <LandingPage />;
}
