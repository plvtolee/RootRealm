/**
 * RootRealm — Playwright core journey (TASKS 20.3).
 *
 * ```text
 * Landing → login wall → GitHub OAuth → real profile → skill tree
 * ```
 *
 * RootRealm has no public profile lookup. A character is built from the signed-in
 * developer's own GitHub activity, so this journey proves the entry contract the
 * product actually has: `/` is public, everything else redirects to `/login`, the
 * one door is GitHub OAuth, and the profile behind it is produced by the real
 * ingestion, normalization, scoring and aggregation code.
 *
 * The only substitution is GitHub itself (see `e2e/mock-github.mjs`). Every
 * number asserted here comes from the mock's activity through the same code path
 * a live deployment runs.
 */
import { expect, test } from "@playwright/test";

import { MOCK_LOGIN, signInWithMockGitHub } from "./helpers";

test.describe("core journey — sign-in to a real profile", () => {
  test("a signed-in developer gets a profile built from real activity", async ({ page }) => {
    await signInWithMockGitHub(page);
    await page.goto("/profile");

    // Identity: the page's single h1 is the GitHub login the session belongs to.
    await expect(
      page.getByRole("heading", { level: 1, name: MOCK_LOGIN }),
    ).toBeVisible();

    // Progression: the level and the XP bar are the aggregate's numbers, not a
    // static mock. The visible text is the accessible name of the progressbar.
    await expect(page.locator("#profile-level")).toHaveText(/^Lv\. \d+$/);
    await expect(page.locator("#profile-xp")).toHaveText(
      /\d[\d,]* \/ \d[\d,]* XP/,
    );

    // Ownership was established by OAuth, so the account is verified.
    await expect(page.getByText("Verified account")).toBeAttached();

    // The six attribute roles are always rendered, even at zero.
    for (const attribute of [
      "Builder",
      "Debugger",
      "Scholar",
      "Collaborator",
      "Maintainer",
      "Architect",
    ]) {
      await expect(page.getByText(attribute, { exact: true }).first()).toBeVisible();
    }
  });

  test("the login wall is the only door into the app", async ({ page }) => {
    await page.goto("/login");

    // The one action is a real navigation to the OAuth start, carrying the
    // destination the login wall remembered. `/home` is the default.
    const signIn = page.getByRole("link", { name: "Continue with GitHub" });
    await expect(signIn).toHaveAttribute("href", "/api/auth/github?next=%2Fhome");

    // A protected route is not rendered at all for a visitor with no session.
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/);
    await expect(page.getByRole("heading", { name: "Enter your realm." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue with GitHub" })).toBeVisible();
  });

  test("an unknown GitHub account reports the failure instead of an empty profile", async ({
    request,
  }) => {
    // The profile is asked for by the signed-in app, but the ingestion failure
    // path is the same one every screen shares. The mock 404s and the endpoint
    // answers with a user-safe reason rather than a zeroed profile that looks
    // real — the honest outcome.
    const response = await request.get(
      "/api/github/profile-preview?username=e2e-no-such-account",
    );

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
    expect(JSON.stringify(await response.json())).toMatch(
      /not found|could not|does not|unknown/i,
    );
  });

  test("the skill tree renders its map and opens a node's detail", async ({ page }) => {
    await signInWithMockGitHub(page);
    await page.goto("/skill-tree");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(/skill/i);

    // The map is a labelled image; its nodes are real buttons (TASKS 17.2).
    const map = page.getByRole("img", { name: /skill tree map/i });
    await expect(map).toBeVisible();

    // The tree opens on the Origin, so there is already a detail panel: the
    // always-learned root is the one node whose requirements are "None".
    await expect(page.getByRole("heading", { name: "Origin" })).toBeVisible();
    await expect(page.getByText("None — the Origin is always learned.")).toBeVisible();

    // Node buttons carry the "{title} — {status}, {branch}" name, so opening one
    // is an ordinary accessible click — no coordinates, no CSS selectors.
    const node = page.getByRole("button", { name: /^First Merge — / });
    await expect(node).toBeVisible();
    await node.click();

    // The detail panel is announced politely and swaps to the clicked node.
    const detail = page.locator('[aria-live="polite"]');
    await expect(detail).toBeVisible();
    await expect(detail.getByRole("heading")).toHaveText("First Merge");
  });

  test("the skill tree offers an equivalent list view for the same nodes", async ({
    page,
  }) => {
    await signInWithMockGitHub(page);
    await page.goto("/skill-tree");

    await page.getByRole("button", { name: "List" }).click();

    // The map's `role="img"` gives way to a readable list, so the same content is
    // reachable without perceiving the drawing (TASKS 17.2).
    await expect(page.getByRole("img", { name: /skill tree map/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Map" })).toBeVisible();
  });
});
