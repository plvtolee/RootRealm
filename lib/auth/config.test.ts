import { describe, expect, it } from "vitest";

import { readAuthConfig } from "./config";

const complete = {
  GITHUB_OAUTH_CLIENT_ID: "client-id",
  GITHUB_OAUTH_CLIENT_SECRET: "client-secret",
  SESSION_SECRET: "session-secret",
  GITHUB_OAUTH_REDIRECT_URI: "https://example.com/api/auth/github/callback",
  NODE_ENV: "test",
} as NodeJS.ProcessEnv;

describe("readAuthConfig (9.1)", () => {
  it("returns the configuration when every value is present", () => {
    const config = readAuthConfig(complete);
    expect(config).toMatchObject({
      clientId: "client-id",
      clientSecret: "client-secret",
      sessionSecret: "session-secret",
      redirectUri: "https://example.com/api/auth/github/callback",
      isProduction: false,
    });
  });

  it("returns null when any value is missing", () => {
    for (const key of Object.keys(complete)) {
      if (key === "NODE_ENV") continue;
      const partial = { ...complete, [key]: "" };
      expect(readAuthConfig(partial)).toBeNull();
    }
  });

  it("flags production", () => {
    expect(readAuthConfig({ ...complete, NODE_ENV: "production" })?.isProduction).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(readAuthConfig({ ...complete, GITHUB_OAUTH_CLIENT_ID: "  client-id  " })?.clientId).toBe("client-id");
  });
});