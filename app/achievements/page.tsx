import type { Metadata } from "next";

import AchievementGate from "@/components/achievements/achievement-gate";

export const metadata: Metadata = {
  title: "Achievements",
};

/**
 * Achievements — the developer's own evidence (TASKS 7.1, 7.3).
 *
 * The route stays thin: it selects the gate, which resolves the session and hands
 * the screen the shared store's events and earned ids. Client-rendered because the
 * session cookie is HttpOnly.
 */
/**
 * Rendered per request so `proxy.ts` can attach the CSP nonce to every script.
 * A page prerendered at build time has no nonce available and its inline RSC
 * payload is blocked. See the note in `app/page.tsx`.
 */
export const dynamic = "force-dynamic";

export default function AchievementsPage() {
  return <AchievementGate />;
}