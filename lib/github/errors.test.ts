import { describe, expect, it } from "vitest";

import { GitHubError, isGitHubError, kindForStatus } from "./errors";

describe("kindForStatus", () => {
  it("distinguishes an exhausted budget from an abuse block on 403", () => {
    expect(kindForStatus(403, 0)).toBe("rate_limited");
    expect(kindForStatus(403, 42)).toBe("forbidden");
    expect(kindForStatus(403, undefined)).toBe("forbidden");
  });

  it("maps the remaining statuses", () => {
    expect(kindForStatus(401, 10)).toBe("unauthorized");
    expect(kindForStatus(404, 10)).toBe("not_found");
    expect(kindForStatus(429, 10)).toBe("rate_limited");
    expect(kindForStatus(502, 10)).toBe("server_error");
    expect(kindForStatus(503, 10)).toBe("server_error");
  });
});

describe("GitHubError", () => {
  it("marks only transient failures as retryable", () => {
    const retryable = ["server_error", "network_error", "timeout", "rate_limited"] as const;
    const terminal = [
      "invalid_username",
      "not_found",
      "forbidden",
      "unauthorized",
      "malformed_response",
      "aborted",
    ] as const;

    for (const kind of retryable) {
      expect(new GitHubError("x", { kind }).retryable).toBe(true);
    }
    for (const kind of terminal) {
      expect(new GitHubError("x", { kind }).retryable).toBe(false);
    }
  });

  it("preserves the cause for server-side logging", () => {
    const cause = new Error("socket hang up");
    const error = new GitHubError("failed", { kind: "network_error", cause });
    expect(error.cause).toBe(cause);
  });

  it("is narrowable from an unknown catch binding", () => {
    expect(isGitHubError(new GitHubError("x", { kind: "not_found" }))).toBe(true);
    expect(isGitHubError(new Error("x"))).toBe(false);
    expect(isGitHubError(null)).toBe(false);
  });
});