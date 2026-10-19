import "server-only";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema, type DbOrTx } from "@/lib/db";

/* Every setting group has a schema and a default. Stored values are merged over
   the defaults and validated, so adding a field never breaks old rows. */

const optionalText = z.string().trim().max(500).optional().default("");

export const storeSettingsSchema = z.object({
  nameAr: optionalText,
  nameEn: optionalText,
  contactEmail: optionalText,
  contactPhone: optionalText,
  /** International format without +, e.g. 9665XXXXXXXX. Empty hides the WhatsApp button. */
  whatsapp: z.string().trim().regex(/^(9665\d{8})?$/, "صيغة واتساب: 9665XXXXXXXX").default(""),
  addressAr: optionalText,
  addressEn: optionalText,
  supportHoursAr: optionalText,
  supportHoursEn: optionalText,
  logoUrl: optionalText,
  socials: z
    .object({
      instagram: optionalText,
      x: optionalText,
      tiktok: optionalText,
      snapchat: optionalText,
      youtube: optionalText,
    })
    .default({ instagram: "", x: "", tiktok: "", snapchat: "", youtube: "" }),
});

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const themeSettingsSchema = z.object({
  volt: hex.default("#2d63f5"),
  field: hex.default("#58d8ef"),
  heroImageUrl: optionalText,
  ogImageUrl: optionalText,
});

export const commerceSettingsSchema = z.object({
  currency: z.literal("SAR").default("SAR"),
  taxEnabled: z.boolean().default(false),
  /** basis points: 1500 = 15% */
  taxRateBps: z.number().int().min(0).max(5000).default(1500),
  pricesIncludeTax: z.boolean().default(true),
  /** Minutes an unpaid online order holds stock */
  reservationMinutes: z.number().int().min(5).max(24 * 60).default(30),
  returnsWindowDays: z.number().int().min(0).max(365).default(7),
  maxQtyPerItem: z.number().int().min(1).max(99).default(5),
});

export const shippingSettingsSchema = z.object({
  rateSource: z.enum(["flat", "aramex"]).default("flat"),
  flatRateHalalas: z.number().int().min(0).default(2500),
  /** null = no free-shipping threshold */
  freeOverHalalas: z.number().int().min(0).nullable().default(null),
  etaAr: optionalText,
  etaEn: optionalText,
  carrierName: optionalText,
  /** e.g. https://www.aramex.com/sa/ar/track/results?ShipmentNumber={tracking} */
  trackingUrlTemplate: optionalText,
  originCity: z.string().trim().default("Makkah"),
  originLine1: optionalText,
  originContactName: optionalText,
  originPhone: optionalText,
  /** Cities the store delivers to; empty = all listed Saudi cities */
  cities: z.array(z.string()).default([]),
  /** Optional per-city price / delivery time; cities not listed use the flat rate */
  cityRates: z
    .array(
      z.object({
        city: z.string().min(1),
        rateHalalas: z.number().int().min(0),
        etaAr: z.string().trim().max(60).default(""),
        etaEn: z.string().trim().max(60).default(""),
      }),
    )
    .max(200)
    .default([])
    .refine((rows) => new Set(rows.map((r) => r.city)).size === rows.length, "كل مدينة تُضاف مرة واحدة فقط"),
});

export const paymentSettingsSchema = z.object({
  onlineEnabled: z.boolean().default(true),
  /** Buy now, pay later — shown only when the provider keys are set */
  tabbyEnabled: z.boolean().default(true),
  tamaraEnabled: z.boolean().default(true),
  codEnabled: z.boolean().default(false),
  codFeeHalalas: z.number().int().min(0).default(0),
  codMaxHalalas: z.number().int().min(0).nullable().default(null),
  /** Methods to display as logos — only shown when the online gateway is configured */
  advertisedMethods: z.array(z.enum(["mada", "visa", "mastercard", "applepay", "stcpay"])).default(["mada", "visa", "mastercard", "applepay"]),
});

export const announcementSettingsSchema = z.object({
  items: z
    .array(z.object({ id: z.string(), textAr: z.string().max(160), textEn: z.string().max(160), active: z.boolean() }))
    .default([]),
  showShippingInfo: z.boolean().default(true),
  showPaymentMethods: z.boolean().default(true),
  showCoupons: z.boolean().default(true),
});

export const seoSettingsSchema = z.object({
  titleAr: optionalText,
  titleEn: optionalText,
  descriptionAr: optionalText,
  descriptionEn: optionalText,
  googleSiteVerification: optionalText,
  merchantFeedEnabled: z.boolean().default(true),
});

export const analyticsSettingsSchema = z.object({
  ga4Id: z.string().trim().regex(/^(G-[A-Z0-9]+)?$/, "GA4: G-XXXXXXX").default(""),
  metaPixelId: z.string().trim().regex(/^(\d{6,20})?$/, "Meta Pixel ID أرقام فقط").default(""),
  tiktokPixelId: z.string().trim().regex(/^([A-Z0-9]{10,30})?$/, "TikTok Pixel ID").default(""),
});

export const launchSettingsSchema = z.object({
  pricesReviewed: z.boolean().default(false),
  shippingReviewed: z.boolean().default(false),
  productDataReviewed: z.boolean().default(false),
});

export const notificationSettingsSchema = z.object({
  /** Email the customer (when they gave an email) on confirm / ship / deliver / cancel */
  customerEmails: z.boolean().default(true),
  /** SMS to the customer's mobile (costs per message — off until you turn it on) */
  customerSms: z.boolean().default(false),
  /** Comma-separated addresses that receive new-order and error alerts */
  adminEmails: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || v.split(",").every((e) => z.email().safeParse(e.trim()).success), "عناوين بريد غير صالحة (افصل بينها بفاصلة)")
    .default(""),
  /** New paid / COD order → admin email + Telegram */
  newOrderAlerts: z.boolean().default(true),
  /** Server errors → admin email + Telegram (at most once per error per hour) */
  errorAlerts: z.boolean().default(true),
});

export const settingSchemas = {
  store: storeSettingsSchema,
  theme: themeSettingsSchema,
  commerce: commerceSettingsSchema,
  shipping: shippingSettingsSchema,
  payments: paymentSettingsSchema,
  announcements: announcementSettingsSchema,
  seo: seoSettingsSchema,
  analytics: analyticsSettingsSchema,
  launch: launchSettingsSchema,
  notifications: notificationSettingsSchema,
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type Settings = { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> };

function parseGroup<K extends SettingKey>(key: K, stored: unknown): Settings[K] {
  const schemaFor = settingSchemas[key];
  const base = schemaFor.parse({});
  const merged = { ...base, ...(stored && typeof stored === "object" ? stored : {}) };
  const res = schemaFor.safeParse(merged);
  return (res.success ? res.data : base) as Settings[K];
}

export async function getSettings<K extends SettingKey>(keys: K[], db?: DbOrTx): Promise<Pick<Settings, K>> {
  const conn = db ?? (await getDb());
  const rows = await conn.select().from(schema.settings).where(inArray(schema.settings.key, keys));
  const out = {} as Pick<Settings, K>;
  for (const k of keys) out[k] = parseGroup(k, rows.find((r) => r.key === k)?.value);
  return out;
}

export async function getAllSettings(db?: DbOrTx): Promise<Settings> {
  return getSettings(Object.keys(settingSchemas) as SettingKey[], db) as Promise<Settings>;
}

export async function getSetting<K extends SettingKey>(key: K, db?: DbOrTx): Promise<Settings[K]> {
  const conn = db ?? (await getDb());
  const [row] = await conn.select().from(schema.settings).where(eq(schema.settings.key, key));
  return parseGroup(key, row?.value);
}

/** Validates and saves a whole settings group. Throws ZodError on invalid input. */
export async function saveSetting<K extends SettingKey>(key: K, value: unknown, db?: DbOrTx): Promise<Settings[K]> {
  const conn = db ?? (await getDb());
  const parsed = settingSchemas[key].parse(value) as Settings[K];
  await conn
    .insert(schema.settings)
    .values({ key, value: parsed, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: parsed, updatedAt: new Date() } });
  return parsed;
}
