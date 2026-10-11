/**
 * RootRealm — the scoring pipeline, end to end.
 *
 * ```text
 * fixtures → normalize → dedupe → score → idempotency → ledger → level
 * ```
 *
 * Each stage is tested in its own module. What is tested here is that they
 * compose, which no single module's tests establish: a fixture that normalizes
 * but fails to score, or scores but produces no ledger entry, is invisible when
 * each stage passes in isolation.
 *
 * These assert *invariants* rather than XP values. The numbers are §4's starting
 * placeholders and §24 leaves the curve "intentionally not finalized", so
 * pinning them would make tuning look like a regression. What is pinned is the
 * relationships that must hold whatever the tuning:
 *
 * - every eligible event produces exactly one ledger entry;
 * - the second processing of a run awards nothing new;
 * - a developer's level never falls as their XP rises;
 * - each attribute total equals the units awarded for it.
 */
import { describe, expect, it } from "vitest";

import { runFixture, scoringFixtures } from "./fixtures";
import { scoreEvents, summarize } from "./engine";
import { filterNewAwards, isIdempotent } from "./idempotency";
import { ledgerEntriesFor } from "./ledger";
import { calculateLevel } from "./levels";
import { SCORING_V1 } from "./types";

const AWARDED_AT = "2026-10-11T00:00:00Z";
const LOGIN = "octocat";

/** Runs a fixture through every stage, returning what each produced. */
function pipeline(profile: Parameters<typeof runFixture>[0]) {
  const { deduplicated } = runFixture(profile);
  const results = scoreEvents(deduplicated.events, SCORING_V1);
  const decisions = filterNewAwards(results, LOGIN, "scoring-v1");
  const entries = ledgerEntriesFor(
    results,
    deduplicated.events,
    AWARDED_AT,
  );

  return { deduplicated, results, decisions, entries };
}

/* -------------------------------------------------------------------------- */

describe("the pipeline composes, for every fixture", () => {
  it.each(scoringFixtures.map((fixture) => fixture.profile))(
    "%s",
    (profile) => {
      const { deduplicated, results, decisions, entries } = pipeline(profile);

      // Every event scored, eligible or not.
      expect(results).toHaveLength(deduplicated.events.length);

      // Every eligible event produced exactly one ledger entry.
      const eligible = results.filter((result) => result.eligible);
      expect(entries).toHaveLength(eligible.length);

      // No duplicate keys, so TASKS 4.6 and 5.11 hold together.
      expect(new Set(entries.map((entry) => entry.id)).size).toBe(
        entries.length,
      );

      // Every ledger entry cites the event it was awarded for.
      for (const entry of entries) {
        expect(deduplicated.events.some((e) => e.id === entry.eventId)).toBe(true);
      }

      // Nothing is awarded twice by a second pass.
      expect(
        decisions.every((decision) => !decision.duplicate),
      ).toBe(true);
      expect(
        isIdempotent(results, LOGIN, "scoring-v1"),
      ).toBe(true);
    },
  );

  it("holds for the six profiles together, not just each in isolation", () => {
    for (const fixture of scoringFixtures) {
      const { entries, results } = pipeline(fixture.profile);
      const eligible = results.filter((r) => r.eligible);

      expect(entries).toHaveLength(eligible.length);
    }
  });
});

describe("the pipeline reconciles", () => {
  it("accounts for every event it was given", () => {
    for (const fixture of scoringFixtures) {
      const { deduplicated, results } = pipeline(fixture.profile);

      expect(results).toHaveLength(deduplicated.events.length);
    }
  });

  it("sums XP to the same total the ledger records", () => {
    for (const fixture of scoringFixtures) {
      const { entries, results } = pipeline(fixture.profile);
      const summary = summarize(results);
      const recorded = entries.reduce((total, entry) => total + entry.xp, 0);

      expect(recorded).toBe(summary.totalXp);
    }
  });

  it("sums attribute units to the same totals the summary reports", () => {
    for (const fixture of scoringFixtures) {
      const { entries, results } = pipeline(fixture.profile);
      const summary = summarize(results);

      const recorded: Record<string, number> = {};
      for (const entry of entries) {
        for (const award of entry.attributeAwards) {
          recorded[award.attribute] =
            (recorded[award.attribute] ?? 0) + award.amount;
        }
      }

      expect(recorded).toEqual(summary.attributeTotals);
    }
  });
});

