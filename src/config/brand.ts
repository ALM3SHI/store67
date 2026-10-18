/**
 * Central brand configuration — the single place to rename the store.
 *
 * Change `name` / `markDigits` (or set NEXT_PUBLIC_STORE_NAME / NEXT_PUBLIC_STORE_MARK)
 * to rebrand, e.g. "STORE 67" + "67". Logo, favicon, metadata, emails and
 * JSON-LD all read from here. Contact details and social links can also be
 * overridden at runtime from Admin → Settings (stored in the database).
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_STORE_NAME ?? "STORE 76",
  /** Digits drawn inside the logo mark and favicon */
  markDigits: process.env.NEXT_PUBLIC_STORE_MARK ?? "76",
  nameAr: process.env.NEXT_PUBLIC_STORE_NAME_AR ?? "ستور 76",
  taglineAr: "أجهزة صغيرة، مصنوعة بعناية.",
  taglineEn: "Small devices, made with care.",
  /** Order numbers are prefixed with this, e.g. S76-4K9QZ2 */
  orderPrefix: process.env.NEXT_PUBLIC_ORDER_PREFIX ?? "S76",
  colors: {
    ink: "#0a0e14",
    paper: "#f5f3ef",
    metal: "#7d8591",
    volt: "#2d63f5",
    field: "#58d8ef",
  },
  currency: "SAR",
  country: "SA",
  defaultLocale: "ar" as const,
} as const;

export type Brand = typeof brand;
