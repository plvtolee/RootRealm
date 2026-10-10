import { describe, expect, it, vi } from "vitest";

import { GitHubClient, assertValidUsername, nextPageUrl } from "./client";
import { GitHubError } from "./errors";

const NOW = 1_700_000_000_000;
const API = "https://api.github.com";

interface StubResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Raw body text; used to simulate a non-JSON payload. */
  text?: string;
}

function stub(
  responses: StubResponse[],
): { fetch: typeof fetch; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let index = 0;

  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    const stubbed = responses[Math.min(index, responses.length - 1)];
    index += 1;

    const headers = new Headers(stubbed.headers ?? {});
    const text = stubbed.text ?? JSON.stringify(stubbed.body ?? {});

    return new Response(text, { status: stubbed.status ?? 200, headers });
  }) as unknown as typeof fetch;

  return { fetch: impl, calls };
}

function client(
  responses: StubResponse[],
  overrides: Partial<ConstructorParameters<typeof GitHubClient>[0]> = {},
) {
  const { fetch, calls } = stub(responses);
  const instance = new GitHubClient({
    fetch,
    now: () => NOW,
    retryBaseDelayMs: 1,
    ...overrides,
  });
  return { client: instance, calls };
}

/* ------------------------------------------------------------------ */
/* TASK 4.1 — request abstraction                                       */
/* ------------------------------------------------------------------ */

describe("username validation", () => {
  it("accepts real login shapes and trims whitespace", () => {
    expect(assertValidUsername("  octocat ")).toBe("octocat");
    expect(assertValidUsername("a-b-c")).toBe("a-b-c");
    expect(assertValidUsername("A1")).toBe("A1");
  });

  it("rejects shapes GitHub can never issue, without a request", async () => {
    for (const invalid of ["", "  ", "octocat!", "-octocat", "octocat-", "a".repeat(40)]) {
      const { client: api, calls } = client([{ body: {} }]);
      await expect(api.getUser(invalid)).rejects.toMatchObject({
        kind: "invalid_username",
      });
      expect(calls).toHaveLength(0);
    }
  });
});

describe("headers and secrets", () => {
  it("sends the versioned media type and no authorization without a token", async () => {
    const { client: api, calls } = client([{ body: { login: "octocat", id: 1 } }]);
    await api.getUser("octocat");

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.accept).toBe("application/vnd.github+json");
    expect(headers["x-github-api-version"]).toBe("2022-11-28");
    expect(headers.authorization).toBeUndefined();
  });

  it("attaches the token server-side when one is configured", async () => {
    const { client: api, calls } = client([{ body: { login: "octocat", id: 1 } }], {
      token: "ghp_secret",
    });
    await api.getUser("octocat");

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer ghp_secret");
  });
});

