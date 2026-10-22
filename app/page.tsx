import { RootRealmLanding } from "@/components/landing/rootrealm-landing";

/**
 * Rendered per request, not prerendered.
 *
 * Not a performance choice — a correctness one. `proxy.ts` mints a fresh CSP
 * nonce on every request, and Next.js can only attach a nonce to a script while
 * rendering it. A page prerendered at build time has no nonce available, so its
 * inline RSC payload scripts carry none and the Content-Security-Policy blocks
 * them: verified in the browser console, where two inline scripts were rejected
 * and every script tag on the page had no `nonce` attribute.
 *
 * Do not "optimise" this away. `e2e/security.e2e.ts` fails without it.
 */
export const dynamic = "force-dynamic";

/**
 * `/` — the public landing page.
 *
 * ```text
 * visitor → what RootRealm is → the login wall → the app
 * ```
 *
 * This is the only marketing surface in the product. It is deliberately thin:
 * the page is `RootRealmLanding`, a presentational component that renders no
 * data and reaches no API. Everything that needs an account lives behind
 * `/login`; every call to action here points there, so a visitor cannot land in
 * a half-loaded application shell with no identity.
 *
 * The application shell (`AppShellChrome`) refuses to mount navigation on this
 * path, so the landing is chrome-free: no app nav, no bottom bar, no account
 * affordances that a signed-out visitor cannot use.
 */
export default function LandingPage() {
  return <RootRealmLanding />;
}
