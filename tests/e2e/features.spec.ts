import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { adminLogin, createPaidOrder } from "./helpers";

/** RFC 6238 code from a base32 secret — what an authenticator app would show. */
function totp(secretB32: string, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const ch of secretB32) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const h = createHmac("sha1", Buffer.from(bytes)).update(msg).digest();
  const off = h[h.length - 1]! & 15;
  const code = ((h[off]! & 127) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(code % 1_000_000).padStart(6, "0");
}

test.describe("store features", () => {
  test("wishlist: heart a product, see it on the wishlist page, remove it", async ({ page }) => {
    await page.goto("/ar/products/smart-wallet-76");
    const heart = page.getByTestId("buy-box").first().getByTestId("wishlist-toggle");
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("wishlist-count")).toHaveText("1");
    await page.goto("/ar/wishlist");
    await expect(page.getByTestId("wishlist-items")).toContainText("المحفظة الذكية 76");
    await page.getByTestId("wishlist-items").getByTestId("wishlist-toggle").click();
    await expect(page.getByTestId("wishlist-empty")).toBeVisible();
  });

  test("my orders: the sign-in form never reveals whether an email has orders", async ({ page }) => {
    await page.goto("/ar/account");
    await page.fill("#acc-email", "nobody@store76.test");
    await page.getByRole("button", { name: "أرسل رابط الدخول" }).click();
    await expect(page.getByTestId("orders-link-form").getByRole("status")).toContainText("إن كانت لدينا طلبات");
    await page.goto("/ar/account/verify?token=forged.1.abc");
    await expect(page).toHaveURL(/\/ar\/account\?invalid=1$/);
  });

  test("admin: export orders, print a packing slip, customer can print a receipt", async ({ page }) => {
    const number = await createPaidOrder(page, "0554445566");
    await expect(page.getByTestId("print-receipt")).toBeVisible();
    await adminLogin(page);
    const csv = await page.request.get(`/api/admin/orders/export?q=${number}`);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const body = await csv.text();
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body).toContain(number);
    await page.goto(`/admin/orders?q=${number}`);
    await page.getByTestId("admin-order-link").first().click();
    await page.getByTestId("print-slip").click();
    await expect(page.getByTestId("packing-slip")).toContainText(number);
    await expect(page.getByTestId("packing-slip")).toContainText("مدفوع مسبقًا");
    // anonymous users can't export
    const anon = await page.context().browser()!.newContext();
    const r = await anon.request.get("http://localhost:3100/api/admin/orders/export");
    expect(r.status()).toBe(401);
    await anon.close();
  });

  test("admin: two-factor login with an authenticator code", async ({ page, browser }) => {
    // A dedicated account so the main e2e admin keeps logging in with a password only.
    await adminLogin(page);
    await page.goto("/admin/users");
    const email = `tf-${Date.now()}@store76.test`;
    const create = page.locator("form").filter({ has: page.locator('input[name="email"]') }).first();
    await create.locator('input[name="name"]').fill("Two Factor");
    await create.locator('input[name="email"]').fill(email);
    await create.locator('select[name="role"]').selectOption("support");
    await create.getByRole("button", { name: "إنشاء الحساب" }).click();
    const msg = await create.getByTestId("form-message").textContent();
    const password = /:\s*(\S+)\s*$/.exec(msg ?? "")![1]!;

    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto("/admin/login");
    await p.fill("#email", email);
    await p.fill("#password", password);
    await p.getByRole("button", { name: "دخول" }).click();
    await p.waitForURL("**/admin");
    await p.goto("/admin/account");
    await p.getByTestId("2fa-start").click();
    const secret = (await p.getByTestId("2fa-secret").textContent())!.trim();
    await p.fill("#tf-code", totp(secret));
    await p.getByRole("button", { name: "تفعيل" }).click();
    await expect(p.getByTestId("recovery-codes")).toBeVisible();
    await p.getByTestId("logout").first().click();
    await p.waitForURL("**/admin/login");

    await p.fill("#email", email);
    await p.fill("#password", password);
    await p.getByRole("button", { name: "دخول" }).click();
    await p.waitForURL("**/admin/login/verify");
    await p.fill("#code", "000000");
    await p.getByRole("button", { name: "تحقق" }).click();
    await expect(p.getByRole("alert").filter({ hasText: "الرمز غير صحيح" })).toBeVisible();
    // the next 30-second window's code (the current one was used during setup)
    await p.fill("#code", totp(secret, Date.now() + 30_000));
    await p.getByRole("button", { name: "تحقق" }).click();
    await p.waitForURL("**/admin");
    await ctx.close();
  });

  test("support chat: tells the order status when given the order number and mobile", async ({ page }) => {
    const number = await createPaidOrder(page, "0556667788");
    await page.goto("/ar");
    await page.getByTestId("help-button").click();
    await page.getByRole("textbox", { name: /اكتب سؤالك/ }).fill(`وين طلبي ${number}`);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("assistant-answer").last()).toContainText("رقم الجوال");
    await page.getByRole("textbox", { name: /اكتب سؤالك/ }).fill("0556667788");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("assistant-answer").last()).toContainText(number);
    await expect(page.getByTestId("assistant-answer").last()).toContainText("مؤكد");
  });
});
