import type { Metadata } from "next";

import { RoutePlaceholder } from "../_components/route-placeholder";

export const metadata: Metadata = {
  title: "Skill Tree",
};

/**
 * Skill Tree — the Task 1.5 navigation placeholder. The branching tree,
 * node states and canvas interactions arrive with Phase 2 (TASKS §2.3).
 */
export default function SkillTreePage() {
  return (
    <RoutePlaceholder
      title="Skill Tree"
      note="This route exists so the navigation has a destination with a verifiable active state. The skill tree itself arrives with Phase 2."
    />
  );
}