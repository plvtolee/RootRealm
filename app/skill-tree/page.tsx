import type { Metadata } from "next";

import { SkillTreeScreen } from "@/components/skill-tree/skill-tree-screen";

export const metadata: Metadata = {
  title: "Skill Tree",
};

export default function SkillTreePage() {
  return <SkillTreeScreen />;
}
