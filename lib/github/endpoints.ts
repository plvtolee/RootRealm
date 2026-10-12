/**
 * RootRealm — GitHub endpoint resolution (TASKS 20.3–20.4).
 *
 * ```text
 * one place the GitHub hosts are decided, and production is not negotiable
 * ```
 *
 * ## Why this exists
 *
 * The hosts were hardcoded — `https://api.github.com` in `lib/github/client.ts`
 * and `https://github.com/login/oauth/*` in `lib/auth/oauth.ts`. That is exactly
 * right for production and it is what TASKS 9.4's boundary depends on, but it
 * makes the GitHub-backed journeys untestable end to end: the server's calls to
 * GitHub are not browser requests, so no browser test can intercept them, and a
 * Playwright run against the live API would spend a real rate-limit budget and
 * assert against data that changes under it.
 *
 * So the hosts are resolved here instead, from one environment variable. The
 * override lets TASKS 20.4 point the server at a local mock GitHub for a
 * self-contained journey. It is honored **only when `NODE_ENV !== "production"`**,
 * so a production build always talks to the real GitHub no matter what the
 * environment says — the same gating `/api/dev/session` uses, for the same
 * reason: a test seam must not be reachable in the product.
 *
 * ## What did not change
 *
 * The default is unchanged and is still literal: with no override, the hosts are
 * the real ones. Every existing test that builds a URL keeps passing because the
 * value it gets is byte-identical to the previous constant.
 */
import { assertServerOnly } from "./server-only";

/** The real GitHub REST API. */
export const GITHUB_API_DEFAULT = "https://api.github.com";

/** The real GitHub web host, which serves the OAuth endpoints. */
export const GITHUB_OAUTH_DEFAULT = "https://github.com";

/**
 * Reads an override, or returns null.
 *
 * Trimmed, and a trailing slash is removed so `${base}/users/x` never becomes
 * `//users/x`. Refused outright in production rather than merely unset, so the
 * decision is explicit and a stray variable in a production environment cannot
 * redirect authenticated GitHub traffic.
 */
function override(env: NodeJS.ProcessEnv, name: string): string | null {
  if (env.NODE_ENV === "production") return null;

  const value = env[name]?.trim();
  if (!value) return null;

  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * The base for GitHub REST API calls (`/users/...`, `/repos/...`).
 *
 * Replaces the hardcoded `API_BASE` in `lib/github/client.ts`. Also the base the
 * `Link` header check compares against, so pagination stays pinned to the same
 * host the requests went to — a mock serving page 2 on a different host is
 * still ignored, which is the behaviour TASK 4.4's `nextPageUrl` test pins.
 */
export function gitHubApiBase(env: NodeJS.ProcessEnv = process.env): string {
  assertServerOnly("gitHubApiBase");
  return override(env, "GITHUB_API_BASE") ?? GITHUB_API_DEFAULT;
}

/**
 * The base for the OAuth endpoints (`/login/oauth/authorize`,
 * `/login/oauth/access_token`) and the identity read (`/user`).
 */
export function gitHubOAuthBase(env: NodeJS.ProcessEnv = process.env): string {
  assertServerOnly("gitHubOAuthBase");
  return override(env, "GITHUB_OAUTH_BASE") ?? GITHUB_OAUTH_DEFAULT;
}

/** Whether an override is in force, so a caller can refuse to combine it with a token. */
export function isGitHubBaseOverridden(env: NodeJS.ProcessEnv = process.env): boolean {
  assertServerOnly("isGitHubBaseOverridden");
  return override(env, "GITHUB_API_BASE") !== null || override(env, "GITHUB_OAUTH_BASE") !== null;
}