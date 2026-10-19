import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
  primaryKey,
} from "drizzle-orm/pg-core";

/* ───────────────────────── Enums */
export const adminRole = pgEnum("admin_role", ["owner", "manager", "support"]);
export const productStatus = pgEnum("product_status", ["draft", "published", "archived"]);
export const orderStatus = pgEnum("order_status", [
  "pending_payment", // created, waiting for the gateway
  "confirmed", // paid online, or COD accepted
  "processing", // being prepared
  "shipped",
  "delivered",
  "cancelled",
  "payment_failed",
  "refunded",
]);
export const paymentStatus = pgEnum("payment_status", [
  "initiated",
  "pending",
  "paid",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
  "cod_pending",
  "cod_collected",
]);
export const shipmentStatus = pgEnum("shipment_status", [
  "pending",
  "created",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "returned",
  "cancelled",
]);
export const couponType = pgEnum("coupon_type", ["percent", "fixed", "free_shipping"]);
export const documentStatus = pgEnum("document_status", ["missing", "needs_review", "valid_per_admin"]);
export const reviewStatus = pgEnum("review_status", ["pending", "approved", "rejected"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/* ───────────────────────── Shared JSON shapes */
export type Localized = { ar: string; en: string };
export type SpecRow = { labelAr: string; labelEn: string; valueAr: string; valueEn: string; verified: boolean };
export type FaqRow = { qAr: string; qEn: string; aAr: string; aEn: string };
export type StepRow = { titleAr: string; titleEn: string; bodyAr: string; bodyEn: string };
export type ShippingAddress = {
  city: string;
  district: string;
  street: string;
  nationalAddress?: string; // Saudi short national address, e.g. RRRD2929
  postalCode?: string;
  buildingNumber?: string;
  notes?: string;
};

/* ───────────────────────── Admin & auth */
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: adminRole("role").notNull().default("support"),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  /** Encrypted TOTP secret (set during setup, active once totpEnabledAt is set) */
  totpSecret: text("totp_secret"),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  /** Last accepted time step — a code can't be used twice */
  totpLastStep: integer("totp_last_step"),
  /** sha256 hashes of unused recovery codes */
  recoveryCodes: jsonb("recovery_codes").$type<string[]>().notNull().default([]),
  ...timestamps,
});

export const adminSessions = pgTable(
  "admin_sessions",
  {
    /** sha256 of the opaque cookie token — the raw token is never stored */
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_sessions_user_idx").on(t.userId)],
);

/** One-time password reset links. Only the sha256 of the token is stored. */
export const adminPasswordResets = pgTable(
  "admin_password_resets",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_password_resets_user_idx").on(t.userId)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => adminUsers.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)],
);

/* ───────────────────────── Store configuration */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pages = pgTable("pages", {
  slug: text("slug").primaryKey(),
  titleAr: text("title_ar").notNull(),
  titleEn: text("title_en").notNull(),
  bodyAr: text("body_ar").notNull().default(""),
  bodyEn: text("body_en").notNull().default(""),
  published: boolean("published").notNull().default(true),
  /** Set when the owner has reviewed the text — drives the launch checklist */
  reviewed: boolean("reviewed").notNull().default(false),
  ...timestamps,
});

export const businessDocuments = pgTable("business_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(), // cr | vat | ecommerce_auth | municipal | other
  titleAr: text("title_ar").notNull(),
  titleEn: text("title_en").notNull(),
  number: text("number"),
  issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  status: documentStatus("status").notNull().default("missing"),
  /** Key inside the PRIVATE storage bucket; never served publicly */
  fileKey: text("file_key"),
  fileName: text("file_name"),
  notes: text("notes"),
  /** Show the number on the public business-info page (only while valid) */
  showPublicly: boolean("show_publicly").notNull().default(false),
  ...timestamps,
});

