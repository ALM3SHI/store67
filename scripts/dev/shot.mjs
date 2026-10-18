// Dev helper: node scripts/dev/shot.mjs <url> <out.png> [width] [height] [fullPage]
import { chromium } from "@playwright/test";
const [url, out, w = "1440", h = "900", full = "1"] = process.argv.slice(2);
const exe = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: full === "1" });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log("overflowX:", overflow, "errors:", errors.slice(0, 5));
await browser.close();
