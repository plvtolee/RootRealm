import { describe, expect, it } from "vitest";

import { GITHUB_API_DEFAULT, GITHUB_OAUTH_DEFAULT, gitHubApiBase, gitHubOAuthBase, isGitHubBaseOverridden } from "./endpoints";

const DEV = { NODE_ENV: "development" } as NodeJS.ProcessEnv;
const PROD = { NODE_ENV: "production" } as NodeJS.ProcessEnv;

describe("gitHubApiBase — the production default", () => {
  it("is the real host when nothing is set", () => {
    expect(gitHubApiBase(DEV)).toBe(GITHUB_API_DEFAULT);
  });

  // The override is refused in production: production traffic always goes to real GitHub.
  it("refuses an override in production so that production traffic always goes to real GitHub", () => {
    const env = { ...PROD, GITHUB_API_BASE: "http://localhost:4599" };
    expect(gitHubApiBase(env)).toBe(GITHUB_API_DEFAULT);
    expect(isGitHubBaseOverridden(env)).toBe(false);
  });

  it("reports production as not overridden", () => {
    const env = { ...PROD, GITHUB_API_BASE: "http://localhost:4599" };
    expect(isGitHubBaseOverridden(env)).toBe(false);
  });
});

describe("gitHubApiBase — development override", () => {
  it("honors an override outside production", () => {
    const env = { ...DEV, GITHUB_API_BASE: "http://localhost:4599" };
    expect(gitHubApiBase(env)).toBe("http://localhost:4599");
  });

  it("strips a trailing slash so paths do not double up", () => {
    const env = { ...DEV, GITHUB_API_BASE: "http://localhost:4599/" };
    expect(gitHubApiBase(env)).toBe("http://localhost:4599");
  });

  it("treats a blank or whitespace override as absent", () => {
    expect(gitHubApiBase({ ...DEV, GITHUB_API_BASE: "   " })).toBe(GITHUB_API_DEFAULT);
    expect(gitHubApiBase({ ...DEV, GITHUB_API_BASE: "" })).toBe(GITHUB_API_DEFAULT);
  });
});

describe("gitHubOAuthBase — the OAuth host", () => {
  it("defaults to the real GitHub web host", () => {
    expect(gitHubOAuthBase(DEV)).toBe(GITHUB_OAUTH_DEFAULT);
  });

  it("follows its own override, independently of the API one", () => {
    const env = { ...DEV, GITHUB_OAUTH_BASE: "http://localhost:4599" };
    expect(gitHubOAuthBase(env)).toBe("http://localhost:4599");
    // The API base is untouched, so the two are genuinely independent seam points.
    expect(gitHubApiBase(env)).toBe(GITHUB_API_DEFAULT);
  });

  it("ignores an override in production", () => {
    const env = { ...PROD, GITHUB_OAUTH_BASE: "http://localhost:4599" };
    expect(gitHubOAuthBase(env)).toBe(GITHUB_OAUTH_DEFAULT);
  });
});

describe("isGitHubBaseOverridden — a caller's guard", () => {
  it("is true when either seam is redirected", () => {
    expect(isGitHubBaseOverridden({ ...DEV, GITHUB_API_BASE: "http://x" })).toBe(true);
    expect(isGitHubBaseOverridden({ ...DEV, GITHUB_OAUTH_BASE: "http://x" })).toBe(true);
  });

  it("is false with no overrides", () => {
    expect(isGitHubBaseOverridden(DEV)).toBe(false);
  });
});