/* ───────────────────────── Catalog */
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  sort: integer("sort").notNull().default(0),
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    status: productStatus("status").notNull().default("draft"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    featured: boolean("featured").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    brand: text("brand"),
    gtin: text("gtin"),
    mpn: text("mpn"),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    taglineAr: text("tagline_ar").notNull().default(""),
    taglineEn: text("tagline_en").notNull().default(""),
    shortAr: text("short_ar").notNull().default(""),
    shortEn: text("short_en").notNull().default(""),
    descriptionAr: text("description_ar").notNull().default(""),
    descriptionEn: text("description_en").notNull().default(""),
    highlights: jsonb("highlights").$type<Localized[]>().notNull().default([]),
    specs: jsonb("specs").$type<SpecRow[]>().notNull().default([]),
    inBox: jsonb("in_box").$type<Localized[]>().notNull().default([]),
    compatibility: jsonb("compatibility").$type<{ ar: string; en: string; verified: boolean }[]>().notNull().default([]),
    howToUse: jsonb("how_to_use").$type<StepRow[]>().notNull().default([]),
    faqs: jsonb("faqs").$type<FaqRow[]>().notNull().default([]),
    warrantyAr: text("warranty_ar").notNull().default(""),
    warrantyEn: text("warranty_en").notNull().default(""),
    seoTitleAr: text("seo_title_ar"),
    seoTitleEn: text("seo_title_en"),
    seoDescAr: text("seo_desc_ar"),
    seoDescEn: text("seo_desc_en"),
    /** Extra search terms / synonyms, space or comma separated */
    keywords: text("keywords").notNull().default(""),
    /** 3D model: "builtin:<key>" (procedural model shipped with the store) or a URL to a .glb file */
    model3d: text("model3d"),
    ...timestamps,
  },
  (t) => [index("products_status_idx").on(t.status)],
);

export const productMedia = pgTable(
  "product_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("image"), // image | video
    url: text("url").notNull(),
    altAr: text("alt_ar").notNull().default(""),
    altEn: text("alt_en").notNull().default(""),
    width: integer("width"),
    height: integer("height"),
    /** Illustrative renders shipped with the starter — flagged until replaced by real photos */
    placeholder: boolean("placeholder").notNull().default(false),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("product_media_product_idx").on(t.productId)],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull().unique(),
    nameAr: text("name_ar").notNull().default(""),
    nameEn: text("name_en").notNull().default(""),
    /** e.g. { color: "graphite" } — empty for the default variant */
    options: jsonb("options").$type<Record<string, string>>().notNull().default({}),
    /** All money is stored as integer halalas (1 SAR = 100 halalas) */
    priceHalalas: integer("price_halalas").notNull(),
    compareAtHalalas: integer("compare_at_halalas"),
    stock: integer("stock").notNull().default(0),
    trackInventory: boolean("track_inventory").notNull().default(true),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    weightGrams: integer("weight_grams"),
    lengthMm: integer("length_mm"),
    widthMm: integer("width_mm"),
    heightMm: integer("height_mm"),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("variants_product_idx").on(t.productId),
    check("variants_price_positive", sql`${t.priceHalalas} >= 0`),
    check("variants_stock_nonneg", sql`${t.stock} >= 0`),
    check("variants_compare_gt_price", sql`${t.compareAtHalalas} IS NULL OR ${t.compareAtHalalas} > ${t.priceHalalas}`),
  ],
);

export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  variantId: uuid("variant_id")
    .notNull()
    .references(() => productVariants.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(), // order | release | adjust | restock
  orderId: uuid("order_id"),
  actorId: uuid("actor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull(),
    rating: integer("rating").notNull(),
    body: text("body").notNull(),
    status: reviewStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("reviews_rating_range", sql`${t.rating} BETWEEN 1 AND 5`),
    uniqueIndex("reviews_order_product_uq").on(t.orderId, t.productId),
  ],
);

/* ───────────────────────── Customers & orders */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** E.164, e.g. +9665XXXXXXXX. Empty for accounts that signed up with email only. */
    phone: text("phone").unique(),
    name: text("name").notNull(),
    email: text("email"),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    /** Set when the customer proved ownership with a one-time code (= has an account) */
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("customers_verified_email_idx").on(sql`lower(${t.email})`).where(sql`${t.emailVerifiedAt} is not null`)],
);

/** One-time login / verification codes (only a hash is stored). */
export const customerOtps = pgTable(
  "customer_otps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: text("channel").notNull(), // sms | email
    target: text("target").notNull(), // +9665… or lower-case email
    purpose: text("purpose").notNull(), // login | link
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customer_otps_target_idx").on(t.target)],
);

export const customerSessions = pgTable(
  "customer_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customer_sessions_customer_idx").on(t.customerId)],
);

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    label: text("label").notNull().default(""),
    recipientName: text("recipient_name").notNull(),
    phone: text("phone").notNull(),
    city: text("city").notNull(),
    district: text("district").notNull(),
    street: text("street").notNull(),
    nationalAddress: text("national_address").notNull().default(""),
    postalCode: text("postal_code").notNull().default(""),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("customer_addresses_customer_idx").on(t.customerId)],
);

