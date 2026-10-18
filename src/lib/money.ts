/** Money helpers. All amounts are integer halalas (1 SAR = 100 halalas). */
export type Locale = "ar" | "en";

export function formatSAR(halalas: number, locale: Locale = "ar"): string {
  const sar = halalas / 100;
  const hasFraction = halalas % 100 !== 0;
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(sar);
  return locale === "ar" ? `${n} ر.س` : `SAR ${n}`;
}

/** Parse a user-entered SAR amount ("149", "149.5", "١٤٩") into halalas. Returns null if invalid. */
export function parseSARToHalalas(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input)
    .trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,،\s]/g, "")
    .replace("٫", ".");
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export function halalasToInput(h: number | null | undefined): string {
  if (h === null || h === undefined) return "";
  return h % 100 === 0 ? String(h / 100) : (h / 100).toFixed(2);
}

export function discountPercent(price: number, compareAt: number | null | undefined): number | null {
  if (!compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}
