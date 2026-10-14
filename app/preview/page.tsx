import type { Metadata } from "next";

import { ProfilePreview } from "@/components/profile/profile-preview";

export const metadata: Metadata = {
  title: "Profile preview",
};

/**
 * Public profile preview — TASKS 8.2 and 8.3.
 *
 * A GitHub username produces a real RootRealm profile with no login. The route
 * stays thin: it renders the client component that calls
 * `/api/github/profile-preview`, where the ingestion, scoring and aggregation
 * happen.
 */
/**
 * Rendered per request so `proxy.ts` can attach the CSP nonce to every script.
 * A page prerendered at build time has no nonce available and its inline RSC
 * payload is blocked. See the note in `app/page.tsx`.
 *
 * This page has nothing to gain from prerendering anyway: it is a username form
 * that then queries GitHub live.
 */
export const dynamic = "force-dynamic";

export default function PreviewPage() {
  return <ProfilePreview />;
}