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
      [push(), "push.landed"],
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
            testFiles: null,
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

  it("scores a push under its own rule", () => {
    // TASKS 5.2: §7's line is awarded per push, since a PushEvent carries no
    // commit list to count. The rule names itself `push.landed` rather than
    // reusing the commit classification, because the unit is what we observed.
    const result = scoreEvent(push(), SCORING_V1);

    expect(result.eligible).toBe(true);
    expect(result.xp).toBe(SCORING_V1.xp.qualifying_push);
    expect(result.classification).toBe("qualifying_push");
    expect(result.attributeAwards[0].ruleId).toBe("push.landed");
  });

  it("explains why a push was declined, rather than staying silent", () => {
    // A push that landed nothing is declined by the rule with a stated reason —
    // not skipped as unsupported. §35 requires every outcome to be explainable,
    // and "unsupported_event" would wrongly imply no rule knows about pushes.
    const result = scoreEvent(
      event({
        id: "push:noop",
        kind: "push",
        evidence: { branch: "main", headSha: "abc", beforeSha: "abc" },
      }),
      SCORING_V1,
    );

    expect(result.eligible).toBe(false);
    expect(result.rejectionReason).toBe("anti_farming_rule");
    expect(result.reason).toContain("no code was landed");
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
  // One genuinely different kind each. Spreading a single push-shaped event under
  // several ids would still pass a collision check while only ever testing one
  // kind, which is not what the assertion below claims to cover.
  const SEEDS: DeveloperEvent[] = [
    push("push:1"),
    event({
      id: "pr:1",
      kind: "pull_request",
      evidence: {
        number: 82,
        action: "merged",
        merged: true,
        headRef: "feature",
        baseRef: "main",
        testFiles: null,
      },
    }),
    event({
      id: "review:1",
      kind: "review",
      evidence: {
        number: 82,
        state: "approved",
        action: "created",
        subject: "review",
      },
    }),
    event({
      id: "issue:1",
      kind: "issue",
      evidence: {
        number: 12,
        title: "Crash on launch",
        action: "closed",
        authored: true,
        state: "closed",
      },
    }),
    event({
      id: "release:1",
      kind: "release",
      evidence: {
        tag: "v1",
        name: "One",
        action: "published",
        draft: false,
        prerelease: false,
      },
    }),
    event({
      id: "documentation:1",
      kind: "documentation",
      evidence: { pagesChanged: 1, pagesCreated: 1, page: "Page" },
    }),
    lifecycle("create:1"),
  ];

  /** Which rules claim each kind, computed once for the block below. */
  function claims(): Map<string, string[]> {
    const kinds = new Map<string, string[]>();

    for (const rule of RULES) {
      for (const seed of SEEDS) {
        if (rule.evaluate(seed, SCORING_V1) !== null) {
          kinds.set(seed.kind, [...(kinds.get(seed.kind) ?? []), rule.ruleId]);
        }
      }
    }

    return kinds;
  }

  it("registers a rule per scoreable classification", () => {
    expect(RULES.map((rule) => rule.ruleId).sort()).toEqual([
      "docs.created",
      "issue.closed",
      "pr.merged",
      "push.landed",
      "release.published",
      "review.completed",
    ]);
  });

  it("has no two rules claiming the same kind", () => {
    // If two ever did, dispatch order would become a real decision — and one
    // nobody had made.
    for (const [kind, claimers] of claims()) {
      expect(claimers, `two rules claim ${kind}`).toHaveLength(1);
    }
  });

  it("claims every scoreable kind, so a dropped registration is visible", () => {
    // `claims()` only holds kinds some rule claimed, so a rule that stopped
    // claiming its kind would pass the collision check while quietly scoring
    // nothing. Asserting the claimed set outright closes that.
    expect([...claims().keys()].sort()).toEqual([
      "documentation",
      "issue",
      "pull_request",
      "push",
      "release",
      "review",
    ]);
  });

  it("leaves lifecycle unclaimed, so it stays explainable as unsupported", () => {
    // Branch and tag creation is weak relevance, not scored work. Naming the one
    // deliberately unclaimed kind means a future rule for it has to confront this.
    expect(claims().has("lifecycle")).toBe(false);
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
        testFiles: null,
      },
    });

  it("counts eligible and rejected separately", () => {
    // A push is scored from TASKS 5.2 onward; lifecycle remains unclaimed.
    const summary = run([mergedPr(), push(), lifecycle()]);

    expect(summary.scored).toBe(3);
    expect(summary.eligible).toBe(2);
    expect(summary.rejected).toBe(1);
  });

  it("totals XP", () => {
    expect(run([mergedPr()]).totalXp).toBe(30);
    expect(run([mergedPr(), lifecycle()]).totalXp).toBe(30);
    expect(run([push()]).totalXp).toBe(SCORING_V1.xp.qualifying_push);
  });

  it("totals attribute units by attribute", () => {
    expect(run([mergedPr()]).attributeTotals).toEqual({ builder: 1 });
  });

  it("counts a push as one Builder unit per push, not one per commit", () => {
    // The unit is the push. Two pushes are two units however many commits each
    // held, which is what stops the count being inflated by unseen commits.
    const summary = run([push("push:1"), push("push:2")]);

    expect(summary.attributeTotals).toEqual({ builder: 2 });
    expect(summary.totalXp).toBe(SCORING_V1.xp.qualifying_push * 2);
  });

  it("represents every attribute, even the ones that earned nothing", () => {
    // "No Scholar progress" and "Scholar was never considered" are different
    // claims, and an omitted key would read as the second.
    const summary = run([mergedPr()]);

    expect(Object.keys(summary.attributeTotals)).not.toContain("architect");
    expect(summary.attributeTotals.architect).toBeUndefined();
  });

  it("counts rejections by reason", () => {
    // Only the unclaimed kind lands here now, and a no-op push carries the rule's
    // own reason rather than `unsupported_event`.
    const summary = run([lifecycle(), lifecycle()]);

    expect(summary.rejections).toEqual({ unsupported_event: 2 });
  });

  it("separates a rule's decline from an unhandled kind", () => {
    // §35 makes these distinct explanations. Collapsing them would tell a reader
    // that no rule knows about pushes, when in fact one judged it and declined.
    const noOp = event({
      id: "push:noop",
      kind: "push",
      evidence: { branch: "main", headSha: "abc", beforeSha: "abc" },
    });

    const summary = run([noOp, lifecycle()]);

    expect(summary.rejections).toEqual({
      anti_farming_rule: 1,
      unsupported_event: 1,
    });
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
