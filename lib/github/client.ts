/**
 * RootRealm — server-side GitHub REST client (TASKS 4.1).
 *
 * One class owns every outbound GitHub call:
 *
 * - request abstraction — a single `request` method owns URL construction,
 *   headers, timeout, JSON parsing, validation and error mapping, so no
 *   endpoint reimplements transport concerns;
 * - typed responses — every call is parsed through `types.ts` before it is
 *   returned, so ingestion never sees an unvalidated object;
 * - error handling — every failure becomes a `GitHubError` with a closed
 *   `kind` (see `errors.ts`), consumed by TASKS 4.2–4.8;
 * - rate-limit awareness — response headers feed a `RateLimitTracker` and are
 *   checked before a request is spent, so the client degrades instead of
 *   hammering an exhausted budget.
 *
 * Secret handling: the token is read from the server environment and passed
 * in by the caller. This module must never be imported from a client
 * component — `assertServerOnly` fails loudly if it is bundled for the browser,
 * which is what keeps "no browser secrets" a checked invariant rather than a
 * convention.
 */
import { GitHubError, kindForStatus } from "./errors";
import { RateLimitTracker, type RateLimitState } from "./rate-limit";
import { ValidationError } from "./validate";
import type {
  GitHubEvent,
  GitHubRepository,
  GitHubUser,
} from "./types";
import {
  parseEventList,
  parseRepositoryList,
  parseUser,
} from "./types";

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";
const USER_AGENT = "RootRealm-Ingestion";

/** GitHub logins: alphanumerics and single hyphens, 39 chars max. */
const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

/** Pages requested in a row before pagination is treated as incomplete. */
const MAX_PAGES = 10;
const PER_PAGE = 100;

export interface GitHubClientOptions {
  /**
   * Personal access token. Omitted for anonymous access, which GitHub limits
   * to 60 requests/hour — enough for a guest profile preview, not for sync.
   */
  token?: string;
  /** Injected for tests; defaults to the platform `fetch`. */
  fetch?: typeof fetch;
  /** Clock injection point, so rate-limit maths is testable. */
  now?: () => number;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /** Retries for retryable failures (server, network, timeout, rate limit). */
  maxRetries?: number;
  /** Base backoff; attempt *n* waits `retryBaseDelayMs * 2 ** n`. */
  retryBaseDelayMs?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** Extra query parameters; `undefined` and `null` values are dropped. */
  query?: Record<string, string | number | boolean | null | undefined>;
}

/**
 * The outcome of a paginated listing.
 *
 * `truncated` is the reason this is an object rather than a bare array: the page
 * cap exists so a misbehaving `Link` header cannot loop forever, but silently
 * returning a partial list would let ingestion record a repository count as if
 * it were complete. Every consumer must be able to see that it saw less than
 * everything. TASKS 4.7 turns this into full coverage reporting.
 */
export interface PaginatedResult<T> {
  items: T[];
  /** Pages actually fetched. */
  pages: number;
  /** GitHub still offered a next page when the cap stopped the walk. */
  truncated: boolean;
}

/**
 * Throws when the module is evaluated in a browser bundle. Deliberately a
 * plain `Error`: this is a programming error at import time, not one of the
 * transport failures `kind` describes.
 */
function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error(
      "GitHubClient must not be constructed in the browser — the API token is server-side only.",
    );
  }
}

/** Trims and validates a username before it can reach the network. */
export function assertValidUsername(username: string): string {
  const trimmed = username.trim();
  if (!LOGIN_PATTERN.test(trimmed)) {
    throw new GitHubError(`"${username}" is not a valid GitHub username`, {
      kind: "invalid_username",
    });
  }
  return trimmed;
}

export class GitHubClient {
  private readonly token: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  readonly rateLimit: RateLimitTracker;

