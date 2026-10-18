// Renders public/brand/logo.svg + logo.png from the brand digits (run after renaming the store)
import sharp from "sharp";
import fs from "node:fs";
const digits = process.env.NEXT_PUBLIC_STORE_MARK ?? "76";
const name = process.env.NEXT_PUBLIC_STORE_NAME ?? "STORE 76";
const mark = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">
<rect width="64" height="64" rx="18" fill="#0a0e14"/>
<circle cx="32" cy="32" r="20.5" fill="none" stroke="#b9bec6" stroke-width="2.4" stroke-dasharray="112 17" stroke-dashoffset="-10" stroke-linecap="round"/>
<circle cx="46.6" cy="17.6" r="3.2" fill="#58d8ef"/>
<text x="32" y="33" text-anchor="middle" dominant-baseline="central" fill="#fbfaf8" font-family="Readex Pro, Arial, sans-serif" font-weight="600" font-size="${digits.length > 2 ? 15 : 19}">${digits}</text>
</svg>`;
fs.mkdirSync("public/brand", { recursive: true });
fs.writeFileSync("public/brand/logo.svg", mark(512));
await sharp(Buffer.from(mark(512))).png().toFile("public/brand/logo.png");
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0a0e14"/>
<g transform="translate(140 215) scale(3.1)">${mark(64).replace(/<\/?svg[^>]*>/g, "")}</g>
<text x="400" y="345" fill="#fbfaf8" font-family="Readex Pro, Arial" font-size="84" font-weight="600" letter-spacing="12">${name}</text></svg>`;
await sharp(Buffer.from(og)).png().toFile("public/brand/og.png");
console.log("brand assets written for", name);
