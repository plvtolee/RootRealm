"use client";

import { Text } from "@/components/ui/text";
import { AchievementScreen } from "@/components/achievements/achievement-screen";
import { useProfile } from "@/components/profile/profile-store";

/**
 * Achievements for the developer's own evidence (TASKS 7.1, 7.3).
 *
 * The screen already accepted `events` and `earnedIds`; this gate supplies both
 * from the shared store established by the protected app layout.
 *
 * ## Why earned ids come from the aggregate and not from re-deriving here
 *
 * `computeAchievementView` is the same pure function the server ran, so the screen
 * and the profile cannot disagree about what is earned. The earned set is taken
 * from the aggregate rather than recomputed, which preserves TASKS 7.3's rule
 * that an award is *recorded* and a later change in the evidence does not revoke
 * it.
 */
export default function AchievementGate() {
  return <AchievementsForLogin />;
}

function AchievementsForLogin() {
  const store = useProfile();

  if (store.status !== "ready" || store.snapshot === null) {
    return (
      <Text as="p" variant="body" className="text-text-secondary">
        {store.status === "error"
          ? (store.error ?? "GitHub did not answer.")
          : "Reading your activity from GitHub…"}
      </Text>
    );
  }

  const { profile, events } = store.snapshot;

  return (
    <AchievementScreen
      events={events}
      earnedIds={profile.achievements.achievements
        .filter((achievement) => achievement.earned)
        .map((achievement) => achievement.definition.id)}
    />
  );
}