export const customerWishlist = pgTable(
  "customer_wishlist",
  {
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    productSlug: text("product_slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.customerId, t.productSlug] })],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(),
    /** sha256 of the secret that lets a guest view this order */
    accessTokenHash: text("access_token_hash").notNull(),
    /** Client-supplied key that makes checkout submission idempotent */
    idempotencyKey: text("idempotency_key").unique(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    status: orderStatus("status").notNull().default("pending_payment"),
    paymentStatus: paymentStatus("payment_status").notNull().default("initiated"),
    paymentMethod: text("payment_method").notNull(), // moyasar | cod | test
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    shippingAddress: jsonb("shipping_address").$type<ShippingAddress>().notNull(),
    locale: text("locale").notNull().default("ar"),
    currency: text("currency").notNull().default("SAR"),
    subtotalHalalas: integer("subtotal_halalas").notNull(),
    discountHalalas: integer("discount_halalas").notNull().default(0),
    shippingHalalas: integer("shipping_halalas").notNull().default(0),
    codFeeHalalas: integer("cod_fee_halalas").notNull().default(0),
    taxHalalas: integer("tax_halalas").notNull().default(0),
    totalHalalas: integer("total_halalas").notNull(),
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    pricesIncludeTax: boolean("prices_include_tax").notNull().default(true),
    couponCode: text("coupon_code"),
    shippingMethod: text("shipping_method").notNull().default("manual"),
    customerNote: text("customer_note"),
    /** Unpaid online orders hold stock until this time */
    reservedUntil: timestamp("reserved_until", { withTimezone: true }),
    stockReleased: boolean("stock_released").notNull().default(false),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** Starts the return window */
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    /** Automatic offers applied at checkout (their total is part of discountHalalas) */
    offers: jsonb("offers").$type<{ id: string; nameAr: string; nameEn: string; amountHalalas: number }[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_created_idx").on(t.createdAt),
    index("orders_phone_idx").on(t.phone),
    check("orders_total_nonneg", sql`${t.totalHalalas} >= 0`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    sku: text("sku").notNull(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    variantNameAr: text("variant_name_ar").notNull().default(""),
    variantNameEn: text("variant_name_en").notNull().default(""),
    imageUrl: text("image_url"),
    unitPriceHalalas: integer("unit_price_halalas").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalHalalas: integer("line_total_halalas").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), check("order_items_qty_pos", sql`${t.quantity} > 0`)],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // status | note | payment | shipment | system
    message: text("message").notNull(),
    /** Internal notes are visible to staff only */
    internal: boolean("internal").notNull().default(true),
    actorId: uuid("actor_id"),
    actorName: text("actor_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId)],
);

/* ───────────────────────── Payments */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // moyasar | cod | test
    /** Gateway object reference (Moyasar invoice id, test session id, …) */
    providerRef: text("provider_ref"),
    /** Gateway payment id once known (needed for refunds) */
    providerPaymentId: text("provider_payment_id"),
    status: paymentStatus("status").notNull().default("initiated"),
    amountHalalas: integer("amount_halalas").notNull(),
    refundedHalalas: integer("refunded_halalas").notNull().default(0),
    currency: text("currency").notNull().default("SAR"),
    method: text("method"), // mada | creditcard | applepay | stcpay …
    checkoutUrl: text("checkout_url"),
    failureReason: text("failure_reason"),
    live: boolean("live").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("payments_provider_ref_uq").on(t.provider, t.providerRef), index("payments_order_idx").on(t.orderId)],
);

/** Every webhook/event we accepted — the unique key makes processing idempotent */
export const paymentEvents = pgTable(
  "payment_events",
  {
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    payload: jsonb("payload"),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.eventId] })],
);

export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payments.id, { onDelete: "cascade" }),
  amountHalalas: integer("amount_halalas").notNull(),
  reason: text("reason"),
  status: text("status").notNull(), // succeeded | failed | manual
  providerRef: text("provider_ref"),
  actorId: uuid("actor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────────────────── Shipping */
export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // aramex | manual
    carrierName: text("carrier_name"),
    trackingNumber: text("tracking_number"),
    trackingUrl: text("tracking_url"),
    labelUrl: text("label_url"),
    status: shipmentStatus("status").notNull().default("pending"),
    events: jsonb("events").$type<{ at: string; description: string; location?: string; code?: string }[]>().notNull().default([]),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("shipments_order_idx").on(t.orderId)],
);

