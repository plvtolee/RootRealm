import { describe, expect, it } from "vitest";

import { GitHubClient } from "./client";
import type { GitHubClientOptions } from "./client";
import type { FailureReason } from "./failure";
import { createProfileClient, fetchPublicProfile } from "./profile";

const NOW = 1_700_000_000_000;

interface Stub {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function client(stubs: Stub[], overrides: GitHubClientOptions = {}): GitHubClient {
  let index = 0;
  const fetchImpl = (async () => {
    const stub = stubs[Math.min(index, stubs.length - 1)];
    index += 1;
    return new Response(JSON.stringify(stub.body ?? {}), {
      status: stub.status ?? 200,
      headers: new Headers(stub.headers ?? {}),
    });
  }) as unknown as typeof fetch;

  return new GitHubClient({
    fetch: fetchImpl,
    now: () => NOW,
    retryBaseDelayMs: 1,
    maxRetries: 0,
    ...overrides,
  });
}

const USER = {
  login: "OctoCat",
  id: 583231,
  name: "The Octocat",
  avatar_url: "https://avatars.githubusercontent.com/u/583231",
  html_url: "https://github.com/OctoCat",
  bio: "Mascot",
  company: "GitHub",
  location: "San Francisco",
  blog: "https://github.blog",
  public_repos: 8,
  public_gists: 8,
  followers: 9000,
  following: 9,
  created_at: "2011-01-25T18:44:36Z",
  updated_at: "2026-01-02T09:00:00Z",
};

describe("fetchPublicProfile — success", () => {
  it("maps a valid user to a validated profile", async () => {
    const result = await fetchPublicProfile(client([{ body: USER }]), "octocat");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.profile).toMatchObject({
      login: "OctoCat",
      githubId: 583231,
      name: "The Octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/583231",
      profileUrl: "https://github.com/OctoCat",
      publicRepos: 8,
    });
  });

  it("keeps the raw payload as evidence", async () => {
    const result = await fetchPublicProfile(client([{ body: USER }]), "octocat");
    if (!result.ok) throw new Error("expected success");

    expect(result.profile.source.login).toBe("OctoCat");
  });

  it("reports the observed rate-limit state alongside the profile", async () => {
    const result = await fetchPublicProfile(
      client([{ body: USER, headers: { "x-ratelimit-remaining": "4998" } }]),
      "octocat",
    );

    expect(result.rateLimit.remaining).toBe(4998);
  });

  it("does not throw when optional fields are absent", async () => {
    const result = await fetchPublicProfile(
      client([{ body: { login: "octocat", id: 1 } }]),
      "octocat",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.name).toBeNull();
    expect(result.profile.blog).toBeNull();
  });
});

describe("fetchPublicProfile — controlled failures", () => {
  async function failureFor(
    stubs: Stub[],
    username = "octocat",
  ): Promise<FailureReason> {
    const result = await fetchPublicProfile(client(stubs), username);
    if (result.ok) throw new Error("expected a failure");
    return result.failure.reason;
  }

  it("rejects a malformed username before contacting GitHub", async () => {
    expect(await failureFor([{ body: USER }], "not a login!")).toBe("invalid_username");
  });

  it("reports an unknown account as not_found, not as an error state", async () => {
    expect(await failureFor([{ status: 404, body: { message: "Not Found" } }])).toBe(
      "not_found",
    );
  });

  it("reports an exhausted budget as rate_limited", async () => {
    expect(
      await failureFor([
        {
          status: 403,
          body: { message: "API rate limit exceeded" },
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String((NOW + 60_000) / 1000),
          },
        },
      ]),
    ).toBe("rate_limited");
  });

  it("collapses an upstream outage and a timeout into unavailable", async () => {
    expect(await failureFor([{ status: 502, body: {} }])).toBe("unavailable");
  });

  it("collapses a rejected token into unavailable rather than leaking it", async () => {
    expect(await failureFor([{ status: 401, body: {} }])).toBe("unavailable");
  });

  it("reports an unrecognised payload as unexpected_response", async () => {
    expect(await failureFor([{ body: { login: 42 } }])).toBe("unexpected_response");
  });

  it("carries a user-safe message and a log-only detail", async () => {
    const result = await fetchPublicProfile(
      client([{ status: 404, body: { message: "Not Found" } }]),
      "ghost",
    );
    if (result.ok) throw new Error("expected a failure");

    expect(result.failure.message).toBe("No public GitHub account exists with that username.");
    expect(result.failure.message).not.toContain("api.github.com");
    expect(result.failure.detail).toContain("Not Found");
  });

  it("surfaces the wait GitHub asked for on a rate-limited lookup", async () => {
    const result = await fetchPublicProfile(
      client([
        {
          status: 429,
          body: {},
          headers: { "retry-after": "45", "x-ratelimit-remaining": "0" },
        },
      ]),
      "octocat",
    );
    if (result.ok) throw new Error("expected a failure");

    expect(result.failure.reason).toBe("rate_limited");
    expect(result.failure.retryAfterMs).toBe(45_000);
  });

  it("re-throws a programming error instead of reporting it as an outage", async () => {
    const broken = {
      getUser: () => Promise.reject(new TypeError("bug in ingestion")),
      rateLimitState: () => ({ limit: null, remaining: null, resetsAt: null, retryAfterMs: null, observedAt: 0 }),
    } as unknown as GitHubClient;

    await expect(fetchPublicProfile(broken, "octocat")).rejects.toThrow(TypeError);
  });
});

describe("createProfileClient", () => {
  it("passes an explicit token through", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify(USER), {
        status: 200,
        headers: new Headers(),
      })) as unknown as typeof fetch;

    const client = createProfileClient({ fetch: fetchImpl, now: () => NOW });
    const result = await fetchPublicProfile(client, "octocat");

    expect(result.ok).toBe(true);
  });
});