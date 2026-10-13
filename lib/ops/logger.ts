/**
 * RootRealm — the structured logger (TASKS 21.3).
 *
 * ```text
 * one event → one line of JSON, with no secret in it
 * ```
 *
 * TASKS 21.3 asks for structured error logs, and every other monitoring item it
 * names — synchronization, rate-limit and transaction visibility — is the same
 * act: a place in the code where an event happens and a caller wants to find it
 * later. This module is that place, so the four items are four emitters over one
 * writer rather than four ad-hoc `console` calls that each format differently.
 *
 * ## Why JSON lines rather than a formatted string
 *
 * A line the code formats is a line only the code can read: `console.info` of a
 * template string can be grepped, but it cannot be filtered ("show me every
 * transaction that failed"), aggregated, or alerted on without parsing prose
 * that changes whenever someone edits a sentence. Emitting an object with stable
 * keys makes those operations the platform's job, and log aggregators already do
 * them. The trade is that this is less pleasant to read in a raw terminal, which
 * is why `formatEnvironmentReport` (TASKS 21.1) prints its human view separately.
 *
 * ## Why redaction is by value, not only by field name
 *
 * TASKS 19.1 established the rule: a credential must not leave the server. A log
 * line leaves the process — to stdout, to an aggregator, to whatever retention
 * policy that aggregator has — and a leak is a leak whether it left in a response
 * body or a log field. Two checks run, because either alone is insufficient:
 *
 * - **by name** — a field called `accessToken` is replaced whatever it holds, so
 *   a token we do not hold a copy of is still not printed;
 * - **by value** — any string containing a credential this process actually
 *   holds is replaced, so a token echoed under a name the first check does not
 *   predict (`detail`, `note`, `body`) is caught by the second.
 *
 * The second is the same mechanism `safeJson` uses, deliberately: one idea, "we
 * know our own secrets", applied at both exits from the process.
 *
 * ## Why it never throws
 *
 * A logger that can throw turns "we recorded what happened" into "we crashed
 * while recording what happened" — and it does so on the error path, which is the
 * moment the process can least afford a second failure. Serialisation is total
 * and a cyclic or unserialisable field is replaced rather than rejected.
 */

import { ENVIRONMENT_VARIABLES, type EnvironmentVariables } from "./config";

/** The severities, ordered. */
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** Numeric ranking, so a configured minimum is a comparison rather than a table. */
const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * A field value a log line may carry.
 *
 * Deliberately narrow: structured logging is only useful if the shapes are
 * predictable, so an arbitrary object is not accepted. A caller with a richer
 * value flattens it into named primitives, which is what makes the field
 * queryable instead of an opaque blob.
 */
export type LogValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly string[]
  | readonly number[];

export interface LogFields {
  readonly [key: string]: LogValue;
}

/** One emitted line, before it is serialised. */
export interface LogRecord {
  /** ISO-8601, the only timestamp format the rest of the project uses. */
  readonly time: string;
  readonly level: LogLevel;
  /** The subsystem, e.g. `sync` or `shop`, so lines group by area. */
  readonly service: string;
  /** A stable machine-readable event name, e.g. `sync.failed`. */
  readonly event: string;
  readonly fields: LogFields;
}

export type LogSink = (line: string) => void;

export interface Logger {
  readonly service: string;
  readonly minLevel: LogLevel;
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  /** Emits at an arbitrary level, for a caller that computes it. */
  log(level: LogLevel, event: string, fields?: LogFields): void;
  /** A logger for a nested area, sharing this one's level and sink. */
  child(service: string): Logger;
}

export interface CreateLoggerOptions {
  readonly service: string;
  /** The minimum level emitted. Defaults to `minLevelFromEnv()`. */
  readonly level?: LogLevel;
  /** Where lines go. Defaults to one JSON line on stdout. */
  readonly sink?: LogSink;
  /**
   * Credentials to redact by value. Defaults to the secrets this process holds,
   * read from the environment. Passed explicitly by tests.
   */
  readonly secrets?: readonly string[];
  /** Clock injection, so a test's line is deterministic. */
  readonly now?: () => string;
}

/**
 * The field names that always carry a secret, matched case-insensitively.
 *
 * This is a belt to the value-check's braces: it catches a token this process
 * does not hold and therefore cannot compare against — a caller inspecting a
 * different deployment's value, say.
 */
const SENSITIVE_KEY = /(secret|token|password|authorization|cookie|credential)/i;

/** The placeholder a redacted value becomes. */
export const REDACTED = "[redacted]";

/**
 * The minimum level, from `LOG_LEVEL`.
 *
 * An unrecognised value is ignored rather than fatal: a typo in an environment
 * variable must not stop a server from starting, and the safe default (`info`)
 * is also the useful one.
 */
export function minLevelFromEnv(env: EnvironmentVariables = process.env): LogLevel {
  const raw = env.LOG_LEVEL?.trim().toLowerCase();
  return (LOG_LEVELS as readonly string[]).includes(raw ?? "") ? (raw as LogLevel) : "info";
}

