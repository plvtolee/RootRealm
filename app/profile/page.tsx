import type { Metadata } from "next";

import { RoutePlaceholder } from "../_components/route-placeholder";

export const metadata: Metadata = {
  title: "Profile",
};

/**
 * Profile — the Task 1.5 navigation placeholder. The static profile screen
 * arrives with Phase 2 (TASKS §2.1).
 */
export default function ProfilePage() {
  return (
    <RoutePlaceholder
      title="Profile"
      note="This route exists so the navigation has a destination with a verifiable active state. The profile screen itself arrives with Phase 2."
    />
  );
}