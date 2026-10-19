import { test, expect } from "@playwright/test";
import { addProductToCart, fillCheckout, noHorizontalScroll, signTestEvent } from "./helpers";

test.describe("storefront", () => {
  test("home page renders the product, price and structured data in Arabic RTL", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/ar$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("قرّبه من جوالك");
    await expect(page.getByTestId("buy-box").first()).toContainText("149");
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const product = ld.map((x) => JSON.parse(x)).find((x) => x["@type"] === "Product");
    expect(product.offers.price).toBe("149.00");
    expect(product.offers.availability).toContain("InStock");
    expect(product.aggregateRating).toBeUndefined(); // no fake ratings
    await noHorizontalScroll(page);
  });

  test("English version switches direction and language", async ({ page }) => {
    await page.goto("/en/products/magcharge-76");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("MagCharge 76");
  });

  test("first-visit intro plays once and never hides the page content", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "no-preference" });
    await ctx.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
    const page = await ctx.newPage();
    await page.goto("/ar");
    await expect(page.locator(".intro")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeAttached(); // content is in the DOM underneath
    await expect(page.locator(".intro")).toBeHidden({ timeout: 4000 });
    await page.reload();
    await expect(page.locator("html")).not.toHaveAttribute("data-intro", "play");
    await ctx.close();
  });

  test("search finds the product with Arabic spelling variants and handles no results", async ({ page }) => {
    await page.goto("/ar");
    await page.getByRole("button", { name: "بحث" }).click();
    await page.getByTestId("search-input").fill("الشاحن المغناطيسى");
    await expect(page.getByTestId("search-hit").first()).toContainText("MagCharge 76");
    await page.getByTestId("search-input").fill("ثلاجة");
    await expect(page.getByTestId("search-empty")).toBeVisible();
    await page.getByTestId("search-input").fill("magchrge");
    await expect(page.getByTestId("search-hit").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/ar\/products\/magcharge-76/);
  });

  test("cart: add, change quantity, totals update, persists across reload", async ({ page }) => {
    await addProductToCart(page);
    await expect(page.getByTestId("cart-total")).toContainText("174"); // 149 + 25 shipping
    await page.getByTestId("cart-drawer").getByRole("button", { name: "زيادة الكمية" }).click();
    await expect(page.getByTestId("cart-qty")).toHaveText("2");
    await expect(page.getByTestId("cart-total")).toContainText("323");
    await page.reload();
    await expect(page.getByTestId("cart-count")).toHaveText("2");
    await page.getByTestId("cart-button").click();
    await page.getByRole("button", { name: "إزالة" }).click();
    await expect(page.getByTestId("cart-drawer")).toContainText("سلتك فارغة");
  });

  test("quantity cannot exceed the allowed maximum", async ({ page }) => {
    await addProductToCart(page);
    const inc = page.getByTestId("cart-drawer").getByRole("button", { name: "زيادة الكمية" });
    for (let i = 0; i < 6; i++) if (await inc.isEnabled()) await inc.click();
    await expect(page.getByTestId("cart-qty")).toHaveText("5");
    await expect(inc).toBeDisabled();
  });

  test("checkout validates fields before submitting", async ({ page }) => {
    await addProductToCart(page);
    await page.getByTestId("go-checkout").click();
    await page.getByTestId("place-order").click();
    await expect(page.locator("#e-name")).toBeVisible();
    await expect(page.locator("#e-phone")).toBeVisible();
    await page.fill("#f-phone", "12345");
    await page.locator("#f-phone").blur();
    await expect(page.locator("#e-phone")).toContainText("05XXXXXXXX");
  });

  test("full purchase with the test gateway marks the order paid", async ({ page }) => {
    await addProductToCart(page);
    await page.getByTestId("go-checkout").click();
    await fillCheckout(page);
    await expect(page.getByTestId("pay-test")).toBeChecked();
    await expect(page.getByTestId("checkout-total")).toContainText("174");
    await page.getByTestId("place-order").click();
    await page.waitForURL(/\/pay\/test\//);
    await page.getByTestId("test-pay-success").click();
    await page.waitForURL(/\/ar\/orders\//);
    await expect(page.getByTestId("order-page")).toHaveAttribute("data-payment", "paid");
    await expect(page.getByTestId("order-banner")).toContainText("شكرًا لك");
    await expect(page.getByTestId("order-total")).toContainText("174");
    // the cart is emptied after a successful order
    await expect(page.getByTestId("cart-count")).toHaveCount(0);

    // Order page needs the token
    const url = new URL(page.url());
    const res = await page.goto(url.pathname); // no ?t=
    expect(res?.status()).toBe(404);
    const res2 = await page.goto(`${url.pathname}?t=${"A".repeat(43)}`);
    expect(res2?.status()).toBe(404);
  });

  test("declined payment shows a retry option", async ({ page }) => {
    await addProductToCart(page);
    await page.getByTestId("go-checkout").click();
    await fillCheckout(page, { phone: "0554445566" });
    await page.getByTestId("place-order").click();
    await page.waitForURL(/\/pay\/test\//);
    await page.getByTestId("test-pay-fail").click();
    await page.waitForURL(/\/ar\/orders\//);
    await expect(page.getByTestId("order-page")).toHaveAttribute("data-status", "payment_failed");
    await page.getByTestId("retry-payment").click();
    await page.waitForURL(/\/pay\/test\//);
    await page.getByTestId("test-pay-success").click();
    await page.waitForURL(/\/ar\/orders\//);
    await expect(page.getByTestId("order-page")).toHaveAttribute("data-payment", "paid");
  });

  test("tracking page finds an order only with the matching phone", async ({ page, request }) => {
    // Create an order through the API (COD isn't enabled, so use the test gateway)
    const pdp = await (await request.get("/ar/products/magcharge-76")).text();
    const variantId = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\?",\\?"sku/.exec(pdp)![1]!;
    const r = await request.post("/api/checkout", {
      headers: { origin: "http://localhost:3100" },
      data: {
        idempotencyKey: `track-${Date.now()}-abcdef`,
        locale: "ar",
        items: [{ variantId, quantity: 1 }],
        paymentMethod: "test",
        customer: { name: "تتبع", phone: "0557778899", email: "" },
        address: { city: "Jeddah", district: "الروضة", street: "شارع 1", nationalAddress: "", postalCode: "", notes: "" },
      },
    });
    const { orderNumber } = await r.json();
    await page.goto("/ar/track");
    await page.fill("#tr-number", orderNumber);
    await page.fill("#tr-phone", "0500000000");
    await page.getByRole("button", { name: "تتبع" }).click();
    await expect(page.getByText("لم نجد طلبًا بهذه البيانات")).toBeVisible();
    await page.fill("#tr-phone", "0557778899");
    await page.getByRole("button", { name: "تتبع" }).click();
    await expect(page.getByTestId("track-result")).toContainText(orderNumber);
  });

  test("the server ignores tampered prices and rejects cross-site requests", async ({ request }) => {
    const pdp = await (await request.get("/ar/products/magcharge-76")).text();
    const variantId = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\?",\\?"sku/.exec(pdp)![1]!;
    const body = {
      idempotencyKey: `tamper-${Date.now()}-abcdef`,
      locale: "ar",
      items: [{ variantId, quantity: 1, unitPriceHalalas: 1 }],
      totalHalalas: 1,
      paymentMethod: "test",
      customer: { name: "مختبر", phone: "0551231234", email: "" },
      address: { city: "Riyadh", district: "العليا", street: "شارع 2", nationalAddress: "", postalCode: "", notes: "" },
    };
    const cross = await request.post("/api/checkout", { headers: { origin: "https://evil.example" }, data: body });
    expect(cross.status()).toBe(403);
    const quote = await request.post("/api/cart/quote", { data: { items: [{ variantId, quantity: 1 }] } });
    expect((await quote.json()).totals.totalHalalas).toBe(17400);
    const ok = await request.post("/api/checkout", { headers: { origin: "http://localhost:3100" }, data: body });
    expect(ok.status()).toBe(200);
    const { redirectUrl } = await ok.json();
    const pay = new URL(redirectUrl);
    const page = await request.get(pay.pathname + pay.search);
    expect(await page.text()).toContain("174");
  });

  test("payment webhooks are verified and idempotent over HTTP", async ({ request }) => {
    const unsigned = await request.post("/api/payments/test/webhook", { data: { id: "x", type: "payment_paid", ref: "nope", amount: 1, currency: "SAR" } });
    expect(unsigned.status()).toBe(401);
    const moyasar = await request.post("/api/payments/moyasar/webhook", { data: { id: "x", type: "payment_paid", secret_token: "guess", data: { id: "p" } } });
    expect(moyasar.status()).toBe(503); // not configured in this environment — nothing can be marked paid
    const raw = JSON.stringify({ id: "evt_unknown", type: "payment_paid", ref: "test_unknown", amount: 100, currency: "SAR" });
    const unknown = await request.post("/api/payments/test/webhook", { headers: { "content-type": "application/json", "x-test-signature": signTestEvent(raw) }, data: raw });
    expect(unknown.status()).toBe(404);
  });

  test("policy pages, sitemap, robots and merchant feed are served", async ({ request }) => {
    for (const p of ["/ar/pages/shipping", "/ar/pages/returns", "/ar/pages/privacy", "/ar/pages/terms", "/ar/pages/contact", "/ar/pages/business", "/en/pages/returns"]) {
      expect((await request.get(p)).status(), p).toBe(200);
    }
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/ar/products/magcharge-76");
    expect(sitemap).toContain('hreflang="en"');
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /"); // non-production deployments are not indexed
    const feed = await (await request.get("/feeds/google-merchant.xml")).text();
    expect(feed).toContain("<g:price>149 SAR</g:price>");
    expect(feed).toContain("<g:availability>in_stock</g:availability>");
    expect((await request.get("/ar/does-not-exist")).status()).toBe(404);
  });
});