/**
 * The credential values this process holds, from the environment contract.
 *
 * Derived from `ENVIRONMENT_VARIABLES` (TASKS 21.1) rather than a second list, so
 * a variable marked secret in the deployment contract is redacted in the logs
 * without anyone remembering to add it in two places.
 */
/** The names of every variable the environment contract marks secret. */
const SECRET_VARIABLE_NAMES: readonly string[] = ENVIRONMENT_VARIABLES.filter(
  (variable) => variable.secret,
).map((variable) => variable.name);

export function secretValues(env: EnvironmentVariables = process.env): string[] {
  const values: string[] = [];
  for (const variable of SECRET_VARIABLE_NAMES) {
    const value = env[variable]?.trim();
    // Very short values are not redacted: replacing every occurrence of a
    // two-character string would mangle unrelated fields, and a two-character
    // "secret" is not one. The threshold matches the session-secret minimum.
    if (value && value.length >= 8) values.push(value);
  }
  return values;
}

/** Replaces every occurrence of any held secret in a string. */
export function redactValue(value: string, secrets: readonly string[]): string {
  let redacted = value;
  for (const secret of secrets) {
    if (secret.length === 0) continue;
    if (redacted.includes(secret)) redacted = redacted.split(secret).join(REDACTED);
  }
  return redacted;
}

/** Redacts one field value, handling arrays element-wise. */
function redactField(key: string, value: LogValue, secrets: readonly string[]): LogValue {
  if (value === null || value === undefined) return value;

  if (SENSITIVE_KEY.test(key)) {
    // A boolean or a count survives: `hasToken: true` says something true about
    // the system and leaks nothing, whereas the string behind it would.
    if (typeof value === "boolean" || typeof value === "number") return value;
    return REDACTED;
  }

  if (typeof value === "string") return redactValue(value, secrets);
  if (Array.isArray(value)) {
    return value.map((entry) =>
      typeof entry === "string" ? redactValue(entry, secrets) : entry,
    ) as readonly string[] | readonly number[];
  }
  return value;
}

/**
 * Redacts every field of a record.
 *
 * Exported so the rule can be asserted directly, and so a caller holding fields
 * before a logger does can apply the same treatment.
 */
export function redactLogFields(fields: LogFields, secrets: readonly string[]): LogFields {
  const safe: Record<string, LogValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    safe[key] = redactField(key, value, secrets);
  }
  return safe;
}

/**
 * Serialises a record to one line.
 *
 * Total: a value that `JSON.stringify` refuses (a bigint, a throwing getter)
 * cannot escape as an exception. The record's own fields are all primitives by
 * construction, so the only realistic failure is `undefined`, which JSON drops.
 */
export function serializeLogRecord(record: LogRecord): string {
  try {
    return JSON.stringify({
      // Fields first, envelope second: a caller supplying a field named `level`
      // or `time` must not be able to forge the record's own metadata.
      ...record.fields,
      time: record.time,
      level: record.level,
      service: record.service,
      event: record.event,
    });
  } catch {
    return JSON.stringify({
      time: record.time,
      level: "error",
      service: record.service,
      event: record.event,
      serializationError: true,
    });
  }
}

/** The default sink: one line on stdout, so a platform captures it as a stream. */
function stdoutSink(line: string): void {
  // `process.stdout` exists under Node and not in an edge runtime; a missing
  // sink is silence, never a throw.
  if (typeof process !== "undefined" && process.stdout?.write) {
    process.stdout.write(`${line}\n`);
  }
}

/**
 * Builds a logger.
 *
 * The secrets are resolved once, at creation, rather than per call: redaction
 * runs on every emitted line, and re-reading the environment for each would be a
 * per-line cost with no benefit.
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const sink = options.sink ?? stdoutSink;
  const now = options.now ?? (() => new Date().toISOString());
  const secrets = options.secrets ?? secretValues();
  const minLevel = options.level ?? minLevelFromEnv();
  const minRank = LEVEL_RANK[minLevel];

  function emit(level: LogLevel, event: string, fields: LogFields = {}): void {
    if (LEVEL_RANK[level] < minRank) return;

    const record: LogRecord = {
      time: now(),
      level,
      service: options.service,
      event,
      fields: redactLogFields(fields, secrets),
    };

    sink(serializeLogRecord(record));
  }

  const logger: Logger = {
    service: options.service,
    minLevel,
    debug: (event, fields) => emit("debug", event, fields),
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
    log: (level, event, fields) => emit(level, event, fields),
    child: (service) =>
      createLogger({ service, level: minLevel, sink, secrets, now }),
  };

  return logger;
}

/**
 * Turns a caught value into log fields.
 *
 * An `Error`'s `message` often embeds a URL, which for this project can carry a
 * query string — the redaction pass removes a token from it, but the shape stays
 * generic on purpose: `name` and `message`, never a stack. A stack trace names
 * source files and line numbers, which is noise in production and information an
 * operator does not need to act on the four failure reasons this project has.
 */
export function errorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  return { errorName: "NonError", errorMessage: String(error).slice(0, 500) };
}