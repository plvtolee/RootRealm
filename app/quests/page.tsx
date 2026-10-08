import type { Metadata } from "next";

import { QuestsScreen } from "@/components/quests/quests-screen";

export const metadata: Metadata = {
  title: "Quests",
};

export default function QuestsPage() {
  return <QuestsScreen />;
}
