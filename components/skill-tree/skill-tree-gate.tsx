"use client";

import { Text } from "@/components/ui/text";
import { SkillTreeScreen } from "@/components/skill-tree/skill-tree-screen";
import {
  ProfileProvider,
  useProfile,
  useSessionLogin,
} from "@/components/profile/profile-store";

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
 * ## The signed-out state is the catalog, not a blank page
 *
 * With no session there is no developer, so there is nothing to derive a tree
 * from. The screen renders its browsing state — every node with its requirements
 * visible — because "look at what a RootRealm character can become" is a real
 * thing to show someone who has not signed in yet, and an empty page would not
 * communicate it.
 */
export default function SkillTreeGate() {
  const session = useSessionLogin();

  if (session.status === "loading") {
    return (
      <Text as="p" variant="body" className="text-text-secondary">
        Reading your activity from GitHub…
      </Text>
    );
  }

  if (session.login === null) {
    return <SkillTreeScreen />;
  }

  return (
    <ProfileProvider login={session.login}>
      <SkillTreeForLogin />
    </ProfileProvider>
  );
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