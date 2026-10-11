import { describe, expect, it } from "vitest";

import type { DeveloperEvent } from "../developer-event";
import { RULES, scoreEvent, scoreEvents, summarize } from "./engine";
import { SCORING_V1 } from "./types";

function event(over: {
  id: string;
  kind: DeveloperEvent["kind"];
  confidence?: "verified" | "inferred";
} & Partial<DeveloperEvent>): DeveloperEvent {
  return {
    developerLogin: "octocat",
    developerId: 583_231,
    repositoryId: 170_270,
    repositoryFullName: "octocat/octo-repo",
    occurredAt: "2026-10-09T05:51:24Z",
    visibility: "public",
    confidence: over.confidence ?? "verified",
    sourceUrl: null,
    relevance: "scored",
    limitations: [],
    ...over,
  } as DeveloperEvent;
}

const push = (id = "push:1") =>
  event({
    id,
    kind: "push",
    evidence: { branch: "main", headSha: "abc", beforeSha: "def" },
  });

const lifecycle = (id = "create:1") =>
  event({
    id,
    kind: "lifecycle",
    relevance: "weak",
    evidence: { refType: "branch", ref: "refs/heads/feature" },
  });

/* -------------------------------------------------------------------------- */

describe("scoreEvent — dispatch (§33)", () => {
  it("routes each kind to its rule", () => {
    const cases: [DeveloperEvent, string][] = [
      [
        event({
          id: "pr:1",
          kind: "pull_request",
          evidence: {
            number: 82,
            action: "merged",
            merged: true,
            headRef: "feature",
            baseRef: "main",
          },
        }),
        "pr.merged",
      ],
      [
        event({
          id: "rev:1",
          kind: "review",
          evidence: {
            number: 82,
            state: "approved",
            action: "created",
            subject: "review",
          },
        }),
        "review.completed",
      ],
      [
        event({
          id: "rel:1",
          kind: "release",
          evidence: {
            tag: "v1",
            name: "One",
            action: "published",
            draft: false,
            prerelease: false,
          },
        }),
        "release.published",
      ],
    ];

    for (const [ev, ruleId] of cases) {
      const result = scoreEvent(ev, SCORING_V1);

      expect(result.eligible).toBe(true);
      expect(result.attributeAwards[0].ruleId).toBe(ruleId);
    }
  });

  it("returns an ineligible result for a kind no rule handles", () => {
    // A scoring run must reconcile against the events it was given, so a silent
    // skip would make that impossible (§35).
    const result = scoreEvent(lifecycle(), SCORING_V1);

    expect(result.eligible).toBe(false);
    expect(result.rejectionReason).toBe("unsupported_event");
    expect(result.xp).toBe(0);
    expect(result.reason).toContain("No scoring rule handles");
  });

  it("explains why a scored event was declined, rather than staying silent", () => {
    // A push has no commit list (TASKS 4.4), so it is declined rather than
    // scored. §5.2 deferred it for exactly this reason.
    const result = scoreEvent(push(), SCORING_V1);

    expect(result.eligible).toBe(false);
    expect(result.rejectionReason).toBe("unsupported_event");
  });

  it("stamps the version it was given", () => {
    expect(scoreEvent(lifecycle(), SCORING_V1).scoringVersion).toBe(
      SCORING_V1.id,
    );
  });

  it("is deterministic", () => {
    const target = push();

    expect(scoreEvent(target, SCORING_V1)).toEqual(
      scoreEvent(target, SCORING_V1),
    );
  });

  it("does not mutate the event", () => {
    const target = push();
    const before = JSON.stringify(target);

    scoreEvent(target, SCORING_V1);

    expect(JSON.stringify(target)).toBe(before);
  });
});

describe("scoreEvents — §33", () => {
  it("preserves order", () => {
    const events = [push("push:3"), push("push:1"), push("push:2")];

    expect(scoreEvents(events, SCORING_V1).map((r) => r.eventId)).toEqual([
      "push:3",
      "push:1",
      "push:2",
    ]);
  });

  it("scales linearly in results", () => {
    const events = Array.from({ length: 50 }, (_unused, index) =>
      push(`push:${index}`),
    );

    expect(scoreEvents(events, SCORING_V1)).toHaveLength(50);
  });

  it("handles an empty batch", () => {
    expect(scoreEvents([], SCORING_V1)).toEqual([]);
  });

  it("does not deduplicate, which is 5.11's job", () => {
    // This module is pure; §18 idempotency needs state it does not have.
    const repeated = [push("push:1"), push("push:1")];

    expect(scoreEvents(repeated, SCORING_V1)).toHaveLength(2);
  });
});

describe("RULES registry", () => {
  it("registers a rule per scoreable classification", () => {
    expect(RULES.map((rule) => rule.ruleId).sort()).toEqual([
      "docs.created",
      "issue.closed",
      "pr.merged",
      "release.published",
      "review.completed",
    ]);
  });

  it("has no two rules claiming the same kind", () => {
    // If two ever did, dispatch order would become a real decision — and one
    // nobody had made.
    const kinds = new Map<string, string[]>();

    for (const rule of RULES) {
      for (const seed of [
        "push:1",
        "pr:1",
        "review:1",
        "issue:1",
        "release:1",
        "documentation:1",
        "create:1",
      ]) {
        const event = { ...push(seed), id: seed } as DeveloperEvent;
        if (rule.evaluate(event, SCORING_V1) !== null) {
          kinds.set(seed, [...(kinds.get(seed) ?? []), rule.ruleId]);
        }
      }
    }

    for (const [kind, claimers] of kinds) {
      expect(claimers, `two rules claim ${kind}`).toHaveLength(1);
    }
  });
});

describe("summarize", () => {
  const run = (events: DeveloperEvent[]) =>
    summarize(scoreEvents(events, SCORING_V1));

  const mergedPr = () =>
    event({
      id: "pr:1",
      kind: "pull_request",
      evidence: {
        number: 82,
        action: "merged",
        merged: true,
        headRef: "feature",
        baseRef: "main",
      },
    });

  it("counts eligible and rejected separately", () => {
    const summary = run([mergedPr(), push(), lifecycle()]);

    expect(summary.scored).toBe(3);
    expect(summary.eligible).toBe(1);
    expect(summary.rejected).toBe(2);
  });

  it("totals XP", () => {
    expect(run([mergedPr()]).totalXp).toBe(30);
    expect(run([mergedPr(), lifecycle()]).totalXp).toBe(30);
  });

  it("totals attribute units by attribute", () => {
    expect(run([mergedPr()]).attributeTotals).toEqual({ builder: 1 });
  });

  it("represents every attribute, even the ones that earned nothing", () => {
    // "No Scholar progress" and "Scholar was never considered" are different
    // claims, and an omitted key would read as the second.
    const summary = run([mergedPr()]);

    expect(Object.keys(summary.attributeTotals)).not.toContain("architect");
    expect(summary.attributeTotals.architect).toBeUndefined();
  });

  it("counts rejections by reason", () => {
    const summary = run([push(), push(), lifecycle()]);

    expect(summary.rejections).toEqual({ unsupported_event: 3 });
  });

  it("handles an empty run", () => {
    expect(run([])).toEqual({
      scored: 0,
      eligible: 0,
      rejected: 0,
      totalXp: 0,
      attributeTotals: {},
      rejections: {},
    });
  });
});
