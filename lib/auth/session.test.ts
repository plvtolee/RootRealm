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

  it("sets HttpOnly and SameSite, and Secure only in production", () => {
    const dev = sessionCookieAttributes(false);
    const prod = sessionCookieAttributes(true);

    expect(dev).toContain("HttpOnly");
    expect(dev).toContain("SameSite=Lax");
    expect(dev).not.toContain("Secure");
    expect(prod).toContain("Secure");
  });
});