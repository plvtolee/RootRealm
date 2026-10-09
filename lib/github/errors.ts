/**
 * RootRealm — GitHub transport error taxonomy (TASKS 4.1, 4.8).
 *
 * Every failure the client can produce is one of these kinds. The mapping is
 * deliberately closed: ingestion (TASKS 4.2–4.8) and the later scoring phase
 * branch on `kind`, never on a raw HTTP status, so a change in GitHub's
 * behaviour cannot silently alter product behaviour.
 *
 * `retryable` records whether re-issuing the same request could plausibly
 * succeed without changing anything else. It is a property of the failure, not
 * of the caller's retry policy.
 */
export type GitHubErrorKind =
  /** The username failed the client-side format check; no request was sent. */
  | "invalid_username"
  /** GitHub returned 404 — unknown, renamed or deleted account. */
  | "not_found"
  /** Primary or secondary rate limit reached. */
  | "rate_limited"
  /** 403 for a reason other than rate limiting (e.g. blocked by abuse rules). */
  | "forbidden"
  /** 401 — a token was supplied but GitHub rejected it. */
  | "unauthorized"
  /** 5xx from GitHub. */
  | "server_error"
  /** The request never completed: DNS, TLS, connection reset. */
  | "network_error"
  /** The caller's own `AbortSignal` fired — a cancellation, not a failure. */
  | "aborted"
  /** The request exceeded the client timeout. */
  | "timeout"
  /** The response body was not JSON, or failed schema validation. */
  | "malformed_response";

export interface GitHubErrorInit {
  kind: GitHubErrorKind;
  /** HTTP status, absent for transport-level failures. */
  status?: number;
  /** Milliseconds GitHub asked us to wait, from `Retry-After` or the reset. */
  retryAfterMs?: number;
  /** Requested method + path, for server-side logs only. */
  request?: string;
  /** GitHub's `x-github-request-id`, when present. */
  requestId?: string;
  /** GitHub's `message` field, when the body carried one. */
  detail?: string;
  cause?: unknown;
}

/** Kinds for which an identical retry is meaningful. */
const RETRYABLE: ReadonlySet<GitHubErrorKind> = new Set<GitHubErrorKind>([
  "server_error",
  "network_error",
  "timeout",
  "rate_limited",
]);

export class GitHubError extends Error {
  readonly kind: GitHubErrorKind;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;
  readonly request: string | undefined;
  readonly requestId: string | undefined;
  readonly detail: string | undefined;
  readonly retryable: boolean;

  constructor(message: string, init: GitHubErrorInit) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "GitHubError";
    this.kind = init.kind;
    this.status = init.status;
    this.retryAfterMs = init.retryAfterMs;
    this.request = init.request;
    this.requestId = init.requestId;
    this.detail = init.detail;
    this.retryable = RETRYABLE.has(init.kind);
  }
}

/** Narrowing helper for callers that catch broadly. */
export function isGitHubError(value: unknown): value is GitHubError {
  return value instanceof GitHubError;
}

/**
 * Maps an HTTP status to a failure kind. `remaining`/`retryAfterMs` carry the
 * rate-limit context, because GitHub reports a primary limit as a 403 that is
 * only distinguishable from an abuse block by its remaining budget.
 */
export function kindForStatus(
  status: number,
  remaining: number | undefined,
): GitHubErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return remaining === 0 ? "rate_limited" : "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "forbidden";
}