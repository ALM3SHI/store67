import "server-only";
import { emailConfigured, telegramConfigured } from "@/services/notify";
import { countWithoutTwoFactor } from "@/services/two-factor";
import { and, eq, gte, inArray, lte, sql, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getAllSettings } from "@/services/settings";
import { paymentIntegrationStatus } from "@/services/payments/registry";
import { shippingIntegrationStatus } from "@/services/shipping/registry";
import { env } from "@/config/env";
import { isDocumentCurrentlyValid } from "@/services/storefront";

const PAID = ["paid", "partially_refunded", "cod_collected"] as const;

export async function dashboardStats(now = new Date()) {
  const db = await getDb();
  const since30 = new Date(now.getTime() - 29 * 86400000);
  since30.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const [[totals], [todayRow], byStatus, daily, lowStock, needsAction] = await Promise.all([
    db
      .select({
        orders: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(case when ${schema.orders.paymentStatus} in ('paid','partially_refunded','cod_collected') then ${schema.orders.totalHalalas} - 0 else 0 end),0)::int`,
        paidOrders: sql<number>`count(*) filter (where ${schema.orders.paymentStatus} in ('paid','partially_refunded','cod_collected'))::int`,
      })
      .from(schema.orders),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.orders).where(gte(schema.orders.createdAt, today)),
    db.select({ status: schema.orders.status, n: sql<number>`count(*)::int` }).from(schema.orders).groupBy(schema.orders.status),
    db
      .select({
        day: sql<string>`to_char(${schema.orders.createdAt} at time zone 'Asia/Riyadh', 'YYYY-MM-DD')`,
        revenue: sql<number>`coalesce(sum(${schema.orders.totalHalalas}),0)::int`,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.orders)
      .where(and(gte(schema.orders.createdAt, since30), inArray(schema.orders.paymentStatus, [...PAID, "cod_pending"])))
      .groupBy(sql`1`),
    db
      .select({ id: schema.productVariants.id, sku: schema.productVariants.sku, stock: schema.productVariants.stock, threshold: schema.productVariants.lowStockThreshold, productId: schema.products.id, name: schema.products.nameAr })
      .from(schema.productVariants)
      .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
      .where(and(eq(schema.productVariants.trackInventory, true), eq(schema.productVariants.active, true), lte(schema.productVariants.stock, schema.productVariants.lowStockThreshold), sql`${schema.products.status} <> 'archived'`)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.orders).where(inArray(schema.orders.status, ["confirmed", "processing"])),
  ]);

  const days: { day: string; revenue: number; n: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(since30.getTime() + i * 86400000);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d);
    const row = daily.find((x) => x.day === key);
    days.push({ day: key, revenue: row?.revenue ?? 0, n: row?.n ?? 0 });
  }

  const recent = await db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)).limit(6);

  return {
    orders: totals?.orders ?? 0,
    paidOrders: totals?.paidOrders ?? 0,
    revenue: totals?.revenue ?? 0,
    today: todayRow?.n ?? 0,
    needsAction: needsAction[0]?.n ?? 0,
    byStatus,
    days,
    lowStock,
    recent,
  };
}

export type ReadinessItem = { key: string; label: string; ok: boolean; hint: string; href: string };

/** Launch checklist — what must be real before taking real orders. */
export async function launchReadiness(): Promise<ReadinessItem[]> {
  const db = await getDb();
  const [settings, docs, pages, media, products, tf] = await Promise.all([
    getAllSettings(db),
    db.select().from(schema.businessDocuments),
    db.select().from(schema.pages),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.productMedia).where(eq(schema.productMedia.placeholder, true)),
    db.select({ specs: schema.products.specs, warrantyAr: schema.products.warrantyAr }).from(schema.products).where(eq(schema.products.status, "published")),
    countWithoutTwoFactor(db),
  ]);
  const pay = paymentIntegrationStatus();
  const ship = shippingIntegrationStatus();
  const unverifiedSpecs = products.some((p) => p.specs.some((s) => !s.verified));
  const validDocs = docs.filter((d) => isDocumentCurrentlyValid(d));
  const expired = docs.filter((d) => d.status === "valid_per_admin" && d.expiresAt && d.expiresAt <= new Date());
  return [
    { key: "env", label: "بيئة الإنتاج مضبوطة (APP_ENV, APP_URL, SESSION_SECRET, DATABASE_URL)", ok: env.appEnv === "production" && Boolean(env.sessionSecret && env.databaseUrl) && env.appUrl.startsWith("https://"), hint: "تُضبط في متغيرات البيئة لدى منصة الاستضافة.", href: "/admin/settings#integrations" },
    { key: "payments", label: "بوابة الدفع الإلكتروني مربوطة (Moyasar)", ok: pay.moyasar || settings.payments.codEnabled, hint: pay.moyasar ? "المفاتيح موجودة — اختبر دفعة تجريبية قبل الإطلاق." : "أضف MOYASAR_SECRET_KEY وMOYASAR_WEBHOOK_SECRET، أو فعّل الدفع عند الاستلام.", href: "/admin/settings#payments" },
    { key: "test_gateway", label: "بوابة الاختبار مغلقة", ok: !pay.test, hint: "احذف PAYMENTS_TEST_GATEWAY من بيئة الإنتاج.", href: "/admin/settings#integrations" },
    { key: "shipping", label: "أسعار الشحن ومدة التوصيل مراجعة", ok: settings.launch.shippingReviewed, hint: ship.aramex ? "أرامكس مربوط — راجع الأسعار وفعّل الحساب الحي." : "الشحن يدوي حاليًا بسعر ثابت. راجع السعر وأكّد المراجعة.", href: "/admin/settings#shipping" },
    { key: "prices", label: "أسعار المنتجات مراجعة", ok: settings.launch.pricesReviewed, hint: "السعر الحالي أولي. راجعه ثم أكّد المراجعة في الإعدادات.", href: "/admin/products" },
    { key: "product_data", label: "مواصفات المنتج موثقة من المصنّع", ok: !unverifiedSpecs && settings.launch.productDataReviewed, hint: "المواصفات غير الموثقة لا تظهر للعملاء في الإنتاج. وثّقها أو احذفها.", href: "/admin/products" },
    { key: "images", label: "صور المنتج الحقيقية مرفوعة", ok: (media[0]?.n ?? 0) === 0, hint: "الصور الحالية توضيحية. ارفع صور المنتج الفعلي.", href: "/admin/products" },
    { key: "policies", label: "صفحات السياسات مراجعة", ok: pages.every((p) => p.reviewed), hint: `${pages.filter((p) => !p.reviewed).length} صفحة لم تُراجع بعد.`, href: "/admin/pages" },
    { key: "docs", label: "الوثائق التجارية مدخلة وسارية", ok: validDocs.length > 0 && expired.length === 0, hint: expired.length ? `${expired.length} وثيقة منتهية الصلاحية.` : "أدخل السجل التجاري وتوثيق المتجر.", href: "/admin/documents" },
    { key: "storage", label: "تخزين الصور سحابي (Supabase Storage)", ok: env.storage.driver === "supabase", hint: "على Vercel لا يبقى القرص المحلي؛ اضبط STORAGE_DRIVER=supabase.", href: "/admin/settings#integrations" },
    { key: "email", label: "بريد العملاء مهيأ (Resend)", ok: emailConfigured() && settings.notifications.customerEmails, hint: "أضف RESEND_API_KEY و EMAIL_FROM حتى يصل العميل تأكيد الطلب ورقم التتبع.", href: "/admin/settings#notifications" },
    { key: "alerts", label: "تنبيهات الطلبات الجديدة تصلك", ok: settings.notifications.newOrderAlerts && (telegramConfigured() || (emailConfigured() && settings.notifications.adminEmails !== "")), hint: "اربط تيليجرام أو أضف بريد الفريق ثم أرسل تنبيهًا تجريبيًا.", href: "/admin/settings#notifications" },
    { key: "2fa", label: "التحقق بخطوتين مفعّل لكل حسابات الإدارة", ok: tf.total > 0 && tf.enabled === tf.total, hint: `${tf.total - tf.enabled} حساب بدون تحقق بخطوتين. فعّله من «حسابي والأمان».`, href: "/admin/account" },
    { key: "contact", label: "بيانات التواصل مدخلة", ok: Boolean(settings.store.contactEmail || settings.store.contactPhone || settings.store.whatsapp), hint: "أضف بريدًا أو هاتفًا أو واتساب.", href: "/admin/settings#store" },
  ];
}
