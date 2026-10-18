/** Major Saudi cities (value is the English name used for carrier APIs). */
export const SAUDI_CITIES: { en: string; ar: string }[] = [
  { en: "Riyadh", ar: "الرياض" },
  { en: "Jeddah", ar: "جدة" },
  { en: "Makkah", ar: "مكة المكرمة" },
  { en: "Madinah", ar: "المدينة المنورة" },
  { en: "Dammam", ar: "الدمام" },
  { en: "Khobar", ar: "الخبر" },
  { en: "Dhahran", ar: "الظهران" },
  { en: "Taif", ar: "الطائف" },
  { en: "Tabuk", ar: "تبوك" },
  { en: "Buraidah", ar: "بريدة" },
  { en: "Unaizah", ar: "عنيزة" },
  { en: "Khamis Mushait", ar: "خميس مشيط" },
  { en: "Abha", ar: "أبها" },
  { en: "Hail", ar: "حائل" },
  { en: "Hofuf", ar: "الهفوف" },
  { en: "Mubarraz", ar: "المبرز" },
  { en: "Jubail", ar: "الجبيل" },
  { en: "Hafar Al Batin", ar: "حفر الباطن" },
  { en: "Najran", ar: "نجران" },
  { en: "Jazan", ar: "جازان" },
  { en: "Yanbu", ar: "ينبع" },
  { en: "Al Qatif", ar: "القطيف" },
  { en: "Al Kharj", ar: "الخرج" },
  { en: "Arar", ar: "عرعر" },
  { en: "Sakaka", ar: "سكاكا" },
  { en: "Al Baha", ar: "الباحة" },
  { en: "Bisha", ar: "بيشة" },
  { en: "Al Qunfudhah", ar: "القنفذة" },
  { en: "Rabigh", ar: "رابغ" },
  { en: "Al Majmaah", ar: "المجمعة" },
  { en: "Al Zulfi", ar: "الزلفي" },
  { en: "Al Rass", ar: "الرس" },
  { en: "Dawadmi", ar: "الدوادمي" },
  { en: "Wadi Al Dawasir", ar: "وادي الدواسر" },
  { en: "Sabya", ar: "صبيا" },
  { en: "Al Ula", ar: "العلا" },
];

export function cityLabel(en: string, locale: "ar" | "en") {
  const c = SAUDI_CITIES.find((x) => x.en === en);
  return c ? c[locale] : en;
}
