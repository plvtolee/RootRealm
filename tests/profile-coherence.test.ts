import { describe, expect, it } from "vitest";

import { toProfileScreenProps } from "@/components/profile/profile-adapter";
import { clearProfileCache, loadProfile } from "@/components/profile/profile-store";
import type { AggregatedProfile } from "@/lib/profile/aggregate";

/**
 * The coherence layer's two real rules:
 *
 * 1. the adapter never invents a number the domain did not compute, and
 * 2. the store issues one request per login however many consumers ask.
 *
 * Both are asserted here rather than assumed, because both have a failure mode
 * that looks like working software: a plausible mock, and two screens quietly
 * disagreeing.
 */

const CHARACTER = {
  login: "octocat",
  displayName: "The Octocat",
  avatarUrl: null,
  bio: "Building things",
  location: "San Francisco",
  verified: false,
};

const BASE: AggregatedProfile = {
  character: CHARACTER,
  progression: {
    totalXp: 1240,
    level: { level: 3, xpIntoLevel: 240, xpForLevel: 1000, xpForNext: 760, progress: 0.24 },
  },
  attributes: { builder: 72, debugger: 8, scholar: 0, collaborator: 12, maintainer: 0, architect: 0 },
  achievements: {
    achievements: [],
    earnedCount: 0,
    totalCount: 0,
    rarityCounts: { common: 0, rare: 0, epic: 0, legendary: 0 },
  },
  featuredRepository: null,
  cosmetics: null,
  questState: null,
} as AggregatedProfile;

describe("toProfileScreenProps — uses what the domain computed", () => {
  it("takes the level and XP from the progression, not from the screen's own shape", () => {
    const props = toProfileScreenProps(BASE, { verified: true });

    expect(props.level).toBe(3);
    expect(props.xpCurrent).toBe(1240);
    // The screen wants an absolute target for the bar: what is held plus what is
    // still needed. 240 + 760.
    expect(props.xpToNextLevel).toBe(1000);
  });

  it("reports the developer's own login, not a name composed for them", () => {
    expect(toProfileScreenProps(BASE, { verified: false }).username).toBe("octocat");
  });

  it("uses the GitHub bio as the headline when there is one", () => {
    expect(toProfileScreenProps(BASE, { verified: true }).headline).toBe("Building things");
  });

  it("passes verification through, so a preview never claims ownership", () => {
    expect(toProfileScreenProps(BASE, { verified: false }).verified).toBe(false);
  });
});

describe("toProfileScreenProps — absences are stated, not invented", () => {
  it("says the location is unknown rather than showing a placeholder city", () => {
    const props = toProfileScreenProps(
      { ...BASE, character: { ...CHARACTER, location: null } } as AggregatedProfile,
      { verified: true },
    );

    expect(props.location).toBe("Location not provided");
  });

  it("renders no featured project when none was observed", () => {
    const props = toProfileScreenProps(BASE, { verified: true });

    expect(props.featuredProject.name).toBe("No featured project");
    // A technology chip for something never observed would be the app claiming a
    // stack it did not see.
    expect(props.featuredProject.stack).toEqual([]);
  });

  it("uses the observed repository when there is one, including its language", () => {
    const props = toProfileScreenProps(
      {
        ...BASE,
        featuredRepository: {
          fullName: "octocat/hello-world",
          description: "My first repo",
          url: "https://github.com/octocat/hello-world",
          primaryLanguage: "TypeScript",
          stars: 1200,
        },
      } as AggregatedProfile,
      { verified: true },
    );

    expect(props.featuredProject.name).toBe("octocat/hello-world");
    expect(props.featuredProject.stack).toEqual(["TypeScript"]);
    expect(props.featuredProject.starsLabel).toBe("1.2k stars");
  });

  it("reports a maxed level as already at its target rather than an impossible one", () => {
    const props = toProfileScreenProps(
      {
        ...BASE,
        progression: {
          totalXp: 99_999,
          level: { level: 99, xpIntoLevel: 500, xpForLevel: null, xpForNext: null, progress: null },
        },
      } as AggregatedProfile,
      { verified: true },
    );

    expect(props.xpToNextLevel).toBe(99_999);
  });
});

describe("toProfileScreenProps — attributes", () => {
  it("renders all six in contract order, with zero for an untouched attribute", () => {
    const props = toProfileScreenProps(BASE, { verified: true });

    expect(props.attributes).toHaveLength(6);
    expect(props.attributes[0]).toMatchObject({ attribute: "builder", value: 72 });
    // Zero is what a sum over no awarded units is, not a missing value.
    expect(props.attributes.find((a) => a.attribute === "architect")?.value).toBe(0);
  });
});

describe("toProfileScreenProps — recent achievements", () => {
  const withAchievements = (count: number): AggregatedProfile =>
    ({
      ...BASE,
      achievements: {
        achievements: Array.from({ length: count }, (_, index) => ({
          definition: { id: `a${index}`, title: `Achievement ${index}`, rarity: "rare" },
          progress: {},
          earned: true,
        })),
        earnedCount: count,
        totalCount: count,
        rarityCounts: { common: 0, rare: count, epic: 0, legendary: 0 },
      },
    }) as unknown as AggregatedProfile;

  it("lists four and counts the remainder", () => {
    const props = toProfileScreenProps(withAchievements(7), { verified: true });

    expect(props.recentAchievements).toHaveLength(4);
    expect(props.additionalAchievements).toBe(3);
  });

  it("shows the catalog title, not the id", () => {
    const props = toProfileScreenProps(withAchievements(1), { verified: true });
    expect(props.recentAchievements[0]?.name).toBe("Achievement 0");
  });

  it("does not report a negative remainder when nothing is earned", () => {
    expect(toProfileScreenProps(BASE, { verified: true }).additionalAchievements).toBe(0);
  });
});

describe("the store's request cache", () => {
  it("issues one request per login however many callers ask", async () => {
    clearProfileCache();

    const original = globalThis.fetch;
    let calls = 0;

    globalThis.fetch = (async () => {
      calls += 1;
      return {
        json: async () => ({ preview: { profile: BASE, events: [] } }),
      } as unknown as Response;
    }) as typeof fetch;

    try {
      const [first, second] = await Promise.all([
        loadProfile("cached-user"),
        loadProfile("cached-user"),
      ]);

      expect(calls).toBe(1);
      expect(first.login).toBe("cached-user");
      expect(second.login).toBe("cached-user");
    } finally {
      globalThis.fetch = original;
      clearProfileCache();
    }
  });

  it("does not cache a failure, so one outage cannot blank every screen", async () => {
    clearProfileCache();

    const original = globalThis.fetch;
    let calls = 0;

    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("GitHub is unavailable");
    }) as typeof fetch;

    try {
      await expect(loadProfile("flaky-user")).rejects.toThrow(/unavailable/);
      // A second attempt must actually retry rather than replay the cached failure.
      await expect(loadProfile("flaky-user")).rejects.toThrow(/unavailable/);
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = original;
      clearProfileCache();
    }
  });

  it("raises the endpoint's own message when there is no preview", async () => {
    clearProfileCache();

    const original = globalThis.fetch;
    globalThis.fetch = (async () => ({
      json: async () => ({ preview: null, failure: { message: "That is not a GitHub username." } }),
    })) as unknown as typeof fetch;

    try {
      await expect(loadProfile("ghost")).rejects.toThrow(/not a GitHub username/);
    } finally {
      globalThis.fetch = original;
      clearProfileCache();
    }
  });
});