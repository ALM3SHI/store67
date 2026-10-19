/**
 * Renders product images from the same procedural 3D models the store shows,
 * so 2D thumbnails (cart, search, feeds, social previews) match the 3D viewer.
 *
 *   node scripts/assets/render3d.mjs            (needs Chromium; uses PW_CHROMIUM_PATH if set)
 */
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const tmp = path.join((await import("node:os")).tmpdir(), "store76-render3d");
fs.mkdirSync(tmp, { recursive: true });
await build({ entryPoints: [path.join(root, "scripts/assets/render-entry.ts")], bundle: true, format: "iife", outfile: path.join(tmp, "render.js"), logLevel: "error" });
fs.writeFileSync(path.join(tmp, "index.html"), `<!doctype html><html><body style="margin:0;background:transparent"><script src="render.js"></script></body></html>`);

const S = 1600;
const darkBg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><defs><radialGradient id="g" cx="50%" cy="42%" r="72%"><stop offset="0" stop-color="#1d2635"/><stop offset=".6" stop-color="#0f141c"/><stop offset="1" stop-color="#0a0e14"/></radialGradient></defs><rect width="${S}" height="${S}" fill="url(#g)"/><g fill="none" stroke="#58d8ef"><ellipse cx="800" cy="1020" rx="700" ry="210" stroke-opacity=".07"/><ellipse cx="800" cy="1020" rx="560" ry="168" stroke-opacity=".11"/></g></svg>`);
const lightBg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><defs><radialGradient id="g" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#f1efea"/><stop offset="1" stop-color="#e4e1da"/></radialGradient></defs><rect width="${S}" height="${S}" fill="url(#g)"/></svg>`);

const products = {
  "magcharge-76": { source: "builtin:magcharge", shots: { hero: [0.5, 0.42, "dark"], top: [0, 1.3, "light"], side: [1.57, 0.12, "light"], angle: [2.4, 0.5, "light"] }, cutout: [0.6, 0.42] },
  "scalp-massager-76": { source: "builtin:scalp-massager", shots: { hero: [0.55, 0.32, "dark"], front: [0, 0.18, "light"], top: [0.3, 1.1, "light"], heads: [0.8, 0.02, "light"] }, cutout: [0.6, 0.42] },
  "smart-wallet-76": { source: "builtin:smart-wallet", shots: { hero: [0.6, 0.25, "dark"], front: [0, 0.1, "light"], back: [Math.PI, 0.15, "light"], side: [1.3, 0.2, "light"] }, cutout: [0.6, 0.42] },
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1600 } });
page.on("pageerror", (e) => console.error("page error:", e));
await page.goto("file://" + path.join(tmp, "index.html"));

for (const [slug, p] of Object.entries(products)) {
  const dir = path.join(root, "public/products", slug);
  fs.mkdirSync(dir, { recursive: true });
  const names = Object.keys(p.shots);
  const shots = Object.values(p.shots).map(([az, el, tone]) => ({ az, el, tone }));
  shots.push({ az: p.cutout[0], el: p.cutout[1], tone: "dark" });
  const urls = await page.evaluate(([src, s]) => window.shoot(src, s), [p.source, shots]);
  for (let i = 0; i < urls.length; i++) {
    const png = Buffer.from(urls[i].split(",")[1], "base64");
    const isCutout = i === urls.length - 1;
    const name = isCutout ? "cutout" : names[i];
    const fitted = await sharp(png).resize(Math.round(S * 0.86), Math.round(S * 0.86)).toBuffer();
    if (isCutout) {
      await sharp(png).webp({ quality: 88, alphaQuality: 90 }).toFile(path.join(dir, `${name}.webp`));
    } else {
      const bg = shots[i].tone === "dark" ? darkBg : lightBg;
      await sharp(bg).composite([{ input: fitted, gravity: "center" }]).webp({ quality: 86 }).toFile(path.join(dir, `${name}.webp`));
    }
    console.log(slug, name);
  }
}
await browser.close();
