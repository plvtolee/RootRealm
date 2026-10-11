/**
 * RootRealm — test-file detection (TASKS 5.8 groundwork).
 *
 * ```text
 * changed filenames → how strong the evidence of test coverage is
 * ```
 *
 * `SCORING.md` §13 awards `+12 XP` for a "verified regression test" representing
 * "meaningful test coverage", and warns that the system "should avoid rewarding
 * repetitive or meaningless test generation". Both halves of that are judgements
 * about *files*, and this module is where they are made — deliberately separated
 * from the scoring rule so it can be tested against real-world filename shapes
 * without any scoring involved.
 *
 * ## Why the answer is graded, not boolean
 *
 * Filenames carry conventions, not certainty. `internal/foo_test.go` is a test by
 * any reasonable reading. `testing/README.md` is not, and neither is
 * `src/testdata/sample.json` or `app/models/__mocks__/user.ts`. A boolean would
 * force a decision on every one of those, and a wrong `true` pays XP for a
 * fixture file.
 *
 * So this returns three grades, and the scoring rule awards only on the strongest:
 *
 * - `strong` — a path or basename that is a test by established convention in
 *   some widely-used ecosystem;
 * - `weak` — ambiguous, most likely a helper or fixture rather than a test;
 * - `none` — no test-shaped file at all.
 *
 * The rule then declines `weak` rather than guessing. §13's "verified" is doing
 * real work in that sentence, and this is where it is honoured.
 *
 * ## What this deliberately does not claim
 *
 * A `strong` file is *evidence of a test*, not proof one was written for this
 * defect. §13 asks for a test "associated with fixing or preventing a defect",
 * and establishing that association needs the pull request's issue links, which
 * come from a different endpoint than the file list. See the module header on
 * `lib/scoring/rules/regression-test.ts` for how that limit is handled.
 *
 * ## Why removed files do not count
 *
 * `status` is consulted, not ignored. Deleting a test is not adding coverage, and a
 * PR that removes a test file and touches nothing else would otherwise score as
 * having added one. This is a structural property of the input — the files
 * endpoint reports status per file — so there is no inference involved.
 */

/** How strong the evidence of test coverage is. */
export type TestCoverageGrade =
  /** A file that is a test by established convention. */
  | "strong"
  /** Test-shaped, but most likely a helper, fixture or mock. */
  | "weak"
  /** Nothing test-shaped. */
  | "none";

/** One changed file, as the files endpoint describes it. */
export interface ChangedFile {
  readonly filename: string;
  /** `added`, `modified`, `removed`, `renamed`. Null when GitHub omitted it. */
  readonly status: string | null;
  readonly additions?: number | null;
  readonly deletions?: number | null;
}

