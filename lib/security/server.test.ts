import { describe, expect, it } from "vitest";

import { COSMETIC_INDEX } from "../cosmetics/catalog";

import {
  assertNoPrivateAuthorization,
  heldCredentials,
  parseGitHubLogin,
  parseItemId,
  safeJson,
} from "./server";

const FAKE_ENV = {
  GITHUB_TOKEN: "ghp_abcdef0123456789abcdef0123456789",
  SESSION_SECRET: "super-secret-signing-key",
} as unknown as NodeJS.ProcessEnv;

describe("credential leaks (19.1)", () => {
  it("answers a clean payload normally", () => {
    const response = safeJson({ ok: true, value: 42 }, { credentials: [] });

    expect(response.status).toBe(200);
  });

  it("refuses a body that is itself a credential", () => {
    const response = safeJson("ghp_abcdef0123456789abcdef0123456789", {
      credentials: ["ghp_abcdef0123456789abcdef0123456789"],
    });

    expect(response.status).toBe(500);
  });

  it("refuses a credential echoed under an unexpected key", () => {
    // The check is by value, which is what catches a token under a key nobody
    // anticipated — `result`, `meta`, `nested.deep[0]` — where a field-name check
    // would see a key it does not know about and pass.
    const response = safeJson(
      { preview: { login: "octocat" }, meta: { authorization: "Bearer ghp_abc" }, extra: ["ok"] },
      { credentials: ["ghp_abc"] },
    );

    expect(response.status).toBe(500);
  });

  it("reads the credentials the process actually holds", () => {
    expect(heldCredentials(FAKE_ENV)).toEqual([
      "ghp_abcdef0123456789abcdef0123456789",
      "super-secret-signing-key",
    ]);
  });

  it("treats an unset secret as no credential rather than an empty string", () => {
    // An empty string would match every body and make the check useless.
    expect(heldCredentials({} as NodeJS.ProcessEnv)).toEqual([]);
  });

  it("uses the credentials from the environment when none are passed", () => {
    const response = safeJson({ token: "ghp_abcdef0123456789abcdef0123456789" }, {
      env: FAKE_ENV,
    });

    expect(response.status).toBe(500);
  });

  it("passes a clean body even when a secret is set", () => {
    const response = safeJson({ preview: { login: "octocat", xp: 42 } }, { env: FAKE_ENV });

    expect(response.status).toBe(200);
  });
});

describe("GitHub login validation (19.2)", () => {
  it("accepts a real login", () => {
    expect(parseGitHubLogin("plvtolee")).toEqual({ ok: true, login: "plvtolee" });
    expect(parseGitHubLogin("octo-cat-1")).toEqual({ ok: true, login: "octo-cat-1" });
  });

  it("trims surrounding whitespace", () => {
    expect(parseGitHubLogin("  octocat  ")).toEqual({ ok: true, login: "octocat" });
  });

  it("rejects the empty string and nulls", () => {
    expect(parseGitHubLogin("").ok).toBe(false);
    expect(parseGitHubLogin(null).ok).toBe(false);
    expect(parseGitHubLogin(undefined).ok).toBe(false);
  });

  it("rejects GitHub's own limits: a hyphen at either end, or a double hyphen", () => {
    expect(parseGitHubLogin("-octocat").ok).toBe(false);
    expect(parseGitHubLogin("octocat-").ok).toBe(false);
  });

  it("rejects characters GitHub does not allow", () => {
    expect(parseGitHubLogin("octo cat").ok).toBe(false);
    expect(parseGitHubLogin("octo/cat").ok).toBe(false);
    expect(parseGitHubLogin("octo?query=1").ok).toBe(false);
    expect(parseGitHubLogin("<script>").ok).toBe(false);
  });

  it("rejects a login over 39 characters", () => {
    expect(parseGitHubLogin("a".repeat(39)).ok).toBe(true);
    expect(parseGitHubLogin("a".repeat(40)).ok).toBe(false);
  });

  it("rejects an over-long string rather than forwarding it upstream", () => {
    expect(parseGitHubLogin("x".repeat(10_000)).ok).toBe(false);
  });
});

describe("item id validation (19.2)", () => {
  it("accepts a catalog-shaped id", () => {
    expect(parseItemId("frame-astral")).toEqual({ ok: true, itemId: "frame-astral" });
    expect(parseItemId("effect-none")).toEqual({ ok: true, itemId: "effect-none" });
  });

  it("rejects anything that could reach a key or a URL", () => {
    expect(parseItemId("frame astral").ok).toBe(false);
    expect(parseItemId("../etc/passwd").ok).toBe(false);
    expect(parseItemId("a".repeat(65)).ok).toBe(false);
    expect(parseItemId("").ok).toBe(false);
    expect(parseItemId(42).ok).toBe(false);
  });

  it("accepts every id the catalog actually publishes", () => {
    // The validator is only safe if the real items pass it. A rule that rejected
    // a legitimate id would take the shop down in a way no test of the validator
    // itself could see.
    const rejected = [...COSMETIC_INDEX.byId.keys()].filter((id) => !parseItemId(id).ok);

    expect(rejected).toEqual([]);
  });
});

describe("private data requires authorization (19.5)", () => {
  it("permits a public request with no authorization", () => {
    expect(assertNoPrivateAuthorization(false, null)).toBe(true);
  });

  it("refuses a private request with no authorization", () => {
    // RootRealm has no consent surface yet, so this always refuses today. The
    // point is that the day a `repo` scope arrives, this is the rule it meets.
    expect(assertNoPrivateAuthorization(true, null)).toBe(false);
  });

  it("permits a private request once an authorization exists", () => {
    expect(
      assertNoPrivateAuthorization(true, { authorizedAt: "2026-10-12T00:00:00.000Z" }),
    ).toBe(true);
  });
});