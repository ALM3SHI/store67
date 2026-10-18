import ar, { type Dictionary } from "./ar";
import en from "./en";
import type { Locale } from "./config";

export type { Dictionary };
const dictionaries: Record<Locale, Dictionary> = { ar, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/** Simple `{name}` interpolation */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Pick the localized field from a record with `xxxAr` / `xxxEn` keys */
export function pick<T extends Record<string, unknown>>(row: T, base: string, locale: Locale): string {
  const key = base + (locale === "ar" ? "Ar" : "En");
  const fallback = base + (locale === "ar" ? "En" : "Ar");
  const v = row[key];
  if (typeof v === "string" && v.trim() !== "") return v;
  const f = row[fallback];
  return typeof f === "string" ? f : "";
}