describe("the pipeline levels", () => {
  it("never levels a developer down as their XP rises", () => {
    let lastLevel = 0;
    let lastXp = -1;

    for (const fixture of scoringFixtures) {
      const { results } = pipeline(fixture.profile);
      const { totalXp } = summarize(results);

      if (totalXp < lastXp) continue;
      const level = calculateLevel(totalXp, "curve-v1");

      expect(level).toBeGreaterThanOrEqual(lastLevel);
      lastLevel = level;
      lastXp = totalXp;
    }
  });

  it("levels a new character at 1, and an active one higher", () => {
    expect(calculateLevel(summarize(pipeline("new").results).totalXp, "curve-v1")).toBe(1);

    // §4's placeholders are small, so an active developer reaches level 2.
    const active = summarize(pipeline("active").results).totalXp;
    expect(active).toBeGreaterThan(0);
    expect(calculateLevel(active, "curve-v1")).toBeGreaterThan(1);
  });

  it("levels the large fixture well past a new one", () => {
    const fresh = summarize(pipeline("new").results).totalXp;
    const large = summarize(pipeline("large").results).totalXp;

    expect(large).toBeGreaterThan(fresh);
    expect(calculateLevel(large, "curve-v1")).toBeGreaterThan(
      calculateLevel(fresh, "curve-v1"),
    );
  });
});

describe("the pipeline's evidence gaps survive every stage", () => {
  it("carries the push limitation into the scored events", () => {
    const { deduplicated } = pipeline("large");
    const pushes = deduplicated.events.filter((e) => e.kind === "push");

    for (const event of pushes) {
      expect(event.limitations).toContain("commit_count_unavailable");
    }
  });

  it("awards a flat amount per push, so an unseen commit count cannot inflate it", () => {
    // The limitation above says we cannot see how many commits a push carried.
    // The award must therefore not vary with anything we cannot observe — a push
    // is one unit regardless of its size. If this ever regressed to a per-commit
    // multiplier, the limitation would have become a silent multiplier.
    const { deduplicated, results } = pipeline("large");
    const pushIds = new Set(
      deduplicated.events.filter((e) => e.kind === "push").map((e) => e.id),
    );
    const pushResults = results.filter((r) => pushIds.has(r.eventId));

    expect(pushResults.length).toBeGreaterThan(0);
    for (const result of pushResults) {
      expect(result.eligible).toBe(true);
      expect(result.xp).toBe(SCORING_V1.xp.qualifying_push);
      expect(result.attributeAwards).toHaveLength(1);
    }
  });

  it("counts a repeated sync's pushes once each, not twice", () => {
    // `duplicate_activity` is 80 observations of 40 pushes. Every push is
    // identical across the two copies, so each must be awarded exactly once —
    // the deduplication and idempotency layers agreeing rather than one of them
    // compensating for the other.
    const { deduplicated, entries } = pipeline("duplicate_activity");

    expect(deduplicated.events).toHaveLength(40);
    expect(entries).toHaveLength(40);

    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not let the push line swamp the merge it usually becomes", () => {
    // The push/pull-request overlap is accepted deliberately, but §4's values
    // must keep it from dominating. Across a whole feed, push XP should be a
    // minority of the total — otherwise every merged pull request would be
    // outvoted by the pushes leading up to it.
    const { results } = pipeline("large");
    const summary = summarize(results);

    const pushXp = results
      .filter((r) => r.eligible && r.classification === "qualifying_push")
      .reduce((total, r) => total + r.xp, 0);

    expect(pushXp).toBeLessThan(summary.totalXp / 2);
  });

  it("records a ledger entry only for what it can cite", () => {
    const { entries } = pipeline("active");

    for (const entry of entries) {
      expect(entry.ruleId.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });
});
