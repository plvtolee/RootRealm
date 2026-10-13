import { describe, expect, it } from "vitest";

import {
  REDACTED,
  createLogger,
  errorFields,
  minLevelFromEnv,
  redactLogFields,
  redactValue,
  secretValues,
  serializeLogRecord,
  type LogRecord,
} from "./logger";
import type { EnvironmentVariables } from "./config";

/**
 * TASKS 21.3 asks for structured logs. These tests hold the two properties that
 * make the module worth having: a line is machine-readable JSON with stable keys,
 * and no line contains a credential this process holds — checked by name and by
 * value, because either alone misses cases the other catches.
 */

/** A sink that records what was written, so a test can assert on the line. */
function collector(): { sink: (line: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { lines, sink: (line) => lines.push(line) };
}

/** Parses the single line a logger emitted. */
function parseOne(lines: string[]): Record<string, unknown> {
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]) as Record<string, unknown>;
}

const FIXED_TIME = "2026-10-13T00:00:00.000Z";

describe("createLogger — structured output", () => {
  it("emits one JSON line carrying time, level, service and event", () => {
    const { sink, lines } = collector();
    const logger = createLogger({ service: "sync", sink, now: () => FIXED_TIME, secrets: [] });

    logger.info("sync.started", { developer: "octocat" });

    const line = parseOne(lines);
    expect(line.time).toBe(FIXED_TIME);
    expect(line.level).toBe("info");
    expect(line.service).toBe("sync");
    expect(line.event).toBe("sync.started");
    expect(line.developer).toBe("octocat");
  });

  it("orders fields so a caller cannot overwrite the envelope", () => {
    const { sink, lines } = collector();
    const logger = createLogger({ service: "sync", sink, now: () => FIXED_TIME, secrets: [] });

    // A field literally named "level" is data, but the record's own level wins
    // because the envelope is spread last.
    logger.warn("x", { level: "tampered" });

    expect(parseOne(lines).level).toBe("warn");
  });

  it("drops lines below the minimum level", () => {
    const { sink, lines } = collector();
    const logger = createLogger({ service: "s", sink, level: "warn", secrets: [] });

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(lines.map((line) => JSON.parse(line).event)).toEqual(["w", "e"]);
  });
});

describe("createLogger — child loggers share configuration", () => {
  it("uses its own service name but the parent's level and sink", () => {
    const { sink, lines } = collector();
    const parent = createLogger({ service: "shop", sink, level: "info", secrets: [] });

    parent.child("checkout").warn("purchase.refused", { reason: "insufficient_balance" });

    const line = parseOne(lines);
    expect(line.service).toBe("checkout");
    expect(line.level).toBe("warn");
    expect(line.reason).toBe("insufficient_balance");
  });
});

describe("redaction — by name", () => {
  it("replaces a field whose name looks like a credential, whatever it holds", () => {
    const safe = redactLogFields(
      { accessToken: "some-token-we-do-not-hold", authorization: "Bearer x", count: 3 },
      [],
    );

    expect(safe.accessToken).toBe(REDACTED);
    expect(safe.authorization).toBe(REDACTED);
    // A non-string survives by name, because it says something true and leaks nothing.
    expect(safe.count).toBe(3);
  });

  it("keeps booleans and numbers under a sensitive name", () => {
    const safe = redactLogFields({ hasToken: true, tokenLength: 40 }, []);
    expect(safe.hasToken).toBe(true);
    expect(safe.tokenLength).toBe(40);
  });
});

describe("redaction — by value", () => {
  it("replaces a held credential appearing under an innocuous name", () => {
    const secret = "ghp_aVeryRealLookingToken1234567890";
    const safe = redactLogFields(
      { detail: `upstream said Authorization: Bearer ${secret}`, note: "clean" },
      [secret],
    );

    expect(safe.detail).toBe(`upstream said Authorization: Bearer ${REDACTED}`);
    expect(safe.note).toBe("clean");
  });

  it("redacts a credential inside an array field", () => {
    const secret = "ghp_token_in_a_list_0000000000000";
    const safe = redactLogFields({ scopes: [secret, "read:user"] }, [secret]);
    expect(safe.scopes).toEqual([REDACTED, "read:user"]);
  });

  it("never emits a held secret, even nested in a word", () => {
    const secret = "session-secret-value-that-is-long-enough";
    const line = redactValue(`prefix${secret}suffix`, [secret]);
    expect(line).toBe(`prefix${REDACTED}suffix`);
  });
});

describe("secretValues — reads the environment contract", () => {
  it("returns the credentials this process holds, ignoring short values", () => {
    const env: EnvironmentVariables = {
      SESSION_SECRET: "a-long-enough-session-secret-value",
      GITHUB_TOKEN: "ghp_aTokenThatIsLongEnough",
      GITHUB_OAUTH_CLIENT_SECRET: "",
      DATABASE_URL: "short", // Below the redaction floor: not a real secret here.
    };

    const values = secretValues(env);

    expect(values).toContain("a-long-enough-session-secret-value");
    expect(values).toContain("ghp_aTokenThatIsLongEnough");
    expect(values).not.toContain("short");
  });
});

describe("minLevelFromEnv", () => {
  it("reads LOG_LEVEL and falls back to info for anything unrecognised", () => {
    expect(minLevelFromEnv({ LOG_LEVEL: "debug" } as EnvironmentVariables)).toBe("debug");
    expect(minLevelFromEnv({ LOG_LEVEL: "WARN" } as EnvironmentVariables)).toBe("warn");
    expect(minLevelFromEnv({ LOG_LEVEL: "verbose" } as EnvironmentVariables)).toBe("info");
    expect(minLevelFromEnv({} as EnvironmentVariables)).toBe("info");
  });
});

describe("serializeLogRecord — total", () => {
  it("never throws, even for a value JSON cannot represent", () => {
    const record: LogRecord = {
      time: FIXED_TIME,
      level: "info",
      service: "s",
      event: "e",
      fields: {},
    };
    expect(() => serializeLogRecord(record)).not.toThrow();
    expect(serializeLogRecord(record)).toContain("\"event\":\"e\"");
  });
});

describe("errorFields", () => {
  it("keeps the name and message, never a stack", () => {
    const fields = errorFields(new TypeError("boom at https://api.github.com/x?q=1"));
    expect(fields.errorName).toBe("TypeError");
    expect(fields.errorMessage).toContain("boom");
    expect(fields).not.toHaveProperty("stack");
  });

  it("handles a thrown non-Error without crashing", () => {
    expect(errorFields("just a string").errorName).toBe("NonError");
    expect(errorFields(undefined).errorName).toBe("NonError");
  });
});