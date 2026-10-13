import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ENVIRONMENT_VARIABLES,
  MIN_SESSION_SECRET_LENGTH,
  OAUTH_VARIABLES,
  formatEnvironmentReport,
  validateEnvironment,
  type EnvironmentVariables,
} from "./config";

/**
 * TASKS 21.1 asks to configure the production environment and 21.2 to validate
 * it. These tests hold the validator to the rules the module states: the session
 * secret is fatal when missing or too short, the OAuth cluster is all-or-nothing,
 * and the optionals are reported without being treated as failures. The last
 * test reads `.env.example` and asserts the contract and the deploy instructions
 * still name the same variables — the drift a hand-maintained list always grows.
 */

const SECRET = "a".repeat(MIN_SESSION_SECRET_LENGTH);

/** A complete production environment, before a test removes one piece. */
const COMPLETE: EnvironmentVariables = {
  NODE_ENV: "production",
  SESSION_SECRET: SECRET,
  GITHUB_OAUTH_CLIENT_ID: "client-id",
  GITHUB_OAUTH_CLIENT_SECRET: "client-secret",
  GITHUB_OAUTH_REDIRECT_URI: "https://rootrealm.example/api/auth/github/callback",
  GITHUB_TOKEN: "ghp_example",
  DATABASE_URL: "postgres://user:pass@host:5432/db",
};

function errors(env: EnvironmentVariables): string[] {
  return validateEnvironment(env).findings
    .filter((finding) => finding.severity === "error")
    .map((finding) => finding.variable);
}

describe("validateEnvironment — a complete environment", () => {
  it("is ready with nothing to report as an error", () => {
    const report = validateEnvironment(COMPLETE);

    expect(report.ok).toBe(true);
    expect(errors(COMPLETE)).toEqual([]);
    expect(report.production).toBe(true);
    expect(report.missing).toEqual([]);
  });

  it("lists what was configured, by name", () => {
    const report = validateEnvironment(COMPLETE);
    expect(report.configured).toContain("SESSION_SECRET");
    expect(report.configured).toContain("DATABASE_URL");
  });
});

describe("validateEnvironment — the session secret", () => {
  it("is fatal when absent", () => {
    const env = { ...COMPLETE, SESSION_SECRET: "" };
    expect(validateEnvironment(env).ok).toBe(false);
    expect(errors(env)).toContain("SESSION_SECRET");
  });

  it("is fatal when present but too short to be a signing key", () => {
    const env = { ...COMPLETE, SESSION_SECRET: "short" };
    expect(validateEnvironment(env).ok).toBe(false);
    expect(errors(env)).toContain("SESSION_SECRET");
  });

  it("names the variable but never repeats its value", () => {
    const env = { ...COMPLETE, SESSION_SECRET: "leaky-value" };
    const rendered = formatEnvironmentReport(validateEnvironment(env)).join("\n");

    expect(rendered).toContain("SESSION_SECRET");
    expect(rendered).not.toContain("leaky-value");
  });
});

describe("validateEnvironment — the OAuth cluster is all-or-nothing", () => {
  it("is fatal when the cluster is half configured, naming each absent member", () => {
    const env = { ...COMPLETE, GITHUB_OAUTH_CLIENT_SECRET: "", GITHUB_OAUTH_REDIRECT_URI: "" };
    const report = validateEnvironment(env);

    expect(report.ok).toBe(false);
    expect(report.missing).toContain("GITHUB_OAUTH_CLIENT_SECRET");
    expect(report.missing).toContain("GITHUB_OAUTH_REDIRECT_URI");
    // The member that *is* present is not reported as missing.
    expect(report.missing).not.toContain("GITHUB_OAUTH_CLIENT_ID");
  });

  it("is not fatal when login is simply not configured at all", () => {
    const env: EnvironmentVariables = { NODE_ENV: "production", SESSION_SECRET: SECRET };
    const report = validateEnvironment(env);

    expect(report.ok).toBe(true);
    expect(report.findings.some((finding) => finding.message.includes("not configured"))).toBe(true);
  });

  it("treats every OAuth variable as one of the cluster", () => {
    expect(OAUTH_VARIABLES).toEqual([
      "GITHUB_OAUTH_CLIENT_ID",
      "GITHUB_OAUTH_CLIENT_SECRET",
      "GITHUB_OAUTH_REDIRECT_URI",
    ]);
  });
});

describe("validateEnvironment — optionals are reported, not fatal", () => {
  it("does not fail without an ingestion token", () => {
    const env = { ...COMPLETE, GITHUB_TOKEN: "" };
    const report = validateEnvironment(env);

    expect(report.ok).toBe(true);
    expect(report.findings.some((finding) => finding.variable === "GITHUB_TOKEN")).toBe(true);
  });

  it("warns about the in-memory store in production without failing", () => {
    const env = { ...COMPLETE, DATABASE_URL: "" };
    const report = validateEnvironment(env);

    expect(report.ok).toBe(true);
    const finding = report.findings.find((entry) => entry.variable === "DATABASE_URL");
    expect(finding?.severity).toBe("warning");
  });

  it("does not warn about the database in development", () => {
    const env = { ...COMPLETE, NODE_ENV: "development", DATABASE_URL: "" };
    const finding = validateEnvironment(env).findings.find(
      (entry) => entry.variable === "DATABASE_URL",
    );
    expect(finding?.severity).toBe("info");
  });
});

describe("validateEnvironment — production hazards", () => {
  it("warns when the callback still points at localhost", () => {
    const env = { ...COMPLETE, GITHUB_OAUTH_REDIRECT_URI: "http://localhost:3000/api/auth/github/callback" };
    const report = validateEnvironment(env);

    expect(report.ok).toBe(true);
    expect(
      report.findings.some(
        (finding) =>
          finding.variable === "GITHUB_OAUTH_REDIRECT_URI" && finding.severity === "warning",
      ),
    ).toBe(true);
  });

  it("takes production as an input, not from the ambient process", () => {
    const env = { NODE_ENV: "development", SESSION_SECRET: SECRET };
    expect(validateEnvironment(env, { production: true }).production).toBe(true);
    expect(validateEnvironment(env).production).toBe(false);
  });
});

describe("formatEnvironmentReport", () => {
  it("says READY or NOT READY and lists the missing names", () => {
    const good = formatEnvironmentReport(validateEnvironment(COMPLETE)).join("\n");
    expect(good).toContain("READY");
    expect(good).not.toContain("NOT READY");

    const bad = formatEnvironmentReport(
      validateEnvironment({ NODE_ENV: "production" }),
    ).join("\n");
    expect(bad).toContain("NOT READY");
    expect(bad).toContain("SESSION_SECRET");
  });
});

describe("the environment contract and the deploy instructions agree", () => {
  it("names exactly the variables `.env.example` documents", () => {
    const example = readFileSync(fileURLToPath(new URL("../../.env.example", import.meta.url)), "utf8");
    const documented = [...example.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((match) => match[1]);

    const contracted = ENVIRONMENT_VARIABLES.map((variable) => variable.name).sort();

    // Every contracted variable is documented, and the example documents nothing
    // the code does not read.
    expect([...documented].sort()).toEqual(contracted);
  });

  it("marks every credential-like variable as secret so logs redact it", () => {
    const secrets = ENVIRONMENT_VARIABLES.filter((variable) => variable.secret).map((v) => v.name);
    expect(secrets).toContain("SESSION_SECRET");
    expect(secrets).toContain("GITHUB_OAUTH_CLIENT_SECRET");
    expect(secrets).toContain("GITHUB_TOKEN");
  });
});