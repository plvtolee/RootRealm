import { describe, expect, it } from "vitest";

import {
  classifyFile,
  detectTestCoverage,
  hasStrongTestEvidence,
  type ChangedFile,
} from "./test-detection";

const added = (filename: string, status: string | null = "modified"): ChangedFile => ({
  filename,
  status,
});

/* -------------------------------------------------------------------------- */

describe("classifyFile — strong: language-level conventions", () => {
  it.each([
    "internal/auth_test.go",
    "tests/test_user.py",
    "spec/models/user_spec.rb",
    "src/Button.test.ts",
    "src/Button.test.tsx",
    "src/parser.spec.js",
    "src/lib/thing.spec.ts",
    "app/src/test/kotlin/ThingTest.kt",
    "lib/src/test/java/com/x/UserTest.java",
    "lib/UserTests.cs",
    "Tests/SwiftThingTests.swift",
    "src/handler_test.rs",
    "lib/money_test.exs",
  ])("%s is a test", (filename) => {
    expect(classifyFile(added(filename))).toBe("strong");
  });

  it("uses the whole path, not just the basename", () => {
    // A basename-only implementation would call `docs/auth_test.go` a test on
    // the strength of its name alone; the directory is what rules it out.
    expect(classifyFile(added("internal/auth_test.go"))).toBe("strong");
    expect(classifyFile(added("docs/auth_test.go"))).toBeNull();
    expect(classifyFile(added("tests/fixtures/auth_test.py"))).toBe("strong");
  });
});

describe("classifyFile — never a test", () => {
  it.each([
    "README.md",
    "docs/testing-guide.md",
    "docs/test.md",
    "CONTRIBUTING.md",
    "package.json",
    "tsconfig.json",
    "user.test.json",
    "schema.test.yml",
    "go.sum",
    "pnpm-lock.yaml",
    "src/__snapshots__/Button.test.ts.snap",
    "styles/test.css",
    "assets/logo.svg",
  ])("%s is not a test", (filename) => {
    expect(classifyFile(added(filename))).toBeNull();
  });

  it("ignores a removed file entirely", () => {
    // Deleting a test is not adding coverage.
    expect(classifyFile(added("internal/auth_test.go", "removed"))).toBeNull();
    expect(classifyFile(added("tests/test_user.py", "removed"))).toBeNull();
  });

  it("does treat an added or renamed test as present", () => {
    expect(classifyFile(added("tests/test_new.py", "added"))).toBe("strong");
    expect(classifyFile(added("tests/test_new.py", "renamed"))).toBe("strong");
  });

  it("treats a missing status as present rather than declining", () => {
    // Under-awarding because of a missing field is the worse error: §13 says
    // "verified", and a missing status is GitHub's omission, not evidence.
    expect(classifyFile(added("tests/test_new.py", null))).toBe("strong");
  });
});

describe("classifyFile — fixtures and helpers are not coverage", () => {
  it.each([
    "src/test/fixtures/user.json",
    "tests/fixtures/sample_data.py",
    "app/models/__mocks__/user.ts",
    "src/__mocks__/api.ts",
    "testdata/sample.csv",
    "tests/stubs/legacy.ts",
    "db/seeds/users.rb",
    "db/migrations/001_create.rb",
  ])("%s is not a test", (filename) => {
    expect(classifyFile(added(filename))).toBeNull();
  });

  it("still finds a real test that lives beside a fixtures folder", () => {
    // The support-directory check must not veto an unmistakable filename, or a
    // conventional test in `tests/fixtures/` would be missed.
    expect(classifyFile(added("tests/fixtures/parser_test.py"))).toBe("strong");
  });

  it("grades a conventionally-named file under __tests__ as strong", () => {
    // `__tests__/Button.tsx` carries Jest's directory convention and no filename
    // one, so it is evidence of coverage but not of a *named* test.
    expect(classifyFile(added("src/__tests__/Button.tsx"))).toBe("weak");
    expect(classifyFile(added("src/__tests__/Button.test.tsx"))).toBe("strong");
  });

  it("does not treat a support directory as a test directory", () => {
    // `tests/testdata/` looks like tests by path but is data by convention.
    expect(classifyFile(added("tests/testdata/loader.py"))).toBeNull();
  });
});

describe("classifyFile — weak: ambiguous", () => {
  it.each([
    "tests/helpers.ts",
    "tests/README",
    "src/test/support/util.ts",
    "conftest.py",
    "spec/spec_helper.rb",
  ])("%s is only weak evidence", (filename) => {
    expect(classifyFile(added(filename))).toBe("weak");
  });

  it("grades an ambiguous file weak even when it is the only test-ish file", () => {
    // The rule is what decides whether `weak` pays. This asserts the classifier
    // does not quietly promote weak evidence to strong.
    const coverage = detectTestCoverage([added("tests/helpers.ts")]);

    expect(coverage.grade).toBe("weak");
    expect(hasStrongTestEvidence(coverage)).toBe(false);
  });

  it("grades a shell script weak, since the convention is narrow", () => {
    expect(classifyFile(added("scripts/test.sh"))).toBe("weak");
  });
});

