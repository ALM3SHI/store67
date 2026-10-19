import { test, expect } from "@playwright/test";

test.describe("3D products", () => {
  test("home page shows the collection as interactive 3D models", async ({ page }) => {
    await page.goto("/ar");
    await expect(page.getByTestId("collection-item")).toHaveCount(3);
    await expect(page.getByTestId("collection-item").filter({ hasText: "مدلّك الرأس 76" })).toBeVisible();
    await expect(page.getByTestId("collection-item").filter({ hasText: "المحفظة الذكية 76" })).toBeVisible();
    // The hero model loads and replaces its poster image
    const hero = page.getByTestId("product-3d").first();
    await expect(hero).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    const box = await hero.locator("canvas").boundingBox();
    expect(box!.width).toBeGreaterThan(200);
    // No image galleries on the home page — products are shown as models
    await expect(page.locator('[aria-roledescription="carousel"]')).toHaveCount(0);
  });

  test("models can be rotated by drag and by keyboard", async ({ page }) => {
    await page.goto("/ar/products/smart-wallet-76");
    const viewer = page.getByTestId("product-3d").first();
    await expect(viewer).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    const canvas = viewer.locator("canvas");
    const before = await canvas.screenshot();
    const b = (await canvas.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 160, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    await viewer.focus();
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(300);
    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("product page switches between the 3D model and photos", async ({ page }) => {
    await page.goto("/ar/products/scalp-massager-76");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("مدلّك الرأس 76");
    await expect(page.getByTestId("tab-3d")).toHaveAttribute("aria-selected", "true");
    await page.getByTestId("tab-images").click();
    await expect(page.locator('[aria-roledescription="carousel"]')).toBeVisible();
    await page.getByTestId("tab-3d").click();
    await expect(page.getByTestId("product-3d").first()).toBeVisible();
  });

  test("new products are searchable and can be bought together", async ({ page }) => {
    await page.goto("/ar");
    await page.getByRole("button", { name: "بحث" }).click();
    await page.getByTestId("search-input").fill("مساج الراس");
    await expect(page.getByTestId("search-hit").first()).toContainText("مدلّك الرأس 76");
    await page.getByTestId("search-input").fill("محفظه");
    await expect(page.getByTestId("search-hit").first()).toContainText("المحفظة الذكية 76");
    await page.keyboard.press("Escape");

    for (const slug of ["scalp-massager-76", "smart-wallet-76"]) {
      await page.goto(`/ar/products/${slug}`);
      await page.getByTestId("add-to-cart").first().click();
      await expect(page.getByTestId("cart-drawer")).toBeVisible();
    }
    await expect(page.getByTestId("cart-line")).toHaveCount(2);
    // 129 + 189 + 25 shipping
    await expect(page.getByTestId("cart-total")).toContainText("343");
  });

  test("viewer falls back to the image when WebGL is unavailable", async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      // Simulate a device without WebGL
      const proto = HTMLCanvasElement.prototype as unknown as { getContext: (type: string, ...rest: unknown[]) => unknown };
      const orig = proto.getContext;
      proto.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (String(type).startsWith("webgl")) return null;
        return orig.call(this, type, ...rest);
      };
    });
    const page = await ctx.newPage();
    await page.goto("/ar/products/magcharge-76");
    const viewer = page.getByTestId("product-3d").first();
    await expect(viewer).toHaveAttribute("data-state", "failed", { timeout: 20_000 });
    await expect(viewer.locator("img")).toBeVisible();
    await ctx.close();
  });
});
