import { describe, expect, it } from "vitest";

import { DEFAULT_AUTH_NEXT, loginPath, safeNextPath } from "./next-path";

describe("safe post-authentication paths", () => {
  it("keeps internal paths and their query strings", () => {
    expect(safeNextPath("/customization?tab=appearance")).toBe("/customization?tab=appearance");
  });

  it("rejects external and protocol-relative destinations", () => {
    expect(safeNextPath("https://evil.example")).toBe(DEFAULT_AUTH_NEXT);
    expect(safeNextPath("//evil.example/path")).toBe(DEFAULT_AUTH_NEXT);
    expect(safeNextPath("/\\\\evil.example")).toBe(DEFAULT_AUTH_NEXT);
  });

  it("uses the protected home as the login fallback", () => {
    expect(loginPath(null)).toBe("/login?next=%2Fhome");
  });
});
