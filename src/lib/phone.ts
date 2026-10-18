/**
 * Saudi mobile numbers: accepts 05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX, +9665XXXXXXXX,
 * 009665XXXXXXXX and Arabic-Indic digits. Returns E.164 (+9665XXXXXXXX) or null.
 */
export function normalizeSaudiMobile(input: string): string | null {
  const digits = input
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[^\d+]/g, "");
  let local: string | null = null;
  if (/^\+9665\d{8}$/.test(digits)) local = digits.slice(4);
  else if (/^009665\d{8}$/.test(digits)) local = digits.slice(5);
  else if (/^9665\d{8}$/.test(digits)) local = digits.slice(3);
  else if (/^05\d{8}$/.test(digits)) local = digits.slice(1);
  else if (/^5\d{8}$/.test(digits)) local = digits;
  return local ? `+966${local}` : null;
}

/** +966512345678 → 0512 345 678 (display) */
export function formatSaudiMobile(e164: string): string {
  const m = /^\+966(5\d)(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** Mask for customer-facing views: 05•• ••• 678 */
export function maskPhone(e164: string): string {
  const local = e164.replace(/^\+966/, "0");
  return local.slice(0, 2) + "•• ••• " + local.slice(-3);
}
