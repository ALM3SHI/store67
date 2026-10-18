import { brand } from "@/config/brand";

/**
 * STORE 76 mark: an ink squircle holding an alignment ring — the moment a
 * magnetic charger snaps into place — with the store digits at its centre.
 * The ring's open gap carries the cyan "field" dot. Digits come from the
 * central brand config, so renaming the store re-draws the mark.
 */
export function LogoMark({ size = 36, digits = brand.markDigits, className, title }: { size?: number; digits?: string; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect width="64" height="64" rx="18" fill="var(--color-ink, #0a0e14)" />
      <circle cx="32" cy="32" r="20.5" fill="none" stroke="var(--color-metal-300, #b9bec6)" strokeWidth="2.4" strokeDasharray="112 17" strokeDashoffset="-10" strokeLinecap="round" />
      <circle cx="46.6" cy="17.6" r="3.2" fill="var(--color-field, #58d8ef)" />
      <text
        x="32"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fbfaf8"
        style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: digits.length > 2 ? 15 : 19, letterSpacing: "-0.5px" }}
      >
        {digits}
      </text>
    </svg>
  );
}

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  const [word, ...rest] = brand.name.split(" ");
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`} dir="ltr">
      <LogoMark size={34} />
      <span className={`font-display text-[1.05rem] font-semibold tracking-[0.14em] ${inverted ? "text-porcelain" : "text-ink"}`} style={{ fontFamily: "var(--font-display)" }}>
        {word}
        {rest.length ? <span className="ms-1.5 font-normal tracking-[0.06em] text-metal-500">{rest.join(" ")}</span> : null}
      </span>
    </span>
  );
}
