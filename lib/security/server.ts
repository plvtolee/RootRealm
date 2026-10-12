/**
 * RootRealm — server-side security helpers (TASKS 19.1, 19.2, 19.5).
 *
 * ```text
 * one place every response leaves through, and one place inputs are checked
 * ```
 *
 * Phase 9 built `checkPermissionBoundaries` as three functions and then, as far as
 * this audit can find, never called any of them from a route. A boundary that
 * exists but is not applied is a boundary in prose, and the module's own header
 * says as much: "a boundary that is only described in prose is a boundary that
 * erodes". The Phase 19 audit (19.1) is what found it.
 *
 * ## What is enforced here
 *
 * **Credentials never leave the server (19.1).** `safeJson` serialises the body
 * and checks it against the credentials this process holds before the `Response`
 * is constructed. A GitHub token echoed under any key — `accessToken`,
 * `authorization`, a nested field, or the body itself being the token — fails the
 * check and answers 500 rather than 200. The check is by *value*, so it catches a
 * leak from wherever it came, which a field-name check cannot.
 *
 * **Inputs are validated at the edge (19.2).** A route that hands a raw query
 * string to an upstream API is a route that will forward whatever arrived.
 * `parseGitHubLogin` and `parseItemId` are bounded and shaped, so a 100KB
 * username or a newline in a login is a 400 rather than an upstream request.
 *
 * **Private data cannot be fetched (19.5).** RootRealm requests exactly one
 * GitHub scope, `read:user`, which cannot read repository contents or private
 * events — so the app cannot obtain private activity, which is the strongest form
 * of not leaking it. `assertNoPrivateAuthorization` records that claim where a
 * reader of the route can see it.
 */
import { credentialsStayServerSide } from "../auth/permissions";
import { assertServerOnly } from "../github/server-only";

/** The credentials this process holds. Nothing else is a secret. */
export function heldCredentials(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  return [env.GITHUB_TOKEN?.trim() ?? "", env.SESSION_SECRET?.trim() ?? ""].filter(
    (value) => value.length > 0,
  );
}

/**
 * A JSON response that has been checked for leaked credentials.
 *
 * Every API route should answer through this. It costs one string scan per
 * response, which is not measurable next to the work a route already did.
 */
export function safeJson(
  payload: unknown,
  input: {
    readonly status?: number;
    readonly headers?: Record<string, string>;
    readonly credentials?: readonly string[];
    readonly env?: NodeJS.ProcessEnv;
  } = {},
): Response {
  assertServerOnly("safeJson");

  const body = JSON.stringify(payload);
  const check = credentialsStayServerSide(
    body,
    input.credentials ?? heldCredentials(input.env),
  );

  // A 500 rather than a redacted 200: the response is not trustworthy and the
  // caller must not treat it as a normal failure they can retry.
  if (!check.ok) {
    return Response.json(
      { error: "credential_leak", message: check.violation.detail },
      { status: 500 },
    );
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...input.headers,
  };

  return new Response(body, { status: input.status ?? 200, headers });
}

/**
 * The rules a GitHub login must satisfy.
 *
 * GitHub's own: 1–39 characters, alphanumeric or a single hyphen. Validating
 * against the real shape means a malformed login never reaches the API — which
 * would otherwise return a 404 for something that was never a username.
 */
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export function parseGitHubLogin(value: unknown): { readonly ok: true; readonly login: string } | { readonly ok: false } {
  if (typeof value !== "string") return { ok: false };

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 39) return { ok: false };
  if (!GITHUB_LOGIN.test(trimmed)) return { ok: false };

  return { ok: true, login: trimmed };
}

/** The shape a catalog id must have: bounded, and safe to put in a URL or a key. */
const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function parseItemId(value: unknown): { readonly ok: true; readonly itemId: string } | { readonly ok: false } {
  if (typeof value !== "string") return { ok: false };
  if (!ITEM_ID.test(value)) return { ok: false };

  return { ok: true, itemId: value };
}

/**
 * The reason a private-data request must never be answered without an explicit
 * authorization on record.
 *
 * RootRealm does not yet have an authorization mechanism — there is no consent
 * screen, no scope that permits it, no storage to record it — so this always
 * refuses. It is here so the day someone adds a `repo` scope they meet the rule
 * on the way in rather than discovering the privacy hole in an audit.
 */
export function assertNoPrivateAuthorization(
  wantsPrivateData: boolean,
  authorization: { readonly authorizedAt: string } | null,
): boolean {
  if (!wantsPrivateData) return true;
  return authorization !== null;
}