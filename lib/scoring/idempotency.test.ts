import { describe, expect, it } from "vitest";

import {
  filterNewAwards,
  isIdempotent,
  keysToAward,
} from "./idempotency";
import type { ScoringVersionId } from "./types";

type Result = {
  eventId: string;
  eligible: boolean;
  scoringVersion: ScoringVersionId;
};

const eligible = (eventId: string): Result => ({
  eventId,
  eligible: true,
  scoringVersion: "scoring-v1",
});

const rejected = (eventId: string): Result => ({
  eventId,
  eligible: false,
  scoringVersion: "scoring-v1",
});

const dupesFor = (
  results: Result[],
  alreadyAwarded: string[] = [],
): { eventId: string; duplicate: boolean }[] =>
  filterNewAwards(results, "octocat", "scoring-v1", { alreadyAwarded }).map(
    ({ eventId, duplicate }) => ({ eventId, duplicate }),
  );

/* -------------------------------------------------------------------------- */

describe("filterNewAwards — the acceptance criterion", () => {
  it("awards on first processing", () => {
    expect(dupesFor([eligible("push:1")])).toEqual([
      { eventId: "push:1", duplicate: false },
    ]);
  });

  it("does not award again when the same event is repeated", () => {
    // TASKS 4.6 collapses the repeats at ingestion; this is the second line of
    // defence, for runs that see them separately.
    const first = filterNewAwards([eligible("push:1")], "octocat", "scoring-v1");
    const second = filterNewAwards(
      [eligible("push:1")],
      "octocat",
      "scoring-v1",
      { alreadyAwarded: first.map((d) => d.key) },
    );

    expect(second[0].duplicate).toBe(true);
  });

  it("is idempotent over a whole run, not just one event", () => {
    const run = [eligible("push:1"), eligible("push:2"), eligible("push:3")];

    expect(isIdempotent(run, "octocat", "scoring-v1")).toBe(true);
  });

  it("marks the second copy within a single batch as a duplicate", () => {
    // Deduplication (TASKS 4.6) usually prevents this, but a caller that
    // bypasses it must not double-award.
    expect(dupesFor([eligible("push:1"), eligible("push:1")])).toEqual([
      { eventId: "push:1", duplicate: false },
      { eventId: "push:1", duplicate: true },
    ]);
  });

  it("scopes keys per developer", () => {
    const mine = filterNewAwards([eligible("push:1")], "octocat", "scoring-v1");
    const theirs = filterNewAwards([eligible("push:1")], "other", "scoring-v1");

    expect(mine[0].key).not.toBe(theirs[0].key);
  });

  it("scopes keys per version, so a rescore may award again (§18)", () => {
    // §18: the version is in the key precisely so a scoring change is not read
    // as a duplicate of the older scoring. `ScoringVersionId` is a closed union
    // with one member, so the version in the key is currently always the same —
    // this asserts the key's *shape* carries it, which is what matters the
    // moment a second version exists.
    const key = filterNewAwards([eligible("push:1")], "octocat", "scoring-v1")[0]
      .key;

    expect(key).toBe("xp:octocat:push:1:scoring-v1");
    expect(key.endsWith(":scoring-v1")).toBe(true);
  });
});

describe("filterNewAwards — rejections are never duplicates", () => {
  it("does not treat a re-rejected event as already awarded", () => {
    expect(dupesFor([rejected("push:1")])).toEqual([
      { eventId: "push:1", duplicate: false },
    ]);
  });

  it("returns the same decisions for a repeated rejection", () => {
    const run = [rejected("push:1"), rejected("push:1")];

    expect(dupesFor(run)).toEqual([
      { eventId: "push:1", duplicate: false },
      { eventId: "push:1", duplicate: false },
    ]);
  });

  it("still awards an event that failed eligibility and later qualified", () => {
    // Were rejection reasons used as the duplicate signal, an event that first
    // failed and later passed could never be awarded. A rejected run records no
    // key, so the later successful run is new.
    const rejectedRun = filterNewAwards(
      [rejected("push:1")],
      "octocat",
      "scoring-v1",
    );
    const later = filterNewAwards([eligible("push:1")], "octocat", "scoring-v1", {
      alreadyAwarded: rejectedRun.filter((d) => d.duplicate).map((d) => d.key),
    });

    expect(later[0].duplicate).toBe(false);
  });

  it("reports no duplicates at all in an all-rejected run", () => {
    expect(dupesFor([rejected("push:1"), rejected("push:2")]).every((d) => !d.duplicate)).toBe(true);
  });
});

describe("filterNewAwards — purity", () => {
  it("does not mutate the caller's already-awarded set", () => {
    const seen = new Set(["xp:octocat:push:1:scoring-v1"]);
    const before = [...seen];

    filterNewAwards([eligible("push:2")], "octocat", "scoring-v1", {
      alreadyAwarded: seen,
    });

    expect([...seen]).toEqual(before);
  });

  it("does not mutate its input", () => {
    const run = [eligible("push:1")];
    const before = JSON.stringify(run);

    filterNewAwards(run, "octocat", "scoring-v1");

    expect(JSON.stringify(run)).toBe(before);
  });

  it("handles an empty run", () => {
    expect(dupesFor([])).toEqual([]);
    expect(isIdempotent([], "octocat", "scoring-v1")).toBe(true);
  });
});

describe("keysToAward", () => {
  it("returns only the keys worth recording", () => {
    const keys = keysToAward(
      [eligible("push:1"), rejected("push:2")],
      "octocat",
      "scoring-v1",
    );

    expect(keys).toEqual(["xp:octocat:push:1:scoring-v1"]);
  });

  it("returns nothing for an entirely duplicate run", () => {
    const first = filterNewAwards([eligible("push:1")], "octocat", "scoring-v1");
    const second = keysToAward(
      [eligible("push:1")],
      "octocat",
      "scoring-v1",
      { alreadyAwarded: first.map((d) => d.key) },
    );

    expect(second).toEqual([]);
  });
});
