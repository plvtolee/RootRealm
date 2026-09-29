import type { Metadata } from "next";

import { RoutePlaceholder } from "../_components/route-placeholder";

export const metadata: Metadata = {
  title: "Achievements",
};

/**
 * Achievements — the Task 1.5 navigation placeholder. The achievement screen
 * with rarity and unlock states arrives with Phase 2.
 */
export default function AchievementsPage() {
  return (
    <RoutePlaceholder
      title="Achievements"
      note="This route exists so the navigation has a destination with a verifiable active state. The achievement screen itself arrives with Phase 2."
    />
  );
}