import { describe, expect, it } from "vitest";

import {
  SESSION_TTL_SECONDS,
  SessionError,
  issueSession,
  sessionCookieAttributes,
  verifySession,
} from "./session";

const options = { secret: "test-secret", now: () => 1_000_000_000_000 };

describe("session (9.1)", () => {
  it("issues a value that verifies back to the same user", () => {
    const { value } = issueSession("user-1", options);
    const payload = verifySession(value, options);

    expect(payload.userId).toBe("user-1");
    expect(payload.expiresAt - payload.issuedAt).toBe(SESSION_TTL_SECONDS);
  });

  it("rejects a tampered payload", () => {
    const { value } = issueSession("user-1", options);
    const [payload, signature] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ userId: "user-2", issuedAt: 1, expiresAt: 9_999_999_999 }), "utf8").toString("base64url");

    expect(() => verifySession(`${forged}.${signature}`, options)).toThrow(SessionError);
    expect(payload).toBeDefined();
  });

  it("rejects a session signed with a different secret", () => {
    const { value } = issueSession("user-1", options);
    expect(() => verifySession(value, { ...options, secret: "other" })).toThrow(SessionError);
  });

  it("rejects an expired session", () => {
    const { value } = issueSession("user-1", { ...options, now: () => 0 });
    const later = { ...options, now: () => (SESSION_TTL_SECONDS + 10) * 1000 };
    expect(() => verifySession(value, later)).toThrow(/expired/);
  });

  it("rejects a missing or malformed cookie", () => {
    expect(() => verifySession(null, options)).toThrow(SessionError);
    expect(() => verifySession("", options)).toThrow(SessionError);
    expect(() => verifySession("no-dot", options)).toThrow(SessionError);
  });

  it("sets HttpOnly and SameSite on every request", () => {
    const attributes = sessionCookieAttributes(
      new Request("https://rootrealm.example/api/auth/github/callback"),
    );

    expect(attributes).toContain("HttpOnly");
    expect(attributes).toContain("SameSite=Lax");
    expect(attributes).toContain("Path=/");
  });

  it("omits Secure for plain-HTTP localhost, so the production build works locally", () => {
    // The failure this prevents is subtle: `npm run start` sets NODE_ENV=production
    // over http://localhost, and a browser silently discards a Secure cookie sent
    // over http. Sign-in looks like it worked and then nothing is authenticated.
    const local = sessionCookieAttributes(
      new Request("http://localhost:3000/api/auth/github/callback"),
    );

    expect(local).not.toContain("Secure");
    expect(local).toContain("HttpOnly");
  });

  it("sets Secure for HTTPS, including a loopback host reached over TLS", () => {
    expect(
      sessionCookieAttributes(new Request("https://rootrealm.example/cb")),
    ).toContain("Secure");
    expect(
      sessionCookieAttributes(new Request("https://localhost:3000/cb")),
    ).toContain("Secure");
  });

  it("trusts x-forwarded-proto, because a TLS proxy speaks plaintext to us", () => {
    const behindProxy = new Request("http://internal:3000/cb", {
      headers: { "x-forwarded-proto": "https" },
    });

    expect(sessionCookieAttributes(behindProxy)).toContain("Secure");
  });

  it("fails closed on plain HTTP off loopback rather than sending a cookie in cleartext", () => {
    // Marked Secure means the browser drops it. That is the intended outcome: a
    // misconfigured deployment loses its session rather than leaking one.
    const misconfigured = sessionCookieAttributes(new Request("http://rootrealm.example/cb"));

    expect(misconfigured).toContain("Secure");
  });
});