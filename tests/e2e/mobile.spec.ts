import { test, expect } from "@playwright/test";
import { noHorizontalScroll } from "./helpers";

test.describe("mobile", () => {
  test("pages fit the screen without sideways scrolling", async ({ page }) => {
    for (const p of ["/ar", "/ar/products/magcharge-76", "/ar/products", "/ar/checkout", "/ar/track", "/ar/pages/returns", "/ar/account", "/ar/wishlist", "/en"]) {
      await page.goto(p);
      await noHorizontalScroll(page);
    }
  });

  test("sticky buy bar appears after scrolling past the purchase buttons", async ({ page }) => {
    await page.goto("/ar/products/magcharge-76");
    const bar = page.getByTestId("sticky-buy");
    await expect(bar).toHaveAttribute("aria-hidden", "true");
    await page.evaluate(() => window.scrollTo(0, 2500));
    await expect(bar).toHaveAttribute("aria-hidden", "false");
    await bar.getByRole("button").click();
    await expect(page.getByTestId("cart-drawer")).toBeVisible();
    const box = await page.getByTestId("cart-drawer").boundingBox();
    expect(box!.width).toBeGreaterThan(300);
  });

  test("menu opens and navigates", async ({ page }) => {
    await page.goto("/ar");
    await page.getByRole("button", { name: "القائمة" }).click();
    await page.locator("#mobile-menu").getByRole("link", { name: "تتبع الطلب" }).click();
    await expect(page).toHaveURL(/\/ar\/track/);
  });

  test("checkout is usable on a phone", async ({ page }) => {
    await page.goto("/ar/products/magcharge-76");
    await page.getByTestId("add-to-cart").first().click();
    await page.getByTestId("go-checkout").click();
    await expect(page.getByTestId("checkout-form")).toBeVisible();
    await expect(page.locator("#f-phone")).toHaveAttribute("inputmode", "tel");
    await noHorizontalScroll(page);
  });
});
