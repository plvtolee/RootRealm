/**
 * RootRealm — auth configuration (TASKS 9.1).
 *
 * The OAuth credentials and the session secret, read from the server
 * environment in one place. Every value here is server-only: the client id is
 * public in the OAuth protocol, but the client secret and the session secret
 * must never reach the browser, and reading them here rather than at each call
 * site means there is one module to check.
 */

import { assertServerOnly } from "../github/server-only";

export interface AuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly sessionSecret: string;
  /** The absolute callback URL registered with the GitHub OAuth app. */
  readonly redirectUri: string;
  readonly isProduction: boolean;
}

/**
 * Reads the auth configuration, or returns null when it is incomplete.
 *
 * Returns null rather than throwing so the login route can render a
 * configuration error instead of crashing the whole server: an unconfigured
 * deployment should say "OAuth is not configured", not fail every request.
 */
export function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig | null {
  assertServerOnly("readAuthConfig");

  const clientId = env.GITHUB_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET?.trim();
  const sessionSecret = env.SESSION_SECRET?.trim();
  const redirectUri = env.GITHUB_OAUTH_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !sessionSecret || !redirectUri) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    sessionSecret,
    redirectUri,
    isProduction: env.NODE_ENV === "production",
  };
}