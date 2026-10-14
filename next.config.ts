import type { NextConfig } from "next";

/**
 * RootRealm — build configuration and the security headers that do not vary per
 * request (the V1 audit's first finding).
 *
 * The Content Security Policy and HSTS are *not* here: both depend on the
 * request — one needs a fresh nonce, the other must not be sent to localhost —
 * so they live in `proxy.ts`. This file holds the headers whose value is the
 * same for every response and therefore belongs in `headers()`, where they are
 * served without executing any application code.
 */
const nextConfig: NextConfig = {
  /**
   * Do not advertise the framework and its version.
   *
   * `X-Powered-By: Next.js` is a free, accurate hint about the stack for anyone
   * probing the site, and nothing depends on it.
   */
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            /**
             * Stops MIME sniffing turning a user-supplied file into something the
             * browser executes.
             */
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            /**
             * Belt to the CSP's `frame-ancestors 'none'` braces, for browsers too
             * old to honour frame-ancestors.
             */
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
             /**
             * `strict-origin-when-cross-origin` rather than `no-referrer`: it
             * stops a GitHub profile link leaking the full URL to GitHub while
             * keeping referrers for same-origin navigation, which is where this
             * site's own links resolve.
             */
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
             /**
             * Everything off that this product does not use. Omitting the header
             * is not the same thing: the browser's defaults stay on, and those
             * include camera and microphone for some origins.
             */
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
             /**
             * Isolates the browsing context from cross-origin windows it opens.
             * The OAuth round trip is a full-page navigation to github.com and
             * back, which COOP does not interfere with — it targets popups and
             * `window.opener`, and RootRealm opens neither.
             */
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;