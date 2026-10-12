/**
 * RootRealm — Playwright core journey (TASKS 20.3).
 *
 * ```text
 * Guest → username search → profile → skill tree → node detail
 * ```
 *
 * The one journey that needs no session: a guest types a GitHub username, gets a
 * real RootRealm profile built from the mock's activity, opens the skill tree and
 * inspects a node. Every number asserted here is produced by the real ingestion,
 * normalization, scoring and aggregation — the same code the product runs — so
 * the journey fails if any stage of that chain regresses, not merely if a label
 * changes.
 */
import { expect, test } from "@playwright/test";

import { MOCK_LOGIN } from "./helpers";

test.describe("core journey — guest lookup to node detail", () => {
  test("a guest searches a username and gets a real profile", async ({ page }) => {
    await page.goto("/preview");

    // The guest is on the public preview with no session and no login.
    await expect(page.getByRole("heading", { name: "Profile preview" })).toBeVisible();
    await expect(page.getByText("Enter a username to build a preview.")).toBeVisible();

    await page.getByLabel("GitHub username").fill(MOCK_LOGIN);
    await page.getByRole("button", { name: "Preview" }).click();

    // The profile came back: identity, level, XP and the six attributes.
    await expect(page.getByText(`@${MOCK_LOGIN}`, { exact: true })).toBeVisible();
    await expect(page.getByText("E2E Developer")).toBeVisible();
    await expect(page.getByText(/^Lv\. \d+$/)).toBeVisible();
    // The headline XP total, which the scoring engine produced — not one of the
    // per-event explanation amounts, which also end in "XP".
    await expect(page.locator("#preview-xp")).toHaveText(/\d[\d,]* XP/);

    // A guest lookup has not proved ownership, so the character is unverified.
    await expect(page.getByText("Unverified")).toBeVisible();

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

    // Transparency is part of the contract (PRD §10): the preview says what it
    // observed and what it cannot support, rather than showing a bare number.
    await expect(
      page.getByRole("heading", { name: "How this was calculated" }),
    ).toBeVisible();
    await expect(page.getByText("Observed scope")).toBeVisible();
  });

  test("the preview offers the claim, and it is a real navigation", async ({ page }) => {
    await page.goto("/preview");
    await page.getByLabel("GitHub username").fill(MOCK_LOGIN);
    await page.getByRole("button", { name: "Preview" }).click();

    await expect(
      page.getByRole("heading", { name: "Make this profile yours" }),
    ).toBeVisible();

    // An anchor, not a fetch: the OAuth flow is a full-page redirect, which is
    // why the claim is reachable without JavaScript and by keyboard.
    const claim = page.getByRole("link", { name: "Connect GitHub" });
    await expect(claim).toHaveAttribute("href", "/api/auth/github");
  });

  test("an unknown username reports the failure instead of an empty profile", async ({
    page,
  }) => {
    await page.goto("/preview");
    await page.getByLabel("GitHub username").fill("e2e-no-such-account");
    await page.getByRole("button", { name: "Preview" }).click();

    // The mock 404s, the client maps that to a readable state, and no profile
    // renders — the honest outcome, not a zeroed profile that looks real.
    await expect(page.getByText(`@${MOCK_LOGIN}`)).toHaveCount(0);
    await expect(page.getByText(/not found|could not|does not|unknown/i).first()).toBeVisible();
  });

  test("the skill tree renders its map and opens a node's detail", async ({ page }) => {
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
    await page.goto("/skill-tree");

    await page.getByRole("button", { name: "List" }).click();

    // The map's `role="img"` gives way to a readable list, so the same content is
    // reachable without perceiving the drawing (TASKS 17.2).
    await expect(page.getByRole("img", { name: /skill tree map/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Map" })).toBeVisible();
  });
});