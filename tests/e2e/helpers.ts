import { expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { E2E_ENV } from "../../playwright.config";

export const ADMIN = { email: "e2e@store76.test", password: E2E_ENV.ADMIN_PASSWORD };

export async function addProductToCart(page: Page) {
  await page.goto("/ar/products/magcharge-76");
  await page.getByTestId("add-to-cart").first().click();
  await expect(page.getByTestId("cart-drawer")).toBeVisible();
  await expect(page.getByTestId("cart-count")).toHaveText("1");
}

export async function fillCheckout(page: Page, opts: { phone?: string } = {}) {
  await page.fill("#f-name", "نورة العتيبي");
  await page.fill("#f-phone", opts.phone ?? "0551112233");
  await page.selectOption("#f-city", "Riyadh");
  await page.fill("#f-district", "الملقا");
  await page.fill("#f-street", "طريق أنس بن مالك 14");
}

export function signTestEvent(raw: string) {
  return createHmac("sha256", E2E_ENV.SESSION_SECRET).update(`test-gateway:${raw}`).digest("hex");
}

export async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", ADMIN.password);
  await page.getByRole("button", { name: "دخول" }).click();
  await page.waitForURL("**/admin");
}

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Places an order through the public API and pays it on the test gateway page. */
export async function createPaidOrder(page: Page, phone = "0553332211") {
  const pdp = await (await page.request.get("/ar/products/magcharge-76")).text();
  const variantId = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\?",\\?"sku/.exec(pdp)![1]!;
  const r = await page.request.post("/api/checkout", {
    headers: { origin: "http://localhost:3100" },
    data: {
      idempotencyKey: `paid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      locale: "ar",
      items: [{ variantId, quantity: 1 }],
      paymentMethod: "test",
      customer: { name: "عميل اختبار", phone, email: "" },
      address: { city: "Dammam", district: "الشاطئ", street: "شارع 3", nationalAddress: "", postalCode: "", notes: "" },
    },
  });
  const { redirectUrl, orderNumber } = (await r.json()) as { redirectUrl: string; orderNumber: string };
  const u = new URL(redirectUrl);
  await page.goto(u.pathname + u.search);
  await page.getByTestId("test-pay-success").click();
  await page.waitForURL(/\/ar\/orders\//);
  return orderNumber;
}
