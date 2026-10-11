import { describe, expect, it, vi } from "vitest";

import {
  GITHUB_SCOPES,
  buildAuthorizationUrl,
  createState,
  exchangeCode,
  fetchIdentity,
  statesMatch,
  tokenFingerprint,
} from "./oauth";

describe("buildAuthorizationUrl (9.1)", () => {
  const base = {
    clientId: "client-123",
    redirectUri: "https://example.com/api/auth/github/callback",
    state: "abc123",
  };

  it("targets GitHub's authorize endpoint with the required parameters", () => {
    const url = new URL(buildAuthorizationUrl(base));

    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe(base.redirectUri);
    expect(url.searchParams.get("state")).toBe("abc123");
  });

  it("requests only read:user by default", () => {
    const url = new URL(buildAuthorizationUrl(base));
    expect(url.searchParams.get("scope")).toBe("read:user");
    expect(GITHUB_SCOPES).toEqual(["read:user"]);
  });

  it("never requests a repo, write or org scope", () => {
    const scope = new URL(buildAuthorizationUrl(base)).searchParams.get("scope") ?? "";
    for (const forbidden of ["repo", "workflow", "write:", "admin:", "delete_repo", "org"]) {
      expect(scope).not.toContain(forbidden);
    }
  });
});

describe("state (9.1)", () => {
  it("produces unguessable, distinct values", () => {
    const a = createState();
    const b = createState();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it("matches identical values and rejects anything else", () => {
    const state = createState();
    expect(statesMatch(state, state)).toBe(true);
    expect(statesMatch(state, null)).toBe(false);
    expect(statesMatch(state, "other")).toBe(false);
    expect(statesMatch(state, state.slice(0, -1))).toBe(false);
  });
});

describe("exchangeCode (9.1)", () => {
  const base = { clientId: "id", clientSecret: "secret", code: "code", redirectUri: "https://x" };

  it("returns the access token from a JSON response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "gho_abc", scope: "read:user" }), { status: 200 }),
    );

    const result = await exchangeCode({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result).toEqual({ ok: true, accessToken: "gho_abc", scope: "read:user" });
  });

  it("treats a 200 with no token as a malformed response, not a success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "bad_verification_code" }), { status: 200 }),
    );

    const result = await exchangeCode({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });

  it("reports a non-OK status as an exchange failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    const result = await exchangeCode({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(500);
  });
});

describe("fetchIdentity (9.1)", () => {
  it("returns the verified identity", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ login: "octocat", id: 583231, name: "The Octocat", avatar_url: "https://x" }), { status: 200 }),
    );

    const identity = await fetchIdentity("gho_abc", fetchImpl as unknown as typeof fetch);

    expect(identity).toEqual({ login: "octocat", githubId: 583231, name: "The Octocat", avatarUrl: "https://x" });
  });

  it("returns null when the token is rejected", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    expect(await fetchIdentity("bad", fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it("returns null when the payload is missing the login or id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ name: "No id" }), { status: 200 }),
    );
    expect(await fetchIdentity("gho_abc", fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it("sends the token in the Authorization header, not the URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ login: "octocat", id: 1 }), { status: 200 }),
    );

    await fetchIdentity("gho_secret", fetchImpl as unknown as typeof fetch);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("gho_secret");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer gho_secret");
  });
});

describe("tokenFingerprint (9.1)", () => {
  it("is stable and does not contain the token", () => {
    const token = "gho_supersecrettokenvalue";
    const fingerprint = tokenFingerprint(token);

    expect(fingerprint).toBe(tokenFingerprint(token));
    expect(fingerprint).not.toContain(token);
    expect(fingerprint).toHaveLength(16);
  });
});