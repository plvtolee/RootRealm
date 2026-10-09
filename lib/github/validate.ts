/**
 * RootRealm — minimal runtime validators for GitHub payloads (TASKS 4.1,
 * 4.2). The client treats GitHub's JSON as untrusted input, so every response
 * passes through one of these before it can reach ingestion.
 *
 * These are hand-written rather than schema-library driven to keep Phase 4
 * dependency-free; they cover the fields RootRealm actually reads and ignore
 * the rest, which is the point — an added GitHub field must not break us.
 */

/** Raised by a validator; the client converts it into `malformed_response`. */
export class ValidationError extends Error {
  readonly path: string;

  constructor(path: string, expected: string) {
    super(`Expected ${expected} at "${path}"`);
    this.name = "ValidationError";
    this.path = path;
  }
}

/** A parsed object with an optional subset of typed fields. */
export type Shape = Record<string, unknown>;

function isRecord(value: unknown): value is Shape {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ValidatorOptions {
  /** When true, a missing field fails validation instead of yielding null. */
  required?: boolean;
}

export function str(
  shape: Shape,
  key: string,
  path: string,
  options: ValidatorOptions = {},
): string | null {
  const value = shape[key];
  if (value === undefined || value === null) {
    if (options.required) throw new ValidationError(`${path}.${key}`, "a string");
    return null;
  }
  if (typeof value !== "string") {
    throw new ValidationError(`${path}.${key}`, "a string");
  }
  return value;
}

export function num(
  shape: Shape,
  key: string,
  path: string,
  options: ValidatorOptions = {},
): number | null {
  const value = shape[key];
  if (value === undefined || value === null) {
    if (options.required) throw new ValidationError(`${path}.${key}`, "a number");
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${path}.${key}`, "a number");
  }
  return value;
}

export function bool(
  shape: Shape,
  key: string,
  path: string,
  options: ValidatorOptions = {},
): boolean | null {
  const value = shape[key];
  if (value === undefined || value === null) {
    if (options.required) {
      throw new ValidationError(`${path}.${key}`, "a boolean");
    }
    return null;
  }
  if (typeof value !== "boolean") {
    throw new ValidationError(`${path}.${key}`, "a boolean");
  }
  return value;
}

/** An ISO-8601 timestamp string, preserved verbatim from GitHub. */
export function timestamp(
  shape: Shape,
  key: string,
  path: string,
  options: ValidatorOptions = {},
): string | null {
  const value = str(shape, key, path, options);
  if (value === null) return null;
  if (Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${path}.${key}`, "an ISO-8601 timestamp");
  }
  return value;
}

export function obj(
  value: unknown,
  path: string,
): Shape {
  if (!isRecord(value)) throw new ValidationError(path, "an object");
  return value;
}

export function arr(
  value: unknown,
  path: string,
): unknown[] {
  if (!Array.isArray(value)) throw new ValidationError(path, "an array");
  return value;
}

export { isRecord };