export interface TestCoverage {
  readonly grade: TestCoverageGrade;
  /** The files that drove the grade, so an explanation can name them. */
  readonly testFiles: readonly string[];
  /** Test-shaped files dismissed as helpers or fixtures, for the same reason. */
  readonly dismissed: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Conventions                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Directory segments that mean "support code for tests", not "tests".
 *
 * Checked before any filename pattern, because a path like
 * `src/test/fixtures/user.ts` matches almost every test suffix rule and is
 * definitely not a test. Getting this wrong in the permissive direction is the
 * expensive error: `test/fixtures/helper.ts` would otherwise score as coverage.
 */
const SUPPORT_DIRECTORIES: ReadonlySet<string> = new Set([
  "__mocks__",
  "__snapshots__",
  "e2e",
  "fixtures",
  "mocks",
  "stubs",
  "testdata",
  "test_data",
  "testfixtures",
  "test_data",
  "migrations",
  "seed",
  "seeds",
]);

/**
 * Directory segments that *do* mark tests.
 *
 * Checked first, and they win: `test/e2e_checkout_spec.ts` lives under a support
 * segment but is plainly a test. Ordering matters here rather than being
 * incidental — the alternative is declining real tests because their directory
 * also contained a fixtures folder.
 */
const TEST_DIRECTORIES: ReadonlySet<string> = new Set([
  "spec",
  "specs",
  "specs",
  "test",
  "tests",
  "testing",
  "__tests__",
  "__test__",
  "unittest",
  "unittests",
]);

/**
 * Files that are test *infrastructure* whatever they are called.
 *
 * Distinguished from {@link TEST_DIRECTORIES} because they are weaker: a project
 * with `tests/` may or may not put actual tests there, whereas `foo_test.go` is a
 * test by language convention. Grading the directory as `weak` rather than
 * `strong` is what keeps a `tests/README.md`-style repository honest.
 */
const FILE_SUFFIX_RULES: readonly { readonly pattern: RegExp; readonly strength: "strong" | "weak" }[] = [
  // --- strong: language-level test conventions -----------------------------
  { pattern: /_test\.(go|py|rb|js|ts|tsx|jsx|mjs|cjs|cc|cpp|h|swift|kt|kts|rs|ex|exs)$/i, strength: "strong" },
  { pattern: /\.test\.(js|ts|tsx|jsx|mjs|cjs|svelte|vue)$/i, strength: "strong" },
  { pattern: /\.spec\.(js|ts|tsx|jsx|mjs|cjs|svelte|vue|rb|dart)$/i, strength: "strong" },
  // Ruby and Elixir use `_spec.rb` / `_test.exs`, which the suffix rules below do
  // not cover because they are infixes rather than whole-suffix matches.
  { pattern: /_spec\.rb$/i, strength: "strong" },
  { pattern: /Test\.(java|cs|scala|kt)$/i, strength: "strong" },
  { pattern: /(Test|Tests|Spec)\.(java|cs|scala|kt|swift)$/i, strength: "strong" },
  { pattern: /^test_.*\.py$/i, strength: "strong" },
  { pattern: /(^|\/)conftest\.py$/i, strength: "weak" },
  { pattern: /(^|\/)spec_helper\.rb$/i, strength: "weak" },

  // --- weak: shell, infra, and other plausibly-test files -----------------
  // Shell and Dart have test conventions, but they are narrow enough that a
  // false positive is plausible; graded weak so the rule declines rather than pays.
  { pattern: /\.(sh|bash|zsh)$/i, strength: "weak" },
  { pattern: /_test\.dart$/i, strength: "weak" },
  { pattern: /\.(feature|story|stories)$/i, strength: "weak" },
  { pattern: /_spec\.dart$/i, strength: "weak" },
];

/** Extensions that are never tests, whatever they are called. */
const NEVER_TEST_EXTENSIONS: ReadonlySet<string> = new Set([
  ".md",
  ".mdx",
  ".rst",
  ".txt",
  ".json",
  ".jsonc",
  ".yml",
  ".yaml",
  ".toml",
  ".lock",
  ".svg",
  ".css",
  ".snap",
  ".map",
]);

/** Directory segments that are never tests. */
const NEVER_TEST_DIRECTORIES: ReadonlySet<string> = new Set([
  "docs",
  "doc",
  "documentation",
  "node_modules",
  "vendor",
  "third_party",
  "dist",
  "build",
  "public",
  "assets",
  ".github",
  ".vscode",
]);

/* -------------------------------------------------------------------------- */
/* Classification                                                               */
/* -------------------------------------------------------------------------- */

function segments(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

function basename(path: string): string {
  const parts = segments(path);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

function extension(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/** Whether a path names an added or modified file rather than a deleted one. */
function isPresent(file: ChangedFile): boolean {
  // A missing status means GitHub omitted it. Treating that as present is the
  // permissive choice, and it is the safe one: the alternative would decline a
  // real test because of a missing field, which under-awards.
  return file.status !== "removed";
}

/**
 * Classifies one file as strong test evidence, weak test evidence, or neither.
 *
 * Returns `null` for "not test-shaped", which is distinct from "weakly
 * test-shaped" — the difference between `tests/README.md` and
 * `tests/helpers/factory.ts`.
 */
export function classifyFile(file: ChangedFile): TestCoverageGrade | null {
  if (!isPresent(file)) return null;

  const path = file.filename;
  const name = basename(path);
  const parts = segments(path);
  const dirs = parts.slice(0, -1);
  const ext = extension(path);

  // An unrecognised extension under a `tests/` directory is probably not a test:
  // `tests/fixtures/users.json` is data, not coverage.
  if (NEVER_TEST_EXTENSIONS.has(ext)) return null;

  for (const dir of dirs) {
    if (NEVER_TEST_DIRECTORIES.has(dir.toLowerCase())) return null;
  }

  // Under a support directory, only an unmistakable filename convention counts.
  const inSupportDirectory = dirs.some((dir) =>
    SUPPORT_DIRECTORIES.has(dir.toLowerCase()),
  );

  // A file named after the directory itself: `test/test.go`, `tests/tests.py`.
  // Real, but weak — it says the project has a test, not that this is coverage.
  const namedAfterTestDir = TEST_DIRECTORIES.has(name.toLowerCase());

  for (const rule of FILE_SUFFIX_RULES) {
    // Matched against the path *and* the basename.
    //
    // The path form catches `internal/auth_test.go`; the basename form is needed
    // for rules anchored at the start (`/^test_.*\.py$/`), which would never
    // match `tests/test_user.py` because the `^` sees the directory, not the
    // filename. Both are tested rather than one, so a rule can use either anchor
    // without the caller having to know which.
    if (!rule.pattern.test(path) && !rule.pattern.test(name)) continue;

    if (rule.strength === "weak" && inSupportDirectory) return null;
    return rule.strength;
  }

  if (inSupportDirectory) return null;
  if (namedAfterTestDir) return "weak";

  // Living under a test directory is the remaining positive signal, and it is a
  // weak one. `tests/helpers.ts` is genuinely ambiguous: a badly-named test, or a
  // shared helper that happens to sit next to the tests. Grading it `strong`
  // would let any `.ts` file in a `tests/` folder score as coverage, which is
  // too permissive for a rule that pays XP.
  if (dirs.some((dir) => TEST_DIRECTORIES.has(dir.toLowerCase()))) {
    return "weak";
  }

  return null;
}

/**
 * Grades the test coverage across a set of changed files.
 *
 * Pure and order-independent: the strongest single file decides the grade, so
 * one real test among a hundred fixtures is not lost to them.
 */
export function detectTestCoverage(
  files: readonly ChangedFile[],
): TestCoverage {
  const strong: string[] = [];
  const weak: string[] = [];
  const dismissed: string[] = [];

  for (const file of files) {
    const grade = classifyFile(file);

    if (grade === "strong") strong.push(file.filename);
    else if (grade === "weak") weak.push(file.filename);
    else if (isPresent(file) && looksTestShaped(file.filename)) {
      // Named like a test but excluded by a directory or extension rule. Kept so
      // an explanation can say "this looked like a test and was ruled out"
      // rather than silently ignoring it.
      dismissed.push(file.filename);
    }
  }

  const grade: TestCoverageGrade =
    strong.length > 0 ? "strong" : weak.length > 0 ? "weak" : "none";

  return {
    grade,
    // Strong files first, then the weak ones, so the caller awarding on `strong`
    // cites a strong file and the caller explaining `weak` cites a weak one.
    testFiles: [...strong, ...weak],
    dismissed,
  };
}

/**
 * Whether a filename matched a test convention but was excluded by a directory or
 * extension rule.
 *
 * Used only to populate {@link TestCoverage.dismissed}. It re-checks the naming
 * rules with the directory and extension exclusions lifted, so a path is
 * "dismissed" precisely when it would otherwise have qualified.
 */
function looksTestShaped(path: string): boolean {
  const parts = segments(path);
  if (parts.length === 0) return false;

  const ext = extension(path);
  const name = basename(path);
  const dirs = parts.slice(0, -1);

  if (NEVER_TEST_EXTENSIONS.has(ext)) {
    // `.md` is not a test file, but `test.md` under a test directory is ambiguous
    // enough to be worth naming.
    return TEST_DIRECTORIES.has(name.replace(/\.md$/i, "").toLowerCase());
  }

  for (const dir of dirs) {
    if (!NEVER_TEST_DIRECTORIES.has(dir.toLowerCase())) continue;
    // Only report a dismissal inside `docs` and friends if the filename is a
    // strong convention; a `README` under `docs` is not worth mentioning.
    return FILE_SUFFIX_RULES.some(
      (rule) => rule.strength === "strong" && rule.pattern.test(name),
    );
  }

  const inSupport = dirs.some((dir) => SUPPORT_DIRECTORIES.has(dir.toLowerCase()));

  if (inSupport) {
    return FILE_SUFFIX_RULES.some(
      (rule) => rule.strength === "strong" && rule.pattern.test(path),
    );
  }

  return false;
}

/** Whether any file is strong evidence of test coverage. */
export function hasStrongTestEvidence(coverage: TestCoverage): boolean {
  return coverage.grade === "strong";
}