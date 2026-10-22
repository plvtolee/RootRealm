import { describe, expect, it } from "vitest";

import { createInMemoryProgressionStore } from "../db/progression-store";
import { learnSkill } from "./service";

describe("skill mutation service", () => {
  it("persists a learn and returns it on a repeated request", async () => {
    const store = createInMemoryProgressionStore();
    const input = {
      userId: "user-1",
      developerLogin: "octocat",
      skillId: "origin",
      events: [],
      store,
      now: "2026-10-14T00:00:00.000Z",
    } as const;

    await expect(learnSkill(input)).resolves.toMatchObject({
      learnedIds: ["origin"],
      duplicate: false,
    });
    await expect(learnSkill(input)).resolves.toMatchObject({
      learnedIds: ["origin"],
      duplicate: true,
    });
  });

  it("keeps persisted unlocks isolated to the authenticated user id", async () => {
    const store = createInMemoryProgressionStore();

    await learnSkill({
      userId: "user-1",
      developerLogin: "octocat",
      skillId: "origin",
      events: [],
      store,
    });

    expect([...await store.learnedSkillIds("user-1")]).toEqual(["origin"]);
    expect([...await store.learnedSkillIds("user-2")]).toEqual([]);
  });

  it("rejects an unknown skill before writing anything", async () => {
    const store = createInMemoryProgressionStore();

    await expect(learnSkill({
      userId: "user-1",
      developerLogin: "octocat",
      skillId: "not-a-skill",
      events: [],
      store,
    })).rejects.toMatchObject({ code: "unknown_skill" });
    expect([...await store.learnedSkillIds("user-1")]).toEqual([]);
  });
});
