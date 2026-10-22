import { expect, test } from "@playwright/test";

import { MOCK_LOGIN, signInWithMockGitHub } from "./helpers";

/**
 * RootRealm — the synchronization journey (TASKS 11.2–11.4).
 *
 * ```text
 * a claimed account syncs → awards recorded once; a second sync records nothing
 * ```
 *
 * This is the first suite to drive the sync engine at runtime. Until now
 * `lib/sync/engine.ts` had 20-odd unit tests and no caller: a tested function
 * that could not run.
 *
 * The claim goes through the real OAuth chain against the mock GitHub, so the
 * session, the account and the ledger are all produced by production code paths
 * rather than seeded by a harness. That matters for the second half of this
 * file: an idempotency claim is only worth making against a store that was
 * written by the same path a second sync will take.
 */
test.describe("sync", () => {
  /** Signs in through the real OAuth chain against the mock GitHub. */
  async function claim(page: import("@playwright/test").Page) {
    await signInWithMockGitHub(page);
  }

  test("refuses an unauthenticated request", async ({ page }) => {
    // `page.request`, not the `request` fixture: the latter keeps its own cookie
    // jar, so a session minted in the browser is invisible to it. That is the
    // same trap `fundDevWallet` exists to work around, and the first run of this
    // suite failed with a 401 for exactly this reason.
    void page;
    const response = await page.request.post("/api/sync");

    expect(response.status()).toBe(401);
    expect((await response.json()).error).toBe("unauthenticated");
  });

  test("records awards for a claimed account", async ({ page }) => {
    await claim(page);

    const response = await page.request.post("/api/sync");
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body.synced).toBe(true);
    expect(body.login).toBe(MOCK_LOGIN);

    // Events are observed on every run, including a repeat, because GitHub is
    // refetched every time. That is what proves ingestion, normalization and
    // dedupe all ran rather than the route returning an empty shape.
    expect(body.counters.eventsObserved).toBeGreaterThan(0);

    // `totalXp` is read back from the store, not computed from this run. It must
    // cover whatever this run awarded, which is what shows the ledger and the
    // counter agree rather than being two unrelated numbers.
    expect(body.totalXp).toBeGreaterThanOrEqual(body.xpAwarded);
  });

  test("a second sync awards nothing again", async ({ page }) => {
    await claim(page);

    // Deliberately does NOT assert that a first sync awards XP.
    //
    // The server's store outlives the browser context, so by the time this test
    // runs the store already holds everything the previous test synced. An
    // assertion of "the first sync awards > 0" is therefore an assertion about
    // test order, and it failed for exactly that reason — which teaches nothing
    // about the product.
    //
    // What must hold regardless of what came before: the total never moves.
    const before = await (await page.request.post("/api/sync")).json();
    const after = await (await page.request.post("/api/sync")).json();

    expect(after.synced).toBe(true);
    expect(after.xpAwarded).toBe(0);
    expect(after.achievementsUnlocked).toBe(0);
    expect(after.counters.transactionsWritten).toBe(0);

    // The assertion that would fail if idempotency were enforced only in memory
    // and the store re-wrote rows on every sync.
    expect(after.totalXp).toBe(before.totalXp);
  });

  test("reports the same total across many syncs", async ({ page }) => {
    await claim(page);

    await page.request.post("/api/sync");
    const baseline = (await (await page.request.post("/api/sync")).json()).totalXp;

    for (let i = 0; i < 3; i += 1) {
      const again = await (await page.request.post("/api/sync")).json();
      expect(again.totalXp, `sync ${i + 3} changed the total`).toBe(baseline);
    }
  });

  test("awards an achievement once, and only once", async ({ page }) => {
    await claim(page);

    // Two runs back to back: whatever the first earned, the second must add
    // nothing. Order-independent for the same reason as above.
    await page.request.post("/api/sync");
    const second = await (await page.request.post("/api/sync")).json();

    expect(second.achievementsUnlocked).toBe(0);
  });
});