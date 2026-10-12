import { describe, expect, it } from "vitest";

import { readTestCoverage } from "./testing-audit";

/**
 * TASKS 20.1 and 20.2 are lists of things to cover, not features to build, and a
 * list checked once by hand is a list that silently regresses. This test reads
 * the repository and asserts each named area and each named fixture case still
 * has a test file behind it — so deleting the quests tests, say, fails here with
 * "quests has no test" rather than passing because nothing remembered to look.
 *
 * It is deliberately coarse: it checks that coverage *exists* by file name and
 * fixture profile, not that the tests inside are good. A precise check of every
 * assertion is the job of those tests, not of this one.
 */

describe("TASKS 20.1 — unit coverage areas", () => {
  it("names a test file for every area the task lists", () => {
    const { missing } = readTestCoverage();

    // Each of: normalization, scoring, prerequisites, achievements, quests,
    // currency, idempotency.
    expect(missing).toEqual([]);
  });

  it("does not count this audit as the coverage for an area", () => {
    // A self-referential pass would let `testing-audit` satisfy its own list.
    const { areas } = readTestCoverage();

    for (const area of areas) {
      expect(area.files).not.toContain("testing-audit.test.ts");
    }
  });
});

describe("TASKS 20.2 — GitHub fixture scenarios", () => {
  it("has a scoring fixture for every named profile shape", () => {
    const { fixtureProfiles } = readTestCoverage();

    // active, inactive, new, large, empty, duplicate_activity, mixed_activity.
    expect(fixtureProfiles).toEqual(
      expect.arrayContaining([
        "active",
        "inactive",
        "new",
        "empty",
        "duplicate_activity",
        "large",
        "mixed_activity",
      ]),
    );
  });

  it("covers the invalid and partial-data cases the task names", () => {
    // "invalid" and "partial data" are not profile shapes: invalid is the
    // client's rejection path and partial is the feed's omitted fields. Both
    // have their own tests, so the audit looks for the behaviour in the source
    // rather than for a file name.
    const { githubTestSource } = readTestCoverage();

    // An invalid username is rejected before a request is spent.
    expect(githubTestSource).toMatch(/invalid[_-]/i);
    // A payload that arrives missing fields is handled and reported as partial.
    expect(githubTestSource).toMatch(/omittedFields|WithoutCommitList|partial/i);
  });
});