describe("detectTestCoverage — grading across a set", () => {
  it("reports none for a change with no tests", () => {
    const coverage = detectTestCoverage([
      added("src/button.tsx"),
      added("README.md"),
      added("package.json"),
    ]);

    expect(coverage.grade).toBe("none");
    expect(coverage.testFiles).toEqual([]);
  });

  it("reports none for an empty set", () => {
    expect(detectTestCoverage([]).grade).toBe("none");
  });

  it("lets one real test win against many fixtures", () => {
    // The strongest single file decides, so a refactor touching fifty fixtures
    // and one test is still recognised as coverage.
    const coverage = detectTestCoverage([
      added("tests/fixtures/a.json"),
      added("tests/fixtures/b.json"),
      added("internal/auth_test.go"),
      added("tests/stubs/legacy.ts"),
    ]);

    expect(coverage.grade).toBe("strong");
    expect(coverage.testFiles).toEqual(["internal/auth_test.go"]);
  });

  it("orders strong files before weak ones, so a citation is unambiguous", () => {
    const coverage = detectTestCoverage([
      added("tests/helpers.ts"),
      added("internal/auth_test.go"),
    ]);

    expect(coverage.testFiles[0]).toBe("internal/auth_test.go");
  });

  it("does not let a removed test raise the grade", () => {
    const coverage = detectTestCoverage([
      added("internal/auth_test.go", "removed"),
      added("src/button.tsx"),
    ]);

    expect(coverage.grade).toBe("none");
  });

  it("keeps a real test even when another was removed", () => {
    const coverage = detectTestCoverage([
      added("old_test.go", "removed"),
      added("internal/auth_test.go"),
    ]);

    expect(coverage.grade).toBe("strong");
    expect(coverage.testFiles).toEqual(["internal/auth_test.go"]);
  });

  it("names dismissed files so a borderline case is explainable", () => {
    // A test-shaped file ruled out by a directory rule should be reportable,
    // not silently dropped — otherwise the reason it earned nothing is lost.
    const coverage = detectTestCoverage([
      added("docs/auth_test.go"),
      added("src/button.tsx"),
    ]);

    expect(coverage.grade).toBe("none");
    expect(coverage.dismissed).toContain("docs/auth_test.go");
  });

  it("does not report an ordinary source file as dismissed", () => {
    const coverage = detectTestCoverage([added("src/button.tsx")]);

    expect(coverage.dismissed).toEqual([]);
  });

  it("is order independent", () => {
    const files = [
      added("internal/auth_test.go"),
      added("tests/helpers.ts"),
      added("tests/fixtures/a.json"),
    ];

    expect(detectTestCoverage(files)).toEqual(
      detectTestCoverage([...files].reverse()),
    );
  });

  it("does not mutate its input", () => {
    const files = [added("internal/auth_test.go")];
    const before = JSON.stringify(files);

    detectTestCoverage(files);

    expect(JSON.stringify(files)).toBe(before);
  });

  it("handles a file with no directory component", () => {
    expect(classifyFile(added("main_test.go"))).toBe("strong");
    expect(classifyFile(added("main.go"))).toBeNull();
  });

  it("handles a path with no extension", () => {
    expect(classifyFile(added("tests/run"))).toBe("weak");
    expect(classifyFile(added("tests/run.sh"))).toBe("weak");
  });
});

describe("the §20 anti-farming concern — repetitive test generation", () => {
  it("cannot tell a generated test from a written one", () => {
    // §13 warns against rewarding "repetitive or meaningless test generation".
    // Nothing in a filename distinguishes `test_a.py` written by hand from one
    // emitted by a template, so this module grades them identically — and says
    // so, rather than implying a quality judgement it cannot make.
    const generated = ["tests/test_a.py", "tests/test_b.py", "tests/test_c.py"];
    const coverage = detectTestCoverage(generated.map((f) => added(f, "added")));

    expect(coverage.grade).toBe("strong");
    expect(coverage.testFiles).toEqual(generated);
  });

  it("does not award more for more test files", () => {
    // Quantity is not quality, and §13 asks for "meaningful test coverage". A
    // rule must therefore award once per pull request, not once per test file —
    // otherwise adding a hundred trivial tests would out-earn a real fix.
    const one = detectTestCoverage([added("internal/auth_test.go")]);
    const many = detectTestCoverage([
      added("internal/auth_test.go"),
      added("internal/util_test.go"),
      added("internal/http_test.go"),
    ]);

    expect(many.grade).toBe(one.grade);
  });
});