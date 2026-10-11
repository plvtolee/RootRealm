import { describe, expect, it } from "vitest";

import { SKILL_DEFINITIONS } from "./catalog";
import { SKILL_POINT_BUDGET, computeSkillTreeView } from "./view";
import { SKILL_NODE_PRESENTATION } from "../../components/skill-tree/skill-node-presentation";

describe("computeSkillTreeView", () => {
  it("counts the Origin as learned and spends its cost", () => {
    const state = computeSkillTreeView(["origin"], []);
    const origin = state.nodes.get("origin");

    expect(origin?.status).toBe("learned");
    expect(state.learnedIds.has("origin")).toBe(true);
    expect(state.spentPoints).toBe(SKILL_DEFINITIONS.find((n) => n.id === "origin")?.cost ?? 0);
    expect(state.pointsLeft).toBe(SKILL_POINT_BUDGET - state.spentPoints);
  });

  it("refuses to refund the Origin with a reason", () => {
    const origin = computeSkillTreeView(["origin"], []).nodes.get("origin");

    expect(origin?.canRefund).toBe(false);
    expect(origin?.refundReason).toBe("The Origin is permanent.");
  });

  it("explains a locked node by naming its missing prerequisite", () => {
    const view = computeSkillTreeView([], []).nodes.get("builder-roots");

    expect(view?.status).toBe("locked");
    expect(view?.canLearn).toBe(false);
    expect(view?.missingPrerequisiteIds).toEqual(["origin"]);
    expect(view?.learnReason).toContain("Origin");
  });

  it("reports an unevidenced prerequisite-met node as in progress, not learnable", () => {
    const view = computeSkillTreeView(["origin"], []).nodes.get("builder-roots");

    expect(view?.status).toBe("in-progress");
    expect(view?.canLearn).toBe(false);
    expect(view?.learnReason).toBe("Evidence pending.");
  });

  it("returns a view for every catalog node", () => {
    const state = computeSkillTreeView(["origin"], []);
    expect(state.nodes.size).toBe(SKILL_DEFINITIONS.length);
  });
});

describe("SKILL_NODE_PRESENTATION", () => {
  it("has a presentation entry for every catalog node", () => {
    const missing = SKILL_DEFINITIONS.map((n) => n.id).filter(
      (id) => !(id in SKILL_NODE_PRESENTATION),
    );
    expect(missing).toEqual([]);
  });
});
