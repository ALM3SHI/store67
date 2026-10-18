/**
 * Arabic-aware text normalisation for in-store search:
 * removes diacritics & tatweel, unifies alef/ya/ta-marbuta/hamza forms,
 * converts Arabic-Indic digits and lower-cases Latin text.
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟۖ-ۭ]/g, "") // tashkeel
    .replace(/ـ/g, "") // tatweel
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Strip the Arabic definite article and common prefixes so "الشاحن" ≈ "شاحن", "بالمغناطيس" ≈ "مغناطيس". */
export function stemArabic(token: string): string {
  let t = token;
  if (t.length > 4 && /^(وال|بال|كال|فال)/.test(t)) t = t.slice(3);
  else if (t.length > 3 && t.startsWith("ال")) t = t.slice(2);
  else if (t.length > 4 && t.startsWith("لل")) t = t.slice(2);
  if (t.length > 4 && /(ات|ين|ون|يه)$/.test(t)) t = t.slice(0, -2);
  else if (t.length > 3 && /[هي]$/.test(t)) t = t.slice(0, -1);
  return t;
}

/** Multi-word transliterations collapsed before tokenising */
const PHRASES: [RegExp, string][] = [
  // JS \b is ASCII-only, so boundaries are written as (^|\s) … (?=\s|$)
  [/(^|\s)(ماغ|ماج|ماق|مج)\s?سيف(?=\s|$)/g, "$1magsafe"],
  [/(^|\s)mag\s+safe(?=\s|$)/g, "$1magsafe"],
  [/(^|\s)يو\s?اس\s?بي(?=\s|$)/g, "$1usb"],
];

export function tokenize(input: string): string[] {
  let text = normalizeText(input);
  for (const [re, rep] of PHRASES) text = text.replace(re, rep);
  return text
    .split(" ")
    .filter((t) => t.length > 0)
    .map(stemArabic);
}

/** Damerau–Levenshtein distance with an early-exit cap. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length]![b.length]!;
}

/** Cross-language synonyms so "شاحن" finds "charger" and vice versa. Extend freely. */
export const SYNONYMS: string[][] = [
  ["شاحن", "charger", "charging", "شحن"],
  ["مغناطيس", "مغناطيسي", "magnetic", "magsafe", "magnet", "ماغ", "ماج"],
  ["لاسلك", "لاسلكي", "wireless", "qi", "qi2"],
  ["جوال", "هاتف", "موبايل", "ايفون", "phone", "iphone", "mobile"],
  ["كيبل", "كابل", "سلك", "cable"],
  ["سماع", "سماعات", "earbuds", "headphones"],
  ["ساع", "ساعه", "watch"],
];

export function expandToken(t: string): string[] {
  const out = new Set([t]);
  for (const group of SYNONYMS) {
    const normGroup = group.map((g) => stemArabic(normalizeText(g)));
    if (normGroup.includes(t)) normGroup.forEach((g) => out.add(g));
  }
  return [...out];
}