describe("nextPageUrl", () => {
  it("follows the next relation", () => {
    const link = `<${API}/users/octocat/repos?page=2>; rel="next", <${API}/users/octocat/repos?page=9>; rel="last"`;
    expect(nextPageUrl(link)).toBe(`${API}/users/octocat/repos?page=2`);
  });

  it("stops when only prev/first/last are offered", () => {
    const link = `<${API}/users/octocat/repos?page=1>; rel="prev", <${API}/users/octocat/repos?page=9>; rel="last"`;
    expect(nextPageUrl(link)).toBeNull();
  });

  it("refuses a foreign host so the token cannot be redirected", () => {
    expect(nextPageUrl(`<https://evil.example/steal>; rel="next"`)).toBeNull();
  });

  it("returns null without a header", () => {
    expect(nextPageUrl(null)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* TASK 4.2 — profile                                                  */
/* ------------------------------------------------------------------ */

describe("getUser", () => {
  it("returns a typed user for a valid account", async () => {
    const { client: api, calls } = client([
      {
        body: {
          login: "octocat",
          id: 583231,
          name: "The Octocat",
          html_url: "https://github.com/octocat",
        },
        headers: { "x-ratelimit-remaining": "4998" },
      },
    ]);

    const user = await api.getUser("octocat");

    expect(user).toMatchObject({ login: "octocat", id: 583231, name: "The Octocat" });
    expect(calls[0].url).toBe(`${API}/users/octocat`);
  });

  it("maps a missing account to a controlled not_found error", async () => {
    const { client: api } = client([
      { status: 404, body: { message: "Not Found" } },
    ]);

    await expect(api.getUser("ghost")).rejects.toMatchObject({
      kind: "not_found",
      status: 404,
      retryable: false,
    });
  });

  it("maps an unexpected body to malformed_response", async () => {
    const { client: api } = client([{ body: { login: 7 } }]);

    await expect(api.getUser("octocat")).rejects.toMatchObject({
      kind: "malformed_response",
    });
  });

  it("maps a non-JSON body to malformed_response", async () => {
    const { client: api } = client([{ text: "<html>502</html>" }]);

    await expect(api.getUser("octocat")).rejects.toMatchObject({
      kind: "malformed_response",
    });
  });
});

/* ------------------------------------------------------------------ */
/* TASK 4.3 — repositories with pagination                             */
/* ------------------------------------------------------------------ */

describe("listRepositories", () => {
  const repo = (id: number, name: string) => ({
    id,
    full_name: `octocat/${name}`,
    name,
    owner: { login: "octocat" },
    archived: id % 2 === 0,
  });

  it("follows Link pagination and merges the pages", async () => {
    const { client: api, calls } = client([
      {
        body: [repo(1, "one"), repo(2, "two")],
        headers: { link: `<${API}/users/octocat/repos?page=2>; rel="next"` },
      },
      { body: [repo(3, "three")], headers: {} },
    ]);

    const result = await api.listRepositories("octocat");

    expect(result.items.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(result.pages).toBe(2);
    expect(result.truncated).toBe(false);
    expect(calls[0].url).toContain("sort=created");
    expect(calls[0].url).toContain("direction=asc");
    expect(calls[0].url).toContain("per_page=100");
    expect(calls[1].url).toBe(`${API}/users/octocat/repos?page=2`);
  });

  it("preserves the archived flag on every page", async () => {
    const { client: api } = client([
      {
        body: [repo(1, "one")],
        headers: { link: `<${API}/users/octocat/repos?page=2>; rel="next"` },
      },
      { body: [repo(2, "two")] },
    ]);

    const result = await api.listRepositories("octocat");
    expect(result.items.map((r) => r.archived)).toEqual([false, true]);
  });

  it("returns an empty list for an account with no public repositories", async () => {
    const { client: api } = client([{ body: [] }]);

    const result = await api.listRepositories("octocat");

    expect(result.items).toEqual([]);
    expect(result.pages).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it("flags a walk stopped by the page cap rather than hiding it", async () => {
    const alwaysNext = {
      body: [repo(1, "one")],
      headers: { link: `<${API}/users/octocat/repos?page=2>; rel="next"` },
    };
    const { client: api, calls } = client([alwaysNext, alwaysNext]);

    const result = await api.listRepositories("octocat");

    // 10 pages max, so a broken Link header cannot loop forever.
    expect(calls).toHaveLength(10);
    expect(result.pages).toBe(10);
    expect(result.truncated).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* TASK 4.4 — activity                                                 */
/* ------------------------------------------------------------------ */

describe("listEvents", () => {
  const event = (id: string) => ({
    id,
    type: "PushEvent",
    public: true,
    created_at: "2026-02-01T10:00:00Z",
    actor: { login: "octocat" },
    repo: { id: 1296269, name: "octocat/Hello-World" },
    payload: { size: 3 },
  });

  it("collects paginated activity and preserves visibility", async () => {
    const { client: api, calls } = client([
      {
        body: [event("1")],
        headers: { link: `<${API}/users/octocat/events?page=2>; rel="next"` },
      },
      { body: [event("2")] },
    ]);

    const result = await api.listEvents("octocat");

    expect(result.items.map((e) => e.id)).toEqual(["1", "2"]);
    expect(result.items.every((e) => e.public)).toBe(true);
    expect(result.pages).toBe(2);
    expect(result.truncated).toBe(false);
    expect(calls[0].url).toBe(`${API}/users/octocat/events?per_page=100`);
  });

  it("returns an empty list rather than an error for an idle account", async () => {
    const { client: api } = client([{ body: [] }]);
    await expect(api.listEvents("octocat")).resolves.toMatchObject({ items: [] });
  });

  it("stops at the feed's own ceiling rather than asking for the 422 page", async () => {
    const alwaysNext = {
      body: [event("1")],
      headers: { link: `<${API}/users/octocat/events?page=2>; rel="next"` },
    };
    const { client: api, calls } = client([alwaysNext, alwaysNext, alwaysNext]);

    const result = await api.listEvents("octocat");

    // GitHub serves 300 events here and answers page 4 with 422. Three pages of
    // 100 is the ceiling, so the walk stops there rather than spending a request
    // out of a 60/hour anonymous budget to be told it cannot continue.
    expect(calls).toHaveLength(3);
    expect(result.pages).toBe(3);
    // GitHub still offered a next page; that is the ceiling, not our own cap.
    expect(result.truncated).toBe(true);
  });

  it("keeps the pages already fetched when GitHub answers with the 422", async () => {
    const { client: api } = client([
      { body: [event("1")], headers: { link: `<${API}/users/octocat/events?page=2>; rel="next"` } },
      { status: 422, body: { message: "pagination is limited for this resource" } },
    ]);

    const result = await api.listEvents("octocat");

    // Without the guard this throws, and 4.1's error taxonomy maps a 422 to
    // `forbidden` — turning a successful read into a 503 and losing the event.
    expect(result.items.map((e) => e.id)).toEqual(["1"]);
    expect(result.truncated).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* TASK 4.1 / 4.8 — errors and rate-limit awareness                    */
/* ------------------------------------------------------------------ */

describe("error handling", () => {
  it("retries a 500 and succeeds without surfacing the failure", async () => {
    const { client: api, calls } = client([
      { status: 500, body: { message: "Server Error" } },
      { body: { login: "octocat", id: 1 } },
    ]);

    await expect(api.getUser("octocat")).resolves.toMatchObject({ login: "octocat" });
    expect(calls).toHaveLength(2);
  });

  it("gives up after maxRetries and reports a retryable server error", async () => {
    const { client: api, calls } = client([{ status: 503, body: {} }], { maxRetries: 1 });

    await expect(api.getUser("octocat")).rejects.toMatchObject({
      kind: "server_error",
      retryable: true,
    });
    expect(calls).toHaveLength(2);
  });

  it("does not retry a 404", async () => {
    const { client: api, calls } = client([{ status: 404, body: {} }], { maxRetries: 3 });
    await expect(api.getUser("ghost")).rejects.toMatchObject({ kind: "not_found" });
    expect(calls).toHaveLength(1);
  });

  it("classifies an exhausted budget as rate limiting even on a 403", async () => {
    const { client: api } = client([
      {
        status: 403,
        body: { message: "API rate limit exceeded" },
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String((NOW + 60_000) / 1000),
        },
      },
    ]);

    const error = await api.getUser("octocat").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GitHubError);
    expect(error).toMatchObject({
      kind: "rate_limited",
      status: 403,
      retryAfterMs: undefined,
    });
    expect(api.rateLimitState().remaining).toBe(0);
  });

  it("keeps the GitHub message and request id for diagnostics", async () => {
    const { client: api } = client([
      {
        status: 404,
        body: { message: "Not Found" },
        headers: { "x-github-request-id": "ABCD:1234" },
      },
    ]);

    await expect(api.getUser("ghost")).rejects.toMatchObject({
      detail: undefined,
      message: expect.stringContaining("Not Found"),
      requestId: "ABCD:1234",
    });
  });

  it("maps a transport failure to a retryable network error", async () => {
    const impl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const api = new GitHubClient({
      fetch: impl as unknown as typeof fetch,
      now: () => NOW,
      retryBaseDelayMs: 1,
      maxRetries: 0,
    });

    await expect(api.getUser("octocat")).rejects.toMatchObject({
      kind: "network_error",
      retryable: true,
    });
  });

  it("does not retry a caller-initiated abort", async () => {
    const controller = new AbortController();
    const impl = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });
    const api = new GitHubClient({
      fetch: impl as unknown as typeof fetch,
      now: () => NOW,
      retryBaseDelayMs: 1,
      maxRetries: 3,
    });

    await expect(
      api.getUser("octocat", { signal: controller.signal }),
    ).rejects.toMatchObject({ kind: "aborted", retryable: false });
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it("maps a timeout to the timeout kind", async () => {
    const impl = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const api = new GitHubClient({
      fetch: impl as unknown as typeof fetch,
      now: () => NOW,
      timeoutMs: 5,
      retryBaseDelayMs: 1,
      maxRetries: 0,
    });

    await expect(api.getUser("octocat")).rejects.toMatchObject({ kind: "timeout" });
  });
});

describe("rate-limit awareness", () => {
  it("tracks the remaining budget across requests", async () => {
    const { client: api } = client([
      { body: { login: "octocat", id: 1 }, headers: { "x-ratelimit-remaining": "4998" } },
      { body: { login: "octocat", id: 1 }, headers: { "x-ratelimit-remaining": "4997" } },
    ]);

    await api.getUser("octocat");
    await api.getUser("octocat");

    const state = api.rateLimitState();
    expect(state.remaining).toBe(4997);
    expect(state.observedAt).toBe(NOW);
  });

  it("honours Retry-After ahead of its own backoff when retrying", async () => {
    vi.useFakeTimers();
    try {
      const { client: api } = client([
        {
          status: 429,
          body: { message: "Too Many Requests" },
          headers: { "retry-after": "2" },
        },
        { body: { login: "octocat", id: 1 } },
      ]);

      const pending = api.getUser("octocat");
      await vi.advanceTimersByTimeAsync(1999);
      const settledEarly = await Promise.race([
        pending.then(() => true, () => true),
        Promise.resolve(false),
      ]);
      expect(settledEarly).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toMatchObject({ login: "octocat" });
    } finally {
      vi.useRealTimers();
    }
  });
});