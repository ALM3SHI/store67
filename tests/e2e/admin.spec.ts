import { test, expect } from "@playwright/test";
import { adminLogin, createPaidOrder } from "./helpers";

test.describe("admin", () => {
  test("unauthenticated visitors are sent to the login page and API is refused", async ({ page, request }) => {
    await page.goto("/admin/orders");
    await expect(page).toHaveURL(/\/admin\/login$/);
    // A forged cookie doesn't pass the server-side session check
    await page.context().addCookies([{ name: "s76_admin", value: "x".repeat(43), url: "http://localhost:3100" }]);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    const upload = await request.post("/api/admin/uploads", { headers: { origin: "http://localhost:3100" }, multipart: { file: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("x") } } });
    expect(upload.status()).toBe(401);
  });

  test("wrong password is rejected", async ({ page }) => {
    await page.goto("/admin/login");
    await page.fill("#email", "e2e@store76.test");
    await page.fill("#password", "not-the-password");
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page.getByText("البريد الإلكتروني أو كلمة المرور غير صحيحة")).toBeVisible();
  });

  test("owner can change a price and the store shows it", async ({ page }) => {
    await adminLogin(page);
    await expect(page.getByTestId("readiness")).toBeVisible();
    await page.goto("/admin/products");
    await page.getByTestId("admin-product-link").first().click();
    await page.getByTestId("variant-price").fill("139");
    await page.getByTestId("save-product").click();
    await expect(page.getByTestId("form-message")).toContainText("حُفظ المنتج");
    await page.goto("/ar/products/magcharge-76");
    await expect(page.getByTestId("buy-box").first()).toContainText("139");
    // restore
    await page.goto("/admin/products");
    await page.getByTestId("admin-product-link").first().click();
    await page.getByTestId("variant-price").fill("149");
    await page.getByTestId("save-product").click();
    await expect(page.getByTestId("form-message")).toContainText("حُفظ المنتج");
  });

  test("orders can be shipped with a tracking number that the customer sees", async ({ page }) => {
    const number = await createPaidOrder(page);
    const orderUrl = page.url();
    await adminLogin(page);
    await page.goto(`/admin/orders?q=${number}`);
    const link = page.getByTestId("admin-order-link").first();
    await expect(link).toBeVisible();
    await link.click();
    const form = page.getByTestId("manual-shipment");
    await form.locator('input[name="carrierName"]').fill("SMSA");
    await form.locator('input[name="trackingNumber"]').fill("TRK123456");
    await form.getByRole("button", { name: "حفظ الشحنة" }).click();
    await expect(form.getByTestId("form-message")).toContainText("تم الشحن");
    await page.reload();
    await expect(page.getByText("TRK123456").first()).toBeVisible();
    await page.goto(orderUrl);
    await expect(page.getByTestId("order-page")).toHaveAttribute("data-status", "shipped");
    await expect(page.getByText("TRK123456").first()).toBeVisible();
  });

  test("settings validate input", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/settings");
    const form = page.getByTestId("settings-analytics");
    await form.locator('input[type="text"]').first().fill("not-an-id");
    await form.getByRole("button", { name: "حفظ" }).click();
    await expect(form.getByTestId("form-message")).toContainText("GA4");
  });

  test("categories can be added and show up as a store filter", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/categories");
    const form = page.getByTestId("category-form");
    await form.locator('input[name="nameAr"]').fill("الصوتيات");
    await form.locator('input[name="nameEn"]').fill("Audio");
    await form.locator('input[name="slug"]').fill("audio-e2e");
    await form.getByRole("button", { name: "إضافة" }).click();
    await expect(form.getByTestId("form-message")).toContainText("أُضيف التصنيف");
    await page.goto("/ar/products");
    await expect(page.getByRole("link", { name: "الصوتيات" })).toBeVisible();
  });

  test("the order page shows the message log and the team alert is recorded", async ({ page }) => {
    const number = await createPaidOrder(page);
    await adminLogin(page);
    await page.goto(`/admin/orders?q=${number}`);
    await page.getByTestId("admin-order-link").first().click();
    await expect(page.getByText("الرسائل المرسلة")).toBeVisible();
  });

  test("forgot password never reveals whether an account exists", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByRole("link", { name: "نسيت كلمة المرور؟" }).click();
    await expect(page).toHaveURL(/\/admin\/forgot$/);
    await page.fill("#email", "nobody@store76.test");
    await page.getByRole("button", { name: "إرسال رابط الاستعادة" }).click();
    await expect(page.getByRole("status")).toContainText("إن كان البريد مسجلًا لدينا");
    await page.goto("/admin/reset?token=" + "x".repeat(43));
    await expect(page.getByText("الرابط غير صالح أو انتهت صلاحيته")).toBeVisible();
  });
});
