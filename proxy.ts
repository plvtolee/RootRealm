import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * RootRealm — Content Security Policy (the V1 audit's first finding).
 *
 * ```text
 * every response → a policy the browser enforces, not one the code merely respects
 * ```
 *
 * ## Why a nonce at all
 *
 * The obvious policy is `script-src 'self' 'unsafe-inline'`, and it is close to
 * worthless: `'unsafe-inline'` is exactly the thing that lets an injected
 * `<script>` run, so the directive documents an XSS hole rather than closing one.
 * A nonce lets this app say `script-src 'self' 'nonce-…'` and mean it — inline
 * scripts Next.js needs are allowed, an attacker's are not, because they cannot
 * guess a value regenerated on every request.
 *
 * The policy is set on the *request* headers as well as the response, because
 * Next.js reads the nonce out of it and applies it to the scripts it injects.
 *
 * ## The cost, stated plainly
 *
 * **A nonce requires dynamic rendering.** Next.js can only generate one per
 * request, so it cannot prerender a page and then bake a nonce into it. This
 * `proxy.ts` is therefore what moved RootRealm's routes from static to dynamic.
 * That was measured, not assumed — see `docs/V1_AUDIT.md` and the commit message.
 *
 * ## Two directives that are looser than they look, and why
 *
 * **`style-src` allows `'unsafe-inline'`.** A nonce cannot be applied to a
 * `style` *attribute*, and the skill tree's map positions every node with
 * `style={{ left, top }}` so the 44px hit targets track the hexagons at any zoom.
 * Removing those attributes to satisfy the policy would mean positioning 36 nodes
 * by a different mechanism entirely, and inline styles are not a meaningful XSS
 * vector in modern browsers — the risk is CSS exfiltration, not script execution.
 * Scripts, which can, are nonce-locked.
 *
 * **`upgrade-insecure-requests` is development-only.** It rewrites every
 * subresource URL to `https://`, which would break `npm run start` on
 * `http://localhost:3000` — the exact setup this repo is developed in.
 *
 * ## What the policy has to allow, and why
 *
 * - `https://avatars.githubusercontent.com` in `img-src` — every developer's
 *   avatar is a GitHub-hosted image. Without it the profile shows no picture.
 * - `font-src 'self'` only, despite `next/font/google` — Next downloads the fonts
 *   at build time and self-hosts them, so no third-party font host is contacted.
 * - `connect-src 'self'` only — all GitHub traffic is server-side; the browser
 *   only ever calls this origin's own `/api/*`.
 * - `frame-ancestors 'none'` — RootRealm is never legitimately embedded, and
 *   clickjacking a developer into confirming an account deletion is exactly the
 *   attack this blocks.
 */
export function proxy(request: NextRequest) {
  // One value per request. `crypto.randomUUID` is the CSPRNG the platform
  // provides; there is no reason to reach for anything weaker here.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDevelopment = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    // `'strict-dynamic'` was tried here and removed: it tells a browser that
    // supports it to *ignore* `'self'`, on the theory that the nonced bootstrap
    // is trusted to load the rest. Next.js's own lazily-imported chunks are
    // injected after hydration **without** a nonce, so every one of them was
    // blocked and the page lost interactivity entirely — verified in the console,
    // not assumed. `'self'` is what actually covers those chunks, and with it
    // `script-src` still blocks third-party scripts *and* any inline script
    // without the nonce, which is what the nonce is for. In development React
    // also needs `eval` to reconstruct readable component stacks.
    `script-src 'self' 'nonce-${nonce}'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    // See the header note: inline style *attributes* cannot carry a nonce.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://avatars.githubusercontent.com",
    "font-src 'self'",
    // Every call the browser makes is to this origin.
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // The only form on the site posts to this origin, and it must not be
    // hijacked to post credentials somewhere else.
    "form-action 'self'",
    // Clickjacking defence, restated by X-Frame-Options for older browsers.
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ]
    .join("; ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  // Read back by Next.js, which applies the nonce to the scripts it injects.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  // The protected route-group layout uses this proxy-owned value to preserve
  // the page the visitor requested when it sends them to the login wall.
  requestHeaders.set(
    "x-rootrealm-pathname",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);

  /**
   * HSTS, and why it cannot live in `next.config.ts`.
   *
   * `headers()` is static: it cannot see which host is being requested, and the
   * decision here depends entirely on that. A browser which once receives
   * `Strict-Transport-Security` for a host refuses plain HTTP to that host for
   * the whole `max-age`. Sending it on `http://localhost` would break
   * `npm run start` — and every dev server after it, in that browser, with an
   * error pointing nowhere near this file. `127.0.0.1` has the same problem.
   *
   * So the check is here, where the host is readable. A year with
   * `includeSubDomains` is the recommendation; the `upgrade-insecure-requests`
   * directive in the CSP handles the first contact to a host that has never been
   * visited over HTTPS.
   */
  const host = request.headers.get("host") ?? "";
  const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);

  if (!isLoopback) {
    response.headers.set(
      "strict-transport-security",
      "max-age=31536000; includeSubDomains",
    );
  }

  return response;
}

export const config = {
  /**
   * Every path, including `/api/*`.
   *
   * Excluding the API routes would be tidier, but a JSON response is not
   * rendered by a browser document and a CSP on it protects nothing — while
   * excluding them means the one place an untrusted string *is* echoed back to a
   * caller is the one place without the header. The cost is one header parse.
   */
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
