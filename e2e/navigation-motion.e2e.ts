import { expect, test } from "@playwright/test";

import { fundDevWallet } from "./helpers";

const PRIMARY_ROUTES = ["/home", "/skill-tree", "/achievements", "/shop", "/profile"] as const;

test.describe("primary navigation motion", () => {
  test.beforeEach(async ({ page, request, context }) => {
    await fundDevWallet(request, context);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    page.on("pageerror", (error) => {
      throw error;
    });
    page.on("console", (message) => {
      if (message.type() === "error") throw new Error(message.text());
    });
  });

  test("desktop moves one shared indicator and animates the destination screen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/home");
    await page.waitForLoadState("domcontentloaded");

    const indicator = page.locator('nav[aria-label="Primary navigation"] span[aria-hidden="true"]').first();
    await expect
      .poll(() => indicator.evaluate((element) => getComputedStyle(element).opacity))
      .toBe("1");
    const homeTransform = await indicator.evaluate((element) => getComputedStyle(element).transform);

    await page.getByRole("link", { name: "Shop", exact: true }).click();
    await page.waitForURL(/\/shop$/);

    await expect(page.getByRole("link", { name: "Shop", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator(".motion-page-slide")).toHaveCount(1);

    const shopTransform = await indicator.evaluate((element) => getComputedStyle(element).transform);
    expect(shopTransform).not.toBe(homeTransform);
  });

  test("mobile keeps the same indicator synchronized with every primary destination", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/home");
    await page.waitForLoadState("domcontentloaded");

    const nav = page.locator('nav[aria-label="Primary navigation"]:visible');
    const indicator = nav.locator('span[aria-hidden="true"]').first();
    await expect
      .poll(() => indicator.evaluate((element) => getComputedStyle(element).opacity))
      .toBe("1");
    let previousTransform = await indicator.evaluate((element) => getComputedStyle(element).transform);

    for (const route of PRIMARY_ROUTES.slice(1)) {
      const label = route === "/skill-tree" ? "Skill Tree" : route.slice(1).replace("-", " ");
      await page.getByRole("link", { name: new RegExp(`^${label}$`, "i") }).click();
      await page.waitForURL(new RegExp(`${route.replace("/", "\\/")}$`));
      await expect
        .poll(() => indicator.evaluate((element) => getComputedStyle(element).transform))
        .not.toBe(previousTransform);
      const nextTransform = await indicator.evaluate((element) => getComputedStyle(element).transform);
      previousTransform = nextTransform;
    }
  });

  test("rapid switching settles on the last destination without a stale indicator", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/home");
    await page.getByRole("link", { name: "Shop", exact: true }).click();
    await page.getByRole("link", { name: "Profile", exact: true }).click();
    await page.waitForURL(/\/profile$/);

    await expect(page.getByRole("link", { name: "Profile", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator(".motion-page-slide")).toHaveCount(1);
  });
});
