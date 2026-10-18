import sharp from "sharp";
import fs from "node:fs";
import { defs, puckTop } from "./puck.mjs";

const OUT = process.argv[2];
const S = 1600;
const svg = (body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${defs}<rect width="${S}" height="${S}" fill="${bg}"/>${body}</svg>`;

// 1 — hero: dark stage, puck in perspective with field rings
const hero = svg(`
  <g fill="none" stroke="#58d8ef">
    <ellipse cx="800" cy="860" rx="700" ry="300" stroke-opacity=".08"/>
    <ellipse cx="800" cy="860" rx="580" ry="248" stroke-opacity=".13"/>
    <ellipse cx="800" cy="860" rx="470" ry="200" stroke-opacity=".2"/>
  </g>
  <ellipse cx="800" cy="930" rx="470" ry="90" fill="#000" opacity=".7" filter="url(#soft)"/>
  <path d="M 1180 880 C 1330 940, 1420 1060, 1600 1120" stroke="url(#cable)" stroke-width="34" fill="none" stroke-linecap="round"/>
  <path d="M 1180 880 C 1330 940, 1420 1060, 1600 1120" stroke="url(#weave)" stroke-width="24" fill="none" stroke-linecap="round" opacity=".7"/>
  <g transform="translate(800 800) scale(1 .5) translate(-800 -800)">
    <circle cx="800" cy="900" r="430" fill="#3b424c"/>
    <circle cx="800" cy="880" r="430" fill="#6b727c"/>
    <circle cx="800" cy="860" r="430" fill="#878e98"/>
    ${puckTop(800, 800, 430)}
  </g>
`, "url(#stage)");

// transparent cut-out (top view with glowing ring) for the CSS hero stage
const cutout = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${defs}${puckTop(800, 800, 520)}</svg>`;

// 2 — top view on porcelain
const top = svg(`${puckTop(800, 780, 470, { led: false })}
  <path d="M 800 1250 C 800 1350, 760 1450, 700 1600" stroke="url(#cable)" stroke-width="36" fill="none" stroke-linecap="round"/>
  <path d="M 800 1250 C 800 1350, 760 1450, 700 1600" stroke="url(#weave)" stroke-width="26" fill="none" stroke-linecap="round" opacity=".7"/>
  <rect x="770" y="1228" width="60" height="44" rx="10" fill="#9aa1aa"/>`, "url(#paperStage)");

// 3 — side profile showing slim body
const side = svg(`
  <ellipse cx="800" cy="905" rx="520" ry="40" fill="#000" opacity=".22" filter="url(#soft)"/>
  <rect x="300" y="780" width="1000" height="110" rx="55" fill="url(#aluEdge)"/>
  <rect x="300" y="772" width="1000" height="26" rx="13" fill="#11161d"/>
  <rect x="340" y="770" width="920" height="6" rx="3" fill="#58d8ef" opacity=".0"/>
  <rect x="300" y="820" width="1000" height="6" fill="#ffffff" opacity=".35"/>
  <rect x="1290" y="815" width="60" height="44" rx="8" fill="#9aa1aa"/>
  <path d="M 1350 837 C 1430 837, 1480 900, 1600 960" stroke="url(#cable)" stroke-width="34" fill="none" stroke-linecap="round"/>
  <path d="M 1350 837 C 1430 837, 1480 900, 1600 960" stroke="url(#weave)" stroke-width="24" fill="none" stroke-linecap="round" opacity=".7"/>
  <g stroke="#7d8591" stroke-width="3" fill="none">
    <path d="M 240 772 L 240 890"/><path d="M 225 772 L 255 772"/><path d="M 225 890 L 255 890"/>
  </g>`, "url(#paperStage)");

// 4 — attached to the back of a generic phone
const phone = svg(`
  <g transform="rotate(-12 800 800)">
    <rect x="455" y="160" width="690" height="1300" rx="110" fill="#000" opacity=".3" filter="url(#soft)" transform="translate(30 40)"/>
    <rect x="455" y="160" width="690" height="1300" rx="110" fill="#c8ccd2"/>
    <rect x="465" y="170" width="670" height="1280" rx="100" fill="#dfe2e6"/>
    <rect x="520" y="230" width="560" height="150" rx="75" fill="#c3c7cd"/>
    <circle cx="600" cy="305" r="44" fill="#1b2128"/><circle cx="720" cy="305" r="44" fill="#1b2128"/><circle cx="840" cy="305" r="30" fill="#1b2128"/>
    <circle cx="600" cy="305" r="20" fill="#2d3846"/><circle cx="720" cy="305" r="20" fill="#2d3846"/><circle cx="960" cy="305" r="12" fill="#f1e8c9"/>
    ${puckTop(800, 860, 300)}
    <path d="M 800 1160 C 800 1300, 860 1420, 900 1700" stroke="url(#cable)" stroke-width="30" fill="none" stroke-linecap="round"/>
    <path d="M 800 1160 C 800 1300, 860 1420, 900 1700" stroke="url(#weave)" stroke-width="22" fill="none" stroke-linecap="round" opacity=".7"/>
  </g>`, "url(#paperStage)");

// 5 — in the box flat lay
const box = svg(`
  ${puckTop(620, 700, 320, { led: false })}
  <path d="M 1050 380 C 1350 380, 1380 640, 1150 700 C 920 760, 980 1000, 1240 1020 C 1420 1035, 1400 1250, 1180 1260" stroke="url(#cable)" stroke-width="28" fill="none" stroke-linecap="round"/>
  <path d="M 1050 380 C 1350 380, 1380 640, 1150 700 C 920 760, 980 1000, 1240 1020 C 1420 1035, 1400 1250, 1180 1260" stroke="url(#weave)" stroke-width="20" fill="none" stroke-linecap="round" opacity=".7"/>
  <rect x="1010" y="360" width="56" height="40" rx="8" fill="#9aa1aa"/>
  <rect x="1150" y="1240" width="56" height="40" rx="8" fill="#9aa1aa"/>
  <g transform="rotate(-4 560 1240)">
    <rect x="350" y="1120" width="420" height="260" rx="14" fill="#000" opacity=".12" filter="url(#blur6)" transform="translate(8 10)"/>
    <rect x="350" y="1120" width="420" height="260" rx="14" fill="#fbfaf8"/>
    <rect x="390" y="1170" width="140" height="18" rx="9" fill="#0a0e14"/>
    <rect x="390" y="1215" width="300" height="10" rx="5" fill="#b9bec6"/>
    <rect x="390" y="1240" width="260" height="10" rx="5" fill="#b9bec6"/>
    <rect x="390" y="1265" width="280" height="10" rx="5" fill="#b9bec6"/>
    <circle cx="710" cy="1330" r="16" fill="none" stroke="#2d63f5" stroke-width="5"/>
  </g>`, "url(#paperStage)");

const shots = { "cutout": cutout, "hero": hero, "top": top, "side": side, "on-phone": phone, "in-box": box };
fs.mkdirSync(OUT, { recursive: true });
for (const [name, s] of Object.entries(shots)) {
  await sharp(Buffer.from(s)).webp({ quality: 86, alphaQuality: 90 }).toFile(`${OUT}/${name}.webp`);
  console.log(name, fs.statSync(`${OUT}/${name}.webp`).size);
}
