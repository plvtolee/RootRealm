/**
 * RootRealm — Playwright leaderboard journey (TASKS 20.6).
 *
 * ```text
 * Season → eligibility → opt-in → leaderboard
 * ```
 *
 * The ranked-season journey: a guest sees the season and its published rules, a
 * signed-in developer opts in, and the ladder reflects participation. Opt-in is a
 * real server mutation (`/api/seasons/opt-in`) against the season the clock is
 * in, and eligibility is the domain's own rule — evidence minimum, safeguard and
 * consent — not a client flag.
 *
 * ## The one thing the journey cannot show with the mock
 *
 * A published standing. Standings are computed from a developer's season events,
 * and the leaderboard page reads the viewer's events from the session, not from
 * GitHub — so a freshly seeded wallet has no activity to rank. The journey
 * therefore asserts the *eligibility* path (opted in, still "Not ranked" because
 * the evidence minimum is unmet) rather than a populated ladder, which is the
 * honest state of a developer who has just joined.
 */
import { expect, test } from "@playwright/test";

import { fundDevWallet } from "./helpers";

/**
 * Ensures the viewer is not participating, so a test can start from "Join".
 *
 * The season store is an in-memory singleton shared by every request, so a test
 * that joined leaves the next one already joined. Resetting through the UI (not
 * by poking the store) keeps the tests honest: they still exercise the real
 * mutation, and they do not depend on the order they run in.
 */
async function ensureNotParticipating(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.goto("/leaderboard");
  const leave = page.getByRole("button", { name: "Leave this season" });
  if ((await leave.count()) > 0) {
    await leave.click();
    await expect(page.getByRole("button", { name: "Join this season" })).toBeVisible();
  }
}

test.describe("leaderboard journey — season, eligibility and opt-in", () => {
  test("a guest sees the season and its published rules, and is invited to sign in", async ({
    page,
  }) => {
    await page.goto("/leaderboard");

    // A running season with a name and a window label (TASKS 16.1, 16.6).
    await expect(page.getByText("Ranked season")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How this season is scored" })).toBeVisible();

    // Transparency: the evidence minimum and the opt-in requirement are stated
    // to everyone, including developers who are not on the board.
    await expect(page.getByText(/you must opt in/)).toBeVisible();

    // The guest is offered the one action that changes that.
    await expect(page.getByText(/Sign in with GitHub to see your standing/)).toBeVisible();
  });

  test("a signed-in developer can join the season and the control reflects it", async ({
    page,
    request,
    context,
  }) => {
    await fundDevWallet(request, context, { coins: 1_000 });

    await page.goto("/leaderboard");
    await ensureNotParticipating(page);

    // Signed in: the standing card is present and the viewer's own opt-in
    // control is offered.
    await expect(page.getByRole("heading", { name: "Your standing" })).toBeVisible();

    const join = page.getByRole("button", { name: "Join this season" });
    await expect(join).toBeVisible();
    await expect(join).toHaveAttribute("aria-pressed", "false");

    await join.click();

    // The mutation persisted: the control flipped to the opposing action. The
    // button's own state is the server's answer after `router.refresh()`.
    const leave = page.getByRole("button", { name: "Leave this season" });
    await expect(leave).toBeVisible();
    await expect(leave).toHaveAttribute("aria-pressed", "true");
  });

  test("joining makes the developer eligible for the ladder but not yet ranked", async ({
    page,
    request,
    context,
  }) => {
    await fundDevWallet(request, context, { coins: 1_000 });
    await page.goto("/leaderboard");
    await ensureNotParticipating(page);
    await page.getByRole("button", { name: "Join this season" }).click();
    await expect(page.getByRole("button", { name: "Leave this season" })).toBeVisible();

    // Opted in, the ladder copy changes from "nobody has opted in" to "your
    // standing is not on this ladder yet" — participation is recorded even
    // though no standing has been computed (there is no activity to rank).
    await expect(
      page.getByText(/Your standing is not on this ladder yet/),
    ).toBeVisible();

    // The developer is not ranked, and the reason is the domain's own: the
    // evidence minimum is unmet. That detail is shown rather than a bare badge.
    await expect(page.getByText("Not ranked")).toBeVisible();
    await expect(page.getByText(/qualifying merges observed/)).toBeVisible();
  });

  test("opting in and out round-trips and leaves no participation", async ({
    page,
    request,
    context,
  }) => {
    await fundDevWallet(request, context, { coins: 1_000 });
    await page.goto("/leaderboard");
    await ensureNotParticipating(page);

    await page.getByRole("button", { name: "Join this season" }).click();
    await expect(page.getByRole("button", { name: "Leave this season" })).toBeVisible();

    await page.getByRole("button", { name: "Leave this season" }).click();
    await expect(page.getByRole("button", { name: "Join this season" })).toBeVisible();

    // Back to not participating: the ladder copy returns to the "nobody has
    // opted in" state, which is what "leave" has to mean.
    await expect(
      page.getByText(/Nobody has opted in to this season's ladder/),
    ).toBeVisible();
  });
});