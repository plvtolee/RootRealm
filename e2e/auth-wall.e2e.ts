import { expect, test } from "@playwright/test";

test.describe("public entrance and protected app", () => {
  test("public landing offers the GitHub entrance", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Your code builds your realm." })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Continue with GitHub" }).first()).toHaveAttribute(
      "href",
      "/login",
    );
  });

  test("protected routes redirect guests to the login wall with a return path", async ({ page }) => {
    await page.goto("/shop");

    await expect(page).toHaveURL(/\/login\?next=%2Fshop$/);
    await expect(page.getByRole("heading", { name: "Enter your realm." })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Continue with GitHub" })).toHaveAttribute(
      "href",
      "/api/auth/github?next=%2Fshop",
    );
  });
});
