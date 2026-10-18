// Dev helper: log into admin and screenshot pages. node scripts/dev/admin-shots.mjs <outdir> <path...>
import { chromium } from "@playwright/test";
const [out, ...paths] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:3000/admin/login");
await page.fill("#email", "admin@store76.local");
await page.fill("#password", "dev-password-1234");
await page.click("button:has-text('دخول')");
await page.waitForURL("http://localhost:3000/admin", { timeout: 60000 });
for (const p of paths) {
  const r = await page.goto("http://localhost:3000" + p, { waitUntil: "networkidle" });
  const name = p.replace(/\W+/g, "_") || "root";
  await page.screenshot({ path: `${out}/admin${name}.png`, fullPage: true });
  console.log(p, r?.status());
}
console.log("errors", errors);
await browser.close();
