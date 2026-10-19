import "server-only";
import { and, eq, or, isNull, gt } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema } from "@/lib/db";
import { getAllSettings, type Settings } from "@/services/settings";
import { availablePaymentMethods } from "@/services/payments/registry";
import { formatSAR } from "@/lib/money";
import type { Locale } from "@/i18n/config";
import { brand } from "@/config/brand";

export type PublicDocument = { kind: string; titleAr: string; titleEn: string; number: string };

export type Shell = {
  settings: Settings;
  storeName: string;
  announcements: string[];
  /** Logos shown only when the online gateway is really configured */
  paymentBadges: string[];
  onlinePaymentsLive: boolean;
  codEnabled: boolean;
  publicDocuments: PublicDocument[];
};

const METHOD_LABELS: Record<string, { ar: string; en: string }> = {
  mada: { ar: "مدى", en: "mada" },
  visa: { ar: "Visa", en: "Visa" },
  mastercard: { ar: "Mastercard", en: "Mastercard" },
  applepay: { ar: "Apple Pay", en: "Apple Pay" },
  stcpay: { ar: "STC Pay", en: "STC Pay" },
};

/** Document is shown publicly only while it is marked valid AND not past its expiry date. */
export function isDocumentCurrentlyValid(d: { status: string; expiresAt: Date | null }, now = new Date()) {
  return d.status === "valid_per_admin" && (!d.expiresAt || d.expiresAt > now);
}

/** Everything the store chrome needs, loaded once per request. */
export const getShell = cache(async (locale: Locale): Promise<Shell> => {
  const db = await getDb();
  const now = new Date();
  const [settings, activeCoupons, docs] = await Promise.all([
    getAllSettings(db),
    db
      .select()
      .from(schema.coupons)
      .where(
        and(
          eq(schema.coupons.active, true),
          eq(schema.coupons.showInBanner, true),
          or(isNull(schema.coupons.endsAt), gt(schema.coupons.endsAt, now)),
        ),
      ),
    db.select().from(schema.businessDocuments).where(and(eq(schema.businessDocuments.showPublicly, true), eq(schema.businessDocuments.status, "valid_per_admin"))),
  ]);

  const methods = availablePaymentMethods(settings.payments);
  const online = methods.some((m) => m.id === "moyasar");
  const cod = methods.some((m) => m.id === "cod");
  const badges = [
    ...(online ? settings.payments.advertisedMethods.map((m) => METHOD_LABELS[m]![locale]) : []),
    ...(methods.some((m) => m.id === "tabby") ? [locale === "ar" ? "تابي" : "Tabby"] : []),
    ...(methods.some((m) => m.id === "tamara") ? [locale === "ar" ? "تمارا" : "Tamara"] : []),
  ];

  const items: string[] = [];
  for (const a of settings.announcements.items) if (a.active) items.push(locale === "ar" ? a.textAr : a.textEn);
  if (settings.announcements.showShippingInfo) {
    const s = settings.shipping;
    if (s.freeOverHalalas !== null) {
      items.push(locale === "ar" ? `شحن مجاني للطلبات من ${formatSAR(s.freeOverHalalas, "ar")}` : `Free shipping on orders from ${formatSAR(s.freeOverHalalas, "en")}`);
    } else if (s.rateSource === "flat") {
      items.push(locale === "ar" ? `الشحن داخل المملكة ${formatSAR(s.flatRateHalalas, "ar")}` : `Shipping in Saudi Arabia ${formatSAR(s.flatRateHalalas, "en")}`);
    }
    const eta = locale === "ar" ? s.etaAr : s.etaEn;
    if (eta) items.push(locale === "ar" ? `التوصيل خلال ${eta}` : `Delivery in ${eta}`);
  }
  if (settings.announcements.showPaymentMethods) {
    if (badges.length) items.push((locale === "ar" ? "ادفع بـ " : "Pay with ") + badges.join(locale === "ar" ? "، " : ", "));
    if (cod) items.push(locale === "ar" ? "الدفع عند الاستلام متاح" : "Cash on delivery available");
  }
  if (settings.announcements.showCoupons) {
    for (const c of activeCoupons) {
      if (c.startsAt && c.startsAt > now) continue;
      if (c.usageLimit !== null && c.usedCount >= c.usageLimit) continue;
      const desc = locale === "ar" ? c.descriptionAr : c.descriptionEn;
      items.push(locale === "ar" ? `استخدم الكود ${c.code}${desc ? ` — ${desc}` : ""}` : `Use code ${c.code}${desc ? ` — ${desc}` : ""}`);
    }
  }

  const storeName = (locale === "ar" ? settings.store.nameAr : settings.store.nameEn) || brand.name;

  return {
    settings,
    storeName,
    announcements: items,
    paymentBadges: badges,
    onlinePaymentsLive: online,
    codEnabled: cod,
    publicDocuments: docs
      .filter((d) => isDocumentCurrentlyValid(d, now) && d.number)
      .map((d) => ({ kind: d.kind, titleAr: d.titleAr, titleEn: d.titleEn, number: d.number! })),
  };
});
