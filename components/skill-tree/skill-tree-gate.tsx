"use client";

import { Text } from "@/components/ui/text";
import { SkillTreeScreen } from "@/components/skill-tree/skill-tree-screen";
import { useProfile } from "@/components/profile/profile-store";

/**
 * The skill tree for the developer's own evidence (TASKS 6.1, 6.6).
 *
 * The screen already accepted `events`, `developerLogin` and — since this change —
 * `learnedIds` and `attributeTotals`; nothing was passing them, so the tree was
 * evaluating an empty event list and rendering whatever that implied. This is the
 * gate that supplies them, from the same store the profile reads, which is what
 * makes the tree's requirements agree with the profile's attribute numbers rather
 * than merely looking plausible.
 *
 * Signed-out requests are stopped by the protected app layout. This gate only
 * consumes the authenticated, shared profile snapshot.
 */
export default function SkillTreeGate() {
  return <SkillTreeForLogin />;
}

function SkillTreeForLogin() {
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

  const { profile, events, learnedSkillIds } = store.snapshot;

  return (
    <SkillTreeScreen
      events={events}
      developerLogin={profile.character.login}
      learnedIds={learnedSkillIds}
      // The units the engine awarded, which several requirements are measured
      // against. Without them a requirement like "debugger 40" cannot evaluate.
      attributeTotals={profile.attributes}
    />
  );
}
