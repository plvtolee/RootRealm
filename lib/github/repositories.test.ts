import { describe, expect, it } from "vitest";

import { GitHubClient } from "./client";
import type { FailureReason } from "./failure";
import { fetchRepositories } from "./repositories";

const NOW = 1_700_000_000_000;
const API = "https://api.github.com";

interface Stub {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function client(stubs: Stub[]): GitHubClient {
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
  });
}

const repo = (over: Record<string, unknown> = {}) => ({
  id: 1296269,
  full_name: "octocat/Hello-World",
  name: "Hello-World",
  owner: { login: "octocat" },
  html_url: "https://github.com/octocat/Hello-World",
  language: "TypeScript",
  created_at: "2011-01-26T19:01:12Z",
  pushed_at: "2026-01-02T09:00:00Z",
  ...over,
});

describe("fetchRepositories — normalisation", () => {
  it("derives a stable identifier alongside the display name", async () => {
    const result = await fetchRepositories(client([{ body: [repo()] }]), "octocat");
    if (!result.ok) throw new Error("expected success");

    const [record] = result.observation.repositories;
    expect(record).toMatchObject({
      repositoryId: 1296269,
      fullName: "octocat/Hello-World",
      slug: "octocat/hello-world",
      ownerLogin: "octocat",
      name: "Hello-World",
      primaryLanguage: "TypeScript",
    });
  });

  it("keeps the numeric id as the key even when the full name differs in case", async () => {
    const result = await fetchRepositories(
      client([{ body: [repo({ full_name: "OctoCat/Hello-World" })] }]),
      "octocat",
    );
    if (!result.ok) throw new Error("expected success");

    expect(result.observation.repositories[0].repositoryId).toBe(1296269);
    expect(result.observation.repositories[0].fullName).toBe("OctoCat/Hello-World");
    expect(result.observation.repositories[0].slug).toBe("octocat/hello-world");
  });

  it("keeps the raw payload for evidence", async () => {
    const result = await fetchRepositories(client([{ body: [repo()] }]), "octocat");
    if (!result.ok) throw new Error("expected success");

    expect(result.observation.repositories[0].source.id).toBe(1296269);
  });
});

describe("fetchRepositories — archived state is preserved", () => {
  it("keeps archived repositories in the observation", async () => {
    const result = await fetchRepositories(
      client([{ body: [repo({ archived: true })] }]),
      "octocat",
    );
    if (!result.ok) throw new Error("expected success");

    expect(result.observation.repositories).toHaveLength(1);
    expect(result.observation.repositories[0].isArchived).toBe(true);
  });

  it("keeps forks, templates and disabled repositories too", async () => {
    const result = await fetchRepositories(
      client([
        {
          body: [
            repo({ id: 1, fork: true }),
            repo({ id: 2, is_template: true }),
            repo({ id: 3, disabled: true }),
          ],
        },
      ]),
      "octocat",
    );
    if (!result.ok) throw new Error("expected success");

    expect(result.observation.repositories.map((r) => r.isFork)).toEqual([true, false, false]);
    expect(result.observation.repositories.map((r) => r.isTemplate)).toEqual([false, true, false]);
    expect(result.observation.repositories.map((r) => r.isDisabled)).toEqual([false, false, true]);
  });
});

describe("fetchRepositories — pagination", () => {
  it("merges every page and reports how many it walked", async () => {
    const result = await fetchRepositories(
      client([
        {
          body: [repo({ id: 1 }), repo({ id: 2 })],
          headers: { link: `<${API}/users/octocat/repos?page=2>; rel="next"` },
        },
        { body: [repo({ id: 3 })], headers: {} },
      ]),
      "octocat",
    );
    if (!result.ok) throw new Error("expected success");

    expect(result.observation.count).toBe(3);
    expect(result.observation.pages).toBe(2);
    expect(result.observation.truncated).toBe(false);
  });

  it("reports a truncated walk so a partial count is never read as complete", async () => {
    const alwaysNext = {
      body: [repo({ id: 1 })],
      headers: { link: `<${API}/users/octocat/repos?page=2>; rel="next"` },
    };
    const result = await fetchRepositories(
      client([alwaysNext, alwaysNext]),
      "octocat",
    );
    if (!result.ok) throw new Error("expected success");

    expect(result.observation.truncated).toBe(true);
    expect(result.observation.count).toBe(10);
  });

  it("reports an empty account as zero repositories, not as a failure", async () => {
    const result = await fetchRepositories(client([{ body: [] }]), "octocat");
    if (!result.ok) throw new Error("expected success");

    expect(result.observation.count).toBe(0);
    expect(result.observation.oldestCreatedAt).toBeNull();
    expect(result.observation.latestActivityAt).toBeNull();
  });
});

describe("fetchRepositories — observed window", () => {
  it("reports the oldest creation and the latest push across all pages", async () => {
    const result = await fetchRepositories(
      client([
        {
          body: [
            repo({ id: 1, created_at: "2015-05-05T00:00:00Z", pushed_at: "2024-01-01T00:00:00Z" }),
            repo({ id: 2, created_at: "2011-01-26T19:01:12Z", pushed_at: "2026-01-02T09:00:00Z" }),
            repo({ id: 3, created_at: "2019-09-09T00:00:00Z", pushed_at: "2025-06-06T00:00:00Z" }),
          ],
        },
      ]),
      "octocat",
    );
    if (!result.ok) throw new Error("expected success");

    expect(result.observation.oldestCreatedAt).toBe("2011-01-26T19:01:12Z");
    expect(result.observation.latestActivityAt).toBe("2026-01-02T09:00:00Z");
  });

  it("ignores missing timestamps instead of treating them as zero", async () => {
    const result = await fetchRepositories(
      client([
        {
          body: [repo({ id: 1, created_at: null, pushed_at: null }), repo({ id: 2 })],
        },
      ]),
      "octocat",
    );
    if (!result.ok) throw new Error("expected success");

    expect(result.observation.oldestCreatedAt).toBe("2011-01-26T19:01:12Z");
    expect(result.observation.latestActivityAt).toBe("2026-01-02T09:00:00Z");
  });
});

describe("fetchRepositories — controlled failures", () => {
  async function reasonFor(stubs: Stub[], username = "octocat"): Promise<FailureReason> {
    const result = await fetchRepositories(client(stubs), username);
    if (result.ok) throw new Error("expected a failure");
    return result.failure.reason;
  }

  it("rejects a malformed username without spending a request", async () => {
    expect(await reasonFor([{ body: [] }], "-not-a-login")).toBe("invalid_username");
  });

  it("reports an unknown account as not_found", async () => {
    expect(await reasonFor([{ status: 404, body: {} }])).toBe("not_found");
  });

  it("reports an exhausted budget as rate_limited", async () => {
    expect(
      await reasonFor([
        {
          status: 403,
          body: {},
          headers: { "x-ratelimit-remaining": "0" },
        },
      ]),
    ).toBe("rate_limited");
  });

  it("re-throws a programming error rather than reporting an outage", async () => {
    const broken = {
      listRepositories: () => Promise.reject(new TypeError("bug")),
      rateLimitState: () => ({ limit: null, remaining: null, resetsAt: null, retryAfterMs: null, observedAt: 0 }),
    } as unknown as GitHubClient;

    await expect(fetchRepositories(broken, "octocat")).rejects.toThrow(TypeError);
  });
});