/**
 * RootRealm — the TASKS 20.1/20.2 coverage audit (TASKS 20.1, 20.2).
 *
 * ```text
 * a coverage checklist the repository can be checked against mechanically
 * ```
 *
 * Both tasks are lists of things to cover. A list checked by hand is a list that
 * quietly stops being true — nothing fails when a test file is deleted or a
 * fixture case is dropped, because no assertion ever looked. This module turns
 * the two lists into data that `lib/testing-audit.test.ts` checks against the
 * repository at run time.
 *
 * ## Why read the file system rather than assert the list in the test
 *
 * Hard-coding "the quests tests pass" in a test means the claim about the test
 * suite is made by the test suite — which is only honest if something actually
 * counts the files that are there. So the audit runs: it walks `lib/` and the
 * tests directory, and reports what exists against what TASKS named.
 *
 * ## What it deliberately does not claim
 *
 * That the tests are *good*. It asserts coverage *exists* — that a file is
 * named for each area and each fixture profile is present — and no more. Judging
 * the assertions inside is what running them does, and `npm test` does that.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The TASKS 20.1 areas, each with the file-name fragment that means "this area
 * has tests". Fragments rather than exact paths so a file can be renamed as long
 * as the name still identifies the area.
 */
export const COVERAGE_AREAS: readonly { readonly area: string; readonly fragment: string }[] = [
  { area: "normalization", fragment: "developer-event" },
  { area: "scoring", fragment: "scoring" },
  { area: "prerequisites", fragment: "prerequisites" },
  { area: "achievements", fragment: "achievements" },
  { area: "quests", fragment: "quests" },
  { area: "currency", fragment: "currency" },
  { area: "idempotency", fragment: "idempotency" },
];

export interface AreaCoverage {
  readonly area: string;
  /** The test files found for this area, relative to the repo root. */
  readonly files: readonly string[];
}

export interface CoverageReport {
  readonly areas: readonly AreaCoverage[];
  /** The areas with no test file at all. */
  readonly missing: readonly string[];
  /** The scoring fixture profile names present in `lib/scoring/fixtures.ts`. */
  readonly fixtureProfiles: readonly string[];
  /**
   * The concatenated source of the GitHub-layer tests, so a check can look for a
   * named behaviour rather than a named file.
   */
  readonly githubTestSource: string;
}

/**
 * The fixture profile names, read from the module they are declared in.
 *
 * Parsed rather than imported because the audit must report what the source
 * *says*, and importing it here would load the scoring engine into this test.
 * The `Fixture` interface's `profile` union is the contract the data follows, so
 * that is what is read.
 */
function fixtureProfiles(repoRoot: string): readonly string[] {
  const profiles: string[] = [];

  try {
    const text = readFileSync(
      join(repoRoot, "lib", "scoring", "fixtures.ts"),
      "utf8",
    ) as string;

    for (const match of text.matchAll(/readonly profile:\s*([\s\S]*?);/g)) {
      for (const quoted of match[1]?.matchAll(/"([^"]+)"/g) ?? []) {
        const name = quoted[1];
        if (name !== undefined) profiles.push(name);
      }
    }
  } catch {
    // A missing fixtures file is itself a finding; the caller sees no profiles.
  }

  return [...new Set(profiles)].sort();
}

/** Every test file under the repo, relative to the root. */
function testFiles(repoRoot: string, dir: string): readonly string[] {
  const found: string[] = [];

  const walk = (relative: string): void => {
    const absolute = join(repoRoot, relative);
    let entries: { name: string; isDirectory(): boolean }[];
    try {
      entries = readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const child = `${relative}/${entry.name}`.replace(/\\/g, "/");
      if (entry.isDirectory()) {
        // Never walk into dependencies or build output.
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(child);
      } else if (entry.name.endsWith(".test.ts")) {
        found.push(child);
      }
    }
  };

  walk(dir);
  return found.sort();
}

/**
 * Reads the repository and reports what coverage exists.
 *
 * `repoRoot` defaults to the process CWD, which is the repo root when vitest runs
 * from there. A caller in another CWD gets whatever is at that path, which is why
 * the audit test passes the module's own location when it needs to.
 */
export function readTestCoverage(repoRoot: string = process.cwd()): CoverageReport {
  const files = testFiles(repoRoot, "lib");

  const areas = COVERAGE_AREAS.map(({ area, fragment }) => ({
    area,
    files: files.filter((file) => file.includes(fragment)),
  }));

  return {
    areas,
    missing: areas.filter((entry) => entry.files.length === 0).map((entry) => entry.area),
    fixtureProfiles: fixtureProfiles(repoRoot),
    // The GitHub tests' source, so a check can assert a named *behaviour* is
    // covered rather than that a file with a plausible name exists.
    githubTestSource: files
      .filter((file) => file.includes("github"))
      .map((file) => {
        try {
          return readFileSync(join(repoRoot, file), "utf8");
        } catch {
          return "";
        }
      })
      .join("\n"),
  };
}