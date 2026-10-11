import { describe, expect, it } from "vitest";

import {
  checkPermissionBoundaries,
  credentialsStayServerSide,
  privateDataRequiresAuthorization,
  scopesAreMinimal,
} from "./permissions";

describe("credentials stay server-side (9.4)", () => {
  it("accepts a body with no credential", () => {
    expect(credentialsStayServerSide('{"login":"octocat"}', ["gho_secret"]).ok).toBe(true);
  });

  it("rejects a body that echoes the token under any key", () => {
    const check = credentialsStayServerSide('{"somethingElse":"gho_secret"}', ["gho_secret"]);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.violation.boundary).toBe("credentials");
  });
});

describe("scopes are minimal (9.4)", () => {
  it("accepts read:user and an empty set", () => {
    expect(scopesAreMinimal(["read:user"]).ok).toBe(true);
    expect(scopesAreMinimal([]).ok).toBe(true);
  });

  it("rejects any scope outside the required set", () => {
    for (const scope of ["repo", "workflow", "write:packages", "admin:org"]) {
      expect(scopesAreMinimal([scope]).ok).toBe(false);
    }
  });
});

describe("private data requires explicit authorization (9.4)", () => {
  it("allows public-only requests without authorization", () => {
    expect(privateDataRequiresAuthorization(false, null).ok).toBe(true);
  });

  it("refuses private data without an authorization", () => {
    const check = privateDataRequiresAuthorization(true, null);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.violation.boundary).toBe("private_data");
  });

  it("allows private data once it is authorized", () => {
    expect(privateDataRequiresAuthorization(true, { authorizedAt: "2026-10-12T00:00:00.000Z" }).ok).toBe(true);
  });
});

describe("checkPermissionBoundaries (9.4)", () => {
  it("passes when every boundary holds", () => {
    const violations = checkPermissionBoundaries({
      responseBody: '{"login":"octocat"}',
      credentials: ["gho_secret"],
      scopesHeld: ["read:user"],
      wantsPrivateData: false,
      privateAuthorization: null,
    });
    expect(violations).toEqual([]);
  });

  it("reports every violated boundary at once", () => {
    const violations = checkPermissionBoundaries({
      responseBody: '{"token":"gho_secret"}',
      credentials: ["gho_secret"],
      scopesHeld: ["repo"],
      wantsPrivateData: true,
      privateAuthorization: null,
    });

    expect(violations.map((v) => v.boundary).sort()).toEqual(["credentials", "private_data", "scopes"]);
  });
});