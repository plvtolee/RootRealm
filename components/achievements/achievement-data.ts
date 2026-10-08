export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

export type Achievement = {
  id: string;
  title: string;
  description: string;
  criteria: string;
  rarity: AchievementRarity;
  unlockedAt: string;
  source: string;
  evidenceHref: string;
  skillPoints: number;
};

export const ACHIEVEMENT_FILTERS = [
  "All",
  "Common",
  "Rare",
  "Epic",
  "Legendary",
] as const;

export const ACHIEVEMENT_RARITY_LABEL: Record<AchievementRarity, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

export const MOCK_ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: "first-commit",
    title: "First Commit",
    description: "Make your first commit on GitHub.",
    criteria: "Create at least one public commit.",
    rarity: "common",
    unlockedAt: "2024-03-12",
    source: "GitHub",
    evidenceHref: "https://github.com",
    skillPoints: 1,
  },
  {
    id: "open-source-contributor",
    title: "Open Source Contributor",
    description: "Contribute to a public repository.",
    criteria: "Merge a contribution into a public repository.",
    rarity: "rare",
    unlockedAt: "2024-04-05",
    source: "GitHub",
    evidenceHref: "https://github.com",
    skillPoints: 2,
  },
  {
    id: "bug-squasher",
    title: "Bug Squasher",
    description: "Fix 10 issues across repositories.",
    criteria: "Close 10 issues through verified fixes.",
    rarity: "rare",
    unlockedAt: "2024-05-18",
    source: "Issue tracker",
    evidenceHref: "https://github.com",
    skillPoints: 2,
  },
  {
    id: "documentation-hero",
    title: "Documentation Hero",
    description: "Write comprehensive docs.",
    criteria: "Publish meaningful documentation changes.",
    rarity: "epic",
    unlockedAt: "2024-06-02",
    source: "Documentation",
    evidenceHref: "https://github.com",
    skillPoints: 3,
  },
  {
    id: "release-engineer",
    title: "Release Engineer",
    description: "Publish 5 releases.",
    criteria: "Publish five verified releases.",
    rarity: "epic",
    unlockedAt: "2024-07-14",
    source: "Releases",
    evidenceHref: "https://github.com",
    skillPoints: 3,
  },
  {
    id: "community-supporter",
    title: "Community Supporter",
    description: "Helped 20+ people in discussions.",
    criteria: "Make 20 helpful discussion contributions.",
    rarity: "epic",
    unlockedAt: "2024-08-03",
    source: "Discussions",
    evidenceHref: "https://github.com",
    skillPoints: 3,
  },
  {
    id: "architect",
    title: "Architect",
    description: "Designed a complex system.",
    criteria: "Demonstrate a documented complex system design.",
    rarity: "legendary",
    unlockedAt: "2024-09-01",
    source: "System design",
    evidenceHref: "https://github.com",
    skillPoints: 5,
  },
  {
    id: "consistency-king",
    title: "Consistency King",
    description: "100 days of commits.",
    criteria: "Record verified activity across 100 days.",
    rarity: "legendary",
    unlockedAt: "2024-09-28",
    source: "GitHub activity",
    evidenceHref: "https://github.com",
    skillPoints: 5,
  },
];
