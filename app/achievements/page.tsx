import type { Metadata } from "next";

import { AchievementScreen } from "@/components/achievements/achievement-screen";

export const metadata: Metadata = {
  title: "Achievements",
};

export default function AchievementsPage() {
  return <AchievementScreen />;
}