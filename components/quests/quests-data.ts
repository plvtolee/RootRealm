export type QuestType = "daily" | "weekly" | "goal";

export type Quest = {
  id: string;
  type: QuestType;
  title: string;
  description: string;
  progress: number;
  target: number;
  reward: string;
  status: "active" | "completed" | "ready";
  dueLabel: string;
};

export const QUESTS: readonly Quest[] = [
  {
    id: "daily-merge",
    type: "daily",
    title: "Merge 3 pull requests",
    description: "Ship small cleanups and keep review conversations moving.",
    progress: 2,
    target: 3,
    reward: "150 XP",
    status: "active",
    dueLabel: "Ends in 6h",
  },
  {
    id: "weekly-ship",
    type: "weekly",
    title: "Ship 2 release notes",
    description: "Publish polished improvements and document the change clearly.",
    progress: 1,
    target: 2,
    reward: "400 XP",
    status: "active",
    dueLabel: "Ends in 3d",
  },
  {
    id: "goal-benchmark",
    type: "goal",
    title: "Reach 80% test coverage",
    description: "Strengthen reliability and keep the feature surface verified.",
    progress: 64,
    target: 80,
    reward: "750 XP",
    status: "ready",
    dueLabel: "Target milestone",
  },
];