/* ───────────────────────── Promotions */
export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stored upper-case; matched case-insensitively */
    code: text("code").notNull().unique(),
    type: couponType("type").notNull(),
    /** percent: 1–100 ; fixed: halalas ; free_shipping: ignored */
    value: integer("value").notNull().default(0),
    minSubtotalHalalas: integer("min_subtotal_halalas").notNull().default(0),
    maxDiscountHalalas: integer("max_discount_halalas"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    usageLimit: integer("usage_limit"),
    perCustomerLimit: integer("per_customer_limit"),
    usedCount: integer("used_count").notNull().default(0),
    active: boolean("active").notNull().default(true),
    /** Announce this code in the top bar */
    showInBanner: boolean("show_in_banner").notNull().default(false),
    descriptionAr: text("description_ar"),
    descriptionEn: text("description_en"),
    ...timestamps,
  },
  (t) => [check("coupons_percent_range", sql`${t.type} <> 'percent' OR (${t.value} BETWEEN 1 AND 100)`)],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("coupon_redemptions_order_uq").on(t.orderId), index("coupon_redemptions_coupon_phone_idx").on(t.couponId, t.phone)],
);

/* ───────────────────────── Notifications & monitoring */
/**
 * Every message the store sends (or decided not to send). The unique index makes
 * "order confirmed" etc. go out once even when a webhook and a redirect race.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // order_confirmed | order_shipped | order_delivered | order_cancelled | admin_new_order | password_reset | test | error_alert
    channel: text("channel").notNull(), // email | telegram
    recipient: text("recipient").notNull(),
    status: text("status").notNull(), // sending | sent | failed | skipped
    error: text("error"),
    providerId: text("provider_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notifications_once_idx").on(t.orderId, t.kind, t.channel, t.recipient),
    index("notifications_created_idx").on(t.createdAt),
  ],
);

/** Server errors grouped by fingerprint so the admin sees "what broke and how often". */
export const appErrors = pgTable(
  "app_errors",
  {
    fingerprint: text("fingerprint").primaryKey(),
    source: text("source").notNull(), // request | action | payment | shipping | cron | notify
    message: text("message").notNull(),
    detail: text("detail"),
    path: text("path"),
    count: integer("count").notNull().default(1),
    resolved: boolean("resolved").notNull().default(false),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    alertedAt: timestamp("alerted_at", { withTimezone: true }),
  },
  (t) => [index("app_errors_last_seen_idx").on(t.lastSeenAt)],
);

/**
 * "Tell me when it's back" requests. The email is kept only until the alert is
 * sent, then the row is deleted.
 */
export const stockAlerts = pgTable(
  "stock_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    locale: text("locale").notNull().default("ar"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stock_alerts_once_idx").on(t.variantId, t.email)],
);

/* ───────────────────────── Returns & exchanges */
export type ReturnItem = { orderItemId: string; quantity: number };

/**
 * A customer's request to return or exchange items from a delivered order.
 * requested → approved → received → completed, or requested → rejected,
 * or requested → cancelled (by the customer).
 */
export const returnRequests = pgTable(
  "return_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Short human reference, e.g. R-24A7K */
    number: text("number").notNull().unique(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // return | exchange
    status: text("status").notNull().default("requested"),
    reason: text("reason").notNull(),
    note: text("note").notNull().default(""),
    /** For exchanges: what the customer wants instead (size, colour…) */
    exchangeFor: text("exchange_for").notNull().default(""),
    items: jsonb("items").$type<ReturnItem[]>().notNull(),
    /** Shown to the customer with the decision */
    staffMessage: text("staff_message").notNull().default(""),
    restocked: boolean("restocked").notNull().default(false),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("return_requests_order_idx").on(t.orderId), index("return_requests_status_idx").on(t.status)],
);

/* ───────────────────────── Automatic offers */
export const promotions = pgTable("promotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  type: text("type").notNull(), // quantity | bundle
  /** quantity: products that count (empty = all); bundle: the products in the set */
  productIds: jsonb("product_ids").$type<string[]>().notNull().default([]),
  minQuantity: integer("min_quantity").notNull().default(2),
  percentOff: integer("percent_off").notNull(),
  active: boolean("active").notNull().default(true),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  ...timestamps,
});
