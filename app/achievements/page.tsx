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
export default function AchievementsPage() {
  return <AchievementGate />;
}