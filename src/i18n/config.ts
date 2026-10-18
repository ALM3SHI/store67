export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ar";

export function isLocale(v: string | undefined | null): v is Locale {
  return v === "ar" || v === "en";
}
export function asLocale(v: string | undefined | null): Locale {
  return isLocale(v) ? v : defaultLocale;
}
export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");
