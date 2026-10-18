// Dev helper: screenshots of the purchase flow. node scripts/dev/flow-shots.mjs <outdir>
import { chromium } from "@playwright/test";
const out = process.argv[2];
const B = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [name, vp] of [["d", { width: 1440, height: 900 }], ["m", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto(`${B}/ar/products/magcharge-76`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/pdp-${name}.png`, fullPage: true });
  await page.getByTestId("add-to-cart").first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/drawer-${name}.png` });
  await page.getByTestId("go-checkout").click();
  await page.waitForURL(/checkout/);
  await page.waitForTimeout(1200);
  await page.fill("#f-name", "نورة العتيبي");
  await page.fill("#f-phone", "0551112233");
  await page.selectOption("#f-city", "Riyadh");
  await page.fill("#f-district", "الملقا");
  await page.fill("#f-street", "طريق أنس بن مالك 14");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/checkout-${name}.png`, fullPage: true });
  await page.getByTestId("place-order").click();
  await page.waitForURL(/pay\/test/);
  await page.screenshot({ path: `${out}/testpay-${name}.png` });
  await page.getByTestId("test-pay-success").click();
  await page.waitForURL(/orders/);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/order-${name}.png`, fullPage: true });
  await page.goto(`${B}/ar/products`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/catalog-${name}.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log("done");
