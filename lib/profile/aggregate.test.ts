import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";
import { aggregateProfile } from "./aggregate";

function merged(id: string): DeveloperEvent {
  return {
    id,
    kind: "pull_request",
    developerLogin: "octocat",
    developerId: null,
    repositoryId: null,
    repositoryFullName: "octocat/hello",
    occurredAt: "2026-10-01T00:00:00.000Z",
    visibility: "public",
    confidence: "verified",
    sourceUrl: null,
    relevance: "scored",
    limitations: [],
    evidence: { number: 1, action: "merged", merged: true, testFiles: null, headRef: null, baseRef: null },
  } as unknown as DeveloperEvent;
}

describe("aggregateProfile (8.1)", () => {
  it("falls back to the login when GitHub supplied no name", () => {
    const profile = aggregateProfile({ login: "octocat", events: [] });

    expect(profile.character.login).toBe("octocat");
    expect(profile.character.displayName).toBe("octocat");
    expect(profile.character.verified).toBe(false);
  });

  it("uses the GitHub display name when present", () => {
    const profile = aggregateProfile({
      login: "octocat",
      profile: { login: "octocat", name: "The Octocat", avatarUrl: null, bio: null, location: null } as never,
      events: [],
    });

    expect(profile.character.displayName).toBe("The Octocat");
  });

  it("scores events once into XP and attributes", () => {
    const profile = aggregateProfile({ login: "octocat", events: [merged("a")] });

    expect(profile.progression.totalXp).toBeGreaterThan(0);
    expect(profile.attributes.builder).toBeGreaterThan(0);
  });

  it("always exposes all six attributes", () => {
    const profile = aggregateProfile({ login: "octocat", events: [] });

    expect(Object.keys(profile.attributes).sort()).toEqual(
      ["architect", "builder", "collaborator", "debugger", "maintainer", "scholar"],
    );
  });

  it("evaluates achievements from the same events", () => {
    const profile = aggregateProfile({
      login: "octocat",
      events: [merged("a")],
      earnedAchievementIds: new Set(["first-merge"]),
    });

    const firstMerge = profile.achievements.achievements.find((v) => v.definition.id === "first-merge");
    expect(firstMerge?.earned).toBe(true);
    expect(profile.achievements.earnedCount).toBe(1);
  });

  it("names cosmetics and quest state as absent rather than inventing them", () => {
    const profile = aggregateProfile({ login: "octocat", events: [] });

    expect(profile.cosmetics).toBeNull();
    expect(profile.questState).toBeNull();
  });

  it("is deterministic for the same events", () => {
    const events = [merged("a"), merged("b")];
    expect(aggregateProfile({ login: "octocat", events })).toEqual(
      aggregateProfile({ login: "octocat", events }),
    );
  });
});