import { expect, test } from "@playwright/test";

/**
 * RootRealm — security headers (the first V1 audit finding).
 *
 * ```text
 * every response → headers the browser enforces
 * ```
 *
 * The audit found the server sent *none* of these, and `next.config.ts` was an
 * untouched scaffold. Headers are the easiest thing in a project to delete by
 * accident: nothing breaks, no test fails, the site looks identical, and the
 * protection is simply gone. So each one is asserted here against a real
 * response.
 *
 * The Content Security Policy assertions are deliberately about *structure* —
 * that a nonce is present and unique, and that the directives that protect
 * against injection are present — rather than pinning the whole header string. A
 * full-string assertion would fail on every harmless edit to the policy and get
 * deleted to make CI green.
 */
test.describe("security headers", () => {
  test("are present on a document response", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response?.headers() ?? {};

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");

    // Nothing is empty: an empty value and a missing header mean different
    // things to a browser, and the empty list is the point.
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["permissions-policy"]).toContain("microphone=()");
  });

  test("do not advertise the framework", async ({ page }) => {
    // `X-Powered-By` is a free, accurate hint about the stack.
    const response = await page.goto("/");
    expect(response?.headers()["x-powered-by"]).toBeUndefined();
  });

  test("carry a Content Security Policy with the injection defences", async ({ page }) => {
    const csp = (await page.goto("/"))?.headers()["content-security-policy"];
    expect(csp, "no CSP header at all").toBeDefined();

    // The four directives that do the actual work.
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/base-uri 'self'/);
    expect(csp).toMatch(/form-action 'self'/);
    // Clickjacking. `X-Frame-Options` above is the fallback for old browsers;
    // this is the one modern browsers honour.
    expect(csp).toMatch(/frame-ancestors 'none'/);

    // GitHub avatars are third-party images; without this every developer's
    // profile picture would be blocked.
    expect(csp).toContain("https://avatars.githubusercontent.com");
  });

  test("nonce every inline script in the served HTML", async ({ request }) => {
    const response = await request.get("/skill-tree");
    const html = await response.text();

    const tags = html.match(/<script[^>]*>/g) ?? [];
    const inline = tags.filter((t) => !/\ssrc=/.test(t));
    const nonced = tags.filter((t) => /nonce=/.test(t));

    // Read from the *server response*, not the live DOM. Per spec a browser
    // clears the nonce content attribute after parsing so it cannot be read back
    // through a CSS selector, and Next.js also injects further scripts at
    // runtime where no server-side attribute exists at all. Both make DOM
    // inspection unreliable; the HTML is the source of truth.
    expect(inline.length, "expected inline RSC scripts").toBeGreaterThan(0);
    expect(tags.length).toBeGreaterThan(inline.length);

    // This is the assertion that caught the real bug. A page prerendered at build
    // time has no nonce available, so its inline RSC payload scripts carry none
    // and the CSP blocks them — the page renders but is dead to clicks. Every
    // page must therefore be dynamically rendered.
    expect(nonced.length, "scripts without a nonce").toBe(tags.length);

    // And the policy must not have been weakened to paper over it.
    // `'unsafe-inline'` in `script-src` is what a nonce exists to avoid: it
    // permits exactly the injected inline script the nonce is meant to stop.
    const csp = response.headers()["content-security-policy"];
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toMatch(/script-src 'self' 'nonce-/);
  });

  test("mint a different nonce per request", async ({ page }) => {
    const nonces = new Set<string>();

    for (let i = 0; i < 3; i += 1) {
      const csp = (await page.request.get("/")).headers()["content-security-policy"];
      const match = /'nonce-([^']+)'/.exec(csp ?? "");
      expect(match, "no nonce in the CSP").not.toBeNull();
      nonces.add(match?.[1] ?? "");
    }

    // A repeated nonce is a nonce an attacker can read off one response and
    // replay. This is the property that makes the whole approach work.
    expect(nonces.size).toBe(3);
  });

  test("withhold HSTS from localhost, where it would break every dev server", async ({
    page,
  }) => {
    const headers = (await page.request.get("/")).headers();

    // A browser that sees HSTS for localhost refuses plain HTTP to it for the
    // whole max-age — breaking `npm run start` with an error that points nowhere
    // near this configuration.
    expect(headers["strict-transport-security"]).toBeUndefined();
  });
});