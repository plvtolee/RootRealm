import type { Metadata } from "next";

import { MOCK_PROFILE } from "@/components/profile/profile-data";
import { ProfileScreen } from "@/components/profile/profile-screen";

export const metadata: Metadata = {
  title: "Profile",
};

/**
 * Profile — the static Phase 2 profile screen (TASKS §2.1).
 *
 * The route stays thin: it selects the typed mock object and hands it to the
 * presentational screen. There is no backend, no GitHub call and no scoring
 * behind anything it renders (`components/profile/profile-data.ts`).
 */
export default function ProfilePage() {
  return <ProfileScreen profile={MOCK_PROFILE} />;
}