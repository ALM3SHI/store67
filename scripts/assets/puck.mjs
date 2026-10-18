// Shared SVG building blocks for MagCharge 76 illustrative renders
export const defs = `
<defs>
  <radialGradient id="alu" cx="35%" cy="30%" r="80%">
    <stop offset="0" stop-color="#f4f6f8"/><stop offset=".45" stop-color="#c9ced5"/><stop offset=".8" stop-color="#8d949e"/><stop offset="1" stop-color="#5d646e"/>
  </radialGradient>
  <linearGradient id="aluEdge" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#e9ecef"/><stop offset=".5" stop-color="#9aa1aa"/><stop offset="1" stop-color="#4a515b"/>
  </linearGradient>
  <radialGradient id="face" cx="40%" cy="35%" r="75%">
    <stop offset="0" stop-color="#2a3240"/><stop offset=".7" stop-color="#151b24"/><stop offset="1" stop-color="#0b0f15"/>
  </radialGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset=".55" stop-color="#58d8ef" stop-opacity="0"/><stop offset=".72" stop-color="#58d8ef" stop-opacity=".55"/><stop offset=".8" stop-color="#58d8ef" stop-opacity=".12"/><stop offset="1" stop-color="#58d8ef" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="stage" cx="50%" cy="45%" r="70%">
    <stop offset="0" stop-color="#1d2635"/><stop offset=".6" stop-color="#0f141c"/><stop offset="1" stop-color="#0a0e14"/>
  </radialGradient>
  <radialGradient id="paperStage" cx="50%" cy="40%" r="75%">
    <stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#f1efea"/><stop offset="1" stop-color="#e4e1da"/>
  </radialGradient>
  <linearGradient id="cable" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#2a313b"/><stop offset=".5" stop-color="#3b4450"/><stop offset="1" stop-color="#1c222a"/>
  </linearGradient>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>
  <filter id="blur6" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
  <pattern id="weave" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="10" height="10" fill="#262d36"/><rect width="5" height="10" fill="#2f3741"/>
  </pattern>
</defs>`;

/** Top-down puck centred at (cx,cy) radius r */
export function puckTop(cx, cy, r, { led = true } = {}) {
  return `
  <g>
    <circle cx="${cx}" cy="${cy + r * 0.06}" r="${r * 1.02}" fill="#000" opacity=".35" filter="url(#soft)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#aluEdge)"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.965}" fill="url(#alu)"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.86}" fill="#0d1218"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.845}" fill="url(#face)"/>
    ${led ? `<circle cx="${cx}" cy="${cy}" r="${r * 0.9}" fill="none" stroke="#58d8ef" stroke-width="${r * 0.012}" opacity=".9"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 1.25}" fill="url(#glow)"/>` : ""}
    <circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="none" stroke="#ffffff" stroke-opacity=".05" stroke-width="2"/>
    <g opacity=".55" font-family="Readex Pro, Arial" text-anchor="middle" fill="#9aa3ae">
      <text x="${cx}" y="${cy + r * 0.07}" font-size="${r * 0.2}" font-weight="500" letter-spacing="${r * 0.012}">76</text>
    </g>
    <path d="M ${cx - r * 0.7} ${cy - r * 0.35} A ${r * 0.8} ${r * 0.8} 0 0 1 ${cx + r * 0.2} ${cy - r * 0.78}" stroke="#fff" stroke-opacity=".10" stroke-width="${r * 0.05}" fill="none" stroke-linecap="round"/>
  </g>`;
}