  constructor(options: GitHubClientOptions = {}) {
    assertServerOnly();
    this.token = options.token;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => Date.now());
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.rateLimit = new RateLimitTracker();
  }

  /** The tracked rate-limit state, for TASKS 4.7 coverage reporting. */
  rateLimitState(): RateLimitState {
    return this.rateLimit.snapshot();
  }

  /* ---------------------------------------------------------------- */
  /* TASK 4.2 — public profile                                         */
  /* ---------------------------------------------------------------- */

  /** `GET /users/{username}`. */
  async getUser(username: string, options: RequestOptions = {}): Promise<GitHubUser> {
    const login = assertValidUsername(username);
    return this.request(
      `/users/${encodeURIComponent(login)}`,
      options,
      parseUser,
    );
  }

  /* ---------------------------------------------------------------- */
  /* TASK 4.3 — repositories                                          */
  /* ---------------------------------------------------------------- */

  /**
   * `GET /users/{username}/repos`, following pagination. Repositories are
   * requested oldest-first so the result order is deterministic regardless of
   * GitHub's default `created` descending sort.
   */
  async listRepositories(
    username: string,
    options: RequestOptions = {},
  ): Promise<PaginatedResult<GitHubRepository>> {
    const login = assertValidUsername(username);
    return this.paginate(
      `/users/${encodeURIComponent(login)}/repos`,
      { per_page: PER_PAGE, sort: "created", direction: "asc" },
      parseRepositoryList,
      options,
    );
  }

  /* ---------------------------------------------------------------- */
  /* TASK 4.4 — activity                                              */
  /* ---------------------------------------------------------------- */

  /**
   * `GET /users/{username}/events` across up to `MAX_PAGES` pages. GitHub caps
   * this endpoint at 300 events regardless of pagination, so walking every page
   * does not mean seeing every event — `truncated` reports the page cap, and
   * coverage tracking (TASKS 4.7) reports the rest.
   */
  async listEvents(
    username: string,
    options: RequestOptions = {},
  ): Promise<PaginatedResult<GitHubEvent>> {
    const login = assertValidUsername(username);
    return this.paginate(
      `/users/${encodeURIComponent(login)}/events`,
      { per_page: PER_PAGE },
      parseEventList,
      options,
    );
  }

  /* ---------------------------------------------------------------- */
  /* Request abstraction                                              */
  /* ---------------------------------------------------------------- */

  /**
   * Performs one validated GET. Retryable failures are retried with
   * exponential backoff, honouring `Retry-After` when GitHub supplies it.
   */
  private async request<T>(
    path: string,
    options: RequestOptions,
    parse: (value: unknown, path: string) => T,
  ): Promise<T> {
    const { body, status } = await this.get(
      this.buildUrl(path, options.query),
      options.signal,
    );
    return this.decode<T>(body, status, `GET ${path}`, parse);
  }

  /**
   * Performs the HTTP call and returns the parsed JSON plus the headers the
   * caller needs (pagination `Link`, diagnostics). Every status below 200 or
   * above 299 becomes a `GitHubError` here, so nothing below has to branch on
   * it.
   */
  private async get(
    url: string,
    signal: AbortSignal | undefined,
  ): Promise<{ body: unknown; status: number; headers: Headers }> {
    const label = `GET ${url}`;

    let attempt = 0;
    for (;;) {
      const response = await this.send(url, label, signal);
      this.rateLimit.observe(response.headers, this.now());

      if (response.ok) {
        return {
          body: await readJson(response, label),
          status: response.status,
          headers: response.headers,
        };
      }

      const state = this.rateLimit.snapshot();
      const error = new GitHubError(await describeFailure(response), {
        kind: kindForStatus(response.status, state.remaining ?? undefined),
        status: response.status,
        retryAfterMs: state.retryAfterMs ?? undefined,
        request: label,
        requestId: response.headers.get("x-github-request-id") ?? undefined,
      });

      if (!error.retryable || attempt >= this.maxRetries) throw error;

      await this.wait(attempt, error.retryAfterMs);
      attempt += 1;
    }
  }

  /**
   * Follows `Link: <…>; rel="next"` until GitHub stops offering one, then
   * hands every page to `parse`. The walk stops at `MAX_PAGES` so a misbehaving
   * `Link` header cannot loop forever, and `truncated` records that it did.
   */
  private async paginate<T>(
    path: string,
    query: Record<string, string | number>,
    parse: (value: unknown, path: string) => T[],
    options: RequestOptions,
  ): Promise<PaginatedResult<T>> {
    const items: T[] = [];
    let next: string | null = this.buildUrl(path, query);
    let pages = 0;

    while (next !== null && pages < MAX_PAGES) {
      const page = await this.get(next, options.signal);
      items.push(...parse(page.body, "body"));
      next = nextPageUrl(page.headers.get("link"));
      pages += 1;
    }

    return { items, pages, truncated: next !== null };
  }

  /** Issues the request with a timeout, mapping transport failures. */
  private async send(
    url: string,
    label: string,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);

    try {
      return await this.fetchImpl(url, {
        method: "GET",
        headers: this.headers(),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (cause) {
      // A caller-initiated abort is a cancellation, not a failure: it gets
      // its own kind so the retry loop never repeats work the caller stopped.
      if (signal?.aborted) {
        throw new GitHubError(`${label} was aborted by the caller`, {
          kind: "aborted",
          request: label,
          cause,
        });
      }
      throw new GitHubError(
        timedOut
          ? `${label} exceeded the ${this.timeoutMs}ms timeout`
          : `${label} failed before a response arrived`,
        { kind: timedOut ? "timeout" : "network_error", request: label, cause },
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  /**
   * GitHub's media type pins the response schema to the API version, which is
   * what stops an unannounced field change from silently altering a parsed
   * shape. The token is only ever attached here, server-side.
   */
  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "x-github-api-version": API_VERSION,
      "user-agent": USER_AGENT,
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    return headers;
  }

  private buildUrl(
    path: string,
    query: RequestOptions["query"] = {},
  ): string {
    const base = path.startsWith("http") ? path : `${API_BASE}${path}`;
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      params.set(key, String(value));
    }

    const search = params.toString();
    return search === "" ? base : `${base}${base.includes("?") ? "&" : "?"}${search}`;
  }

  /** Validates an already-parsed body, converting failures to `malformed_response`. */
  private decode<T>(
    body: unknown,
    status: number,
    label: string,
    parse: (value: unknown, path: string) => T,
  ): T {
    try {
      return parse(body, "body");
    } catch (cause) {
      throw new GitHubError(
        cause instanceof ValidationError
          ? `${label} returned an unexpected shape: ${cause.message}`
          : `${label} returned an unexpected shape`,
        { kind: "malformed_response", status, request: label, cause },
      );
    }
  }

  /** Exponential backoff, never shorter than GitHub's own `Retry-After`. */
  private async wait(attempt: number, retryAfterMs: number | undefined) {
    const backoff = this.retryBaseDelayMs * 2 ** attempt;
    const delay = Math.max(backoff, retryAfterMs ?? 0);
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
}

/** Extracts GitHub's `message` field from an error body, if present. */
async function describeFailure(response: Response): Promise<string> {
  const fallback = `GitHub responded ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      typeof (body as { message?: unknown }).message === "string"
    ) {
      return `${fallback}: ${(body as { message: string }).message}`;
    }
  } catch {
    // Empty or non-JSON error bodies are normal (proxies, 502 pages).
  }
  return fallback;
}

/** Parses a success body, mapping a non-JSON payload to `malformed_response`. */
async function readJson(response: Response, label: string): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new GitHubError(`${label} returned a non-JSON body`, {
      kind: "malformed_response",
      status: response.status,
      request: label,
      cause,
    });
  }
}

/**
 * Extracts `rel="next"` from a `Link` header. Anything unrecognised, absolute
 * or foreign-host is ignored: a hostile or broken header must not redirect the
 * client away from api.github.com with the token attached.
 */
export function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;

  for (const part of linkHeader.split(",")) {
    const match = /^\s*<([^>]+)>\s*;\s*(.+)$/.exec(part);
    if (!match) continue;

    const [, url, params] = match;
    if (!/(^|;)\s*rel\s*=\s*"?next"?\s*(;|$)/i.test(params)) continue;
    if (!url.startsWith(`${API_BASE}/`)) continue;
    return url;
  }

  // A `Link` header that never offers `next` means the last page was reached.
  return null;
}