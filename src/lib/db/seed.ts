/**
 * Idempotent starter data: one product, its category, default settings and
 * policy page drafts. Re-running never overwrites what the admin has edited.
 *
 *   npm run db:seed
 */
import { eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { settingSchemas } from "@/services/settings";

const IMG = "/products/magcharge-76";

export async function seedDatabase(db: Db, log: (m: string) => void = () => {}) {

  // ── Settings: insert defaults only when missing
  for (const key of Object.keys(settingSchemas) as (keyof typeof settingSchemas)[]) {
    const value = settingSchemas[key].parse(key === "theme" ? { heroImageUrl: "/products/magcharge-76/cutout.webp" } : {});
    await db.insert(schema.settings).values({ key, value }).onConflictDoNothing();
  }

  // ── Category
  await db.insert(schema.categories).values({ slug: "charging", nameAr: "الشحن", nameEn: "Charging", sort: 1 }).onConflictDoNothing();
  const [cat] = await db.select().from(schema.categories).where(eq(schema.categories.slug, "charging"));

  // ── Product
  const [existing] = await db.select().from(schema.products).where(eq(schema.products.slug, "magcharge-76"));
  if (!existing) {
    const [p] = await db
      .insert(schema.products)
      .values({
        slug: "magcharge-76",
        status: "published",
        featured: true,
        categoryId: cat?.id ?? null,
        brand: "STORE 76",
        nameAr: "MagCharge 76",
        nameEn: "MagCharge 76",
        taglineAr: "قرّبه من جوالك، ويبدأ الشحن.",
        taglineEn: "Bring it close. Charging starts.",
        shortAr: "شاحن لاسلكي مغناطيسي بحجم الكف. يثبت خلف الجوال في موضعه الصحيح، فلا تبحث عن المنفذ ولا تتشابك الأسلاك على مكتبك.",
        shortEn: "A palm-sized magnetic wireless charger. It snaps into place on the back of your phone — no hunting for the port, no tangled cables on your desk.",
        descriptionAr:
          "صممنا MagCharge 76 ليختفي في يومك: قرص معدني نحيف يلتصق بظهر الجوال بالمغناطيس، فيبقى في مكانه وأنت تمسك الجوال أو تضعه على المكتب.\n\nالحلقة الضوئية حول القرص تخبرك أن الشحن بدأ، ثم تخفت حتى لا تزعجك ليلًا. وكابل USB‑C المضفّر مثبت بالشاحن، فلا قطعة إضافية تضيع منك.",
        descriptionEn:
          "MagCharge 76 is designed to disappear into your day: a slim metal puck that snaps to the back of your phone and stays put whether you're holding it or it's lying on your desk.\n\nThe light ring tells you charging has started, then dims so it won't bother you at night. The braided USB‑C cable is attached, so there's no extra piece to lose.",
        highlights: [
          { ar: "يثبت بالمغناطيس في الموضع الصحيح للشحن", en: "Magnetically snaps into the right charging position" },
          { ar: "جسم معدني نحيف يسهل حمله", en: "Slim metal body that travels easily" },
          { ar: "كابل USB‑C مضفّر مثبت بالشاحن", en: "Attached braided USB‑C cable" },
          { ar: "حلقة ضوئية تبيّن بدء الشحن ثم تخفت", en: "Light ring confirms charging, then dims" },
        ],
        specs: [
          { labelAr: "نوع الشحن", labelEn: "Charging type", valueAr: "لاسلكي مغناطيسي", valueEn: "Magnetic wireless", verified: false },
          { labelAr: "أقصى قدرة", labelEn: "Max output", valueAr: "حتى 15 واط حسب الجهاز والمحوّل", valueEn: "Up to 15W depending on device and adapter", verified: false },
          { labelAr: "المدخل", labelEn: "Input", valueAr: "USB‑C", valueEn: "USB‑C", verified: false },
          { labelAr: "طول الكابل", labelEn: "Cable length", valueAr: "1 متر", valueEn: "1 m", verified: false },
          { labelAr: "الخامة", labelEn: "Materials", valueAr: "ألمنيوم وسطح ناعم", valueEn: "Aluminium with soft-touch face", verified: false },
        ],
        inBox: [
          { ar: "شاحن MagCharge 76 مع الكابل", en: "MagCharge 76 with attached cable" },
          { ar: "دليل استخدام مختصر", en: "Quick start guide" },
        ],
        compatibility: [
          { ar: "الجوالات التي تدعم الشحن اللاسلكي المغناطيسي", en: "Phones that support magnetic wireless charging", verified: false },
        ],
        howToUse: [
          { titleAr: "صِل الكابل", titleEn: "Plug it in", bodyAr: "صِل كابل USB‑C بمحوّل طاقة مناسب.", bodyEn: "Connect the USB‑C cable to a suitable power adapter." },
          { titleAr: "قرّب الجوال", titleEn: "Bring your phone close", bodyAr: "ضع القرص على ظهر الجوال وسيثبت في موضعه.", bodyEn: "Place the puck on the back of your phone and it snaps into place." },
          { titleAr: "تابع الحلقة", titleEn: "Watch the ring", bodyAr: "تضيء الحلقة عند بدء الشحن ثم تخفت تدريجيًا.", bodyEn: "The ring lights up when charging starts, then gradually dims." },
        ],
        faqs: [
          {
            qAr: "هل محوّل الطاقة مرفق؟",
            qEn: "Is a power adapter included?",
            aAr: "لا، يأتي الشاحن مع كابله فقط. استخدم محوّل USB‑C مناسبًا.",
            aEn: "No, the charger comes with its cable only. Use a suitable USB‑C adapter.",
          },
          {
            qAr: "هل يعمل مع غطاء الجوال؟",
            qEn: "Does it work through a case?",
            aAr: "يعمل مع الأغطية الرقيقة الداعمة للشحن المغناطيسي. الأغطية السميكة أو المعدنية قد تمنع الشحن.",
            aEn: "It works with thin cases that support magnetic charging. Thick or metal cases may prevent charging.",
          },
          {
            qAr: "كيف أعرف أن الجوال يشحن؟",
            qEn: "How do I know my phone is charging?",
            aAr: "تضيء الحلقة حول الشاحن، ويظهر رمز الشحن على شاشة الجوال.",
            aEn: "The ring around the charger lights up, and your phone shows the charging icon.",
          },
          {
            qAr: "متى يصل طلبي؟",
            qEn: "When will my order arrive?",
            aAr: "تظهر مدة التوصيل التقديرية وتكلفة الشحن قبل الدفع، ويمكنك متابعة الشحنة من صفحة الطلب.",
            aEn: "Estimated delivery time and shipping cost are shown before you pay, and you can follow the shipment from your order page.",
          },
        ],
        warrantyAr: "",
        warrantyEn: "",
        seoTitleAr: "MagCharge 76 — شاحن لاسلكي مغناطيسي",
        seoTitleEn: "MagCharge 76 — Magnetic wireless charger",
        seoDescAr: "شاحن لاسلكي مغناطيسي نحيف يثبت خلف الجوال. اطلبه من STORE 76 مع توصيل داخل المملكة.",
        seoDescEn: "A slim magnetic wireless charger that snaps to your phone. Order from STORE 76 with delivery across Saudi Arabia.",
        keywords: "شاحن لاسلكي مغناطيسي ماغ سيف magsafe wireless charger magnetic شاحن جوال ايفون",
      })
      .returning();

    await db.insert(schema.productVariants).values({
      productId: p!.id,
      sku: "S76-MC-GRA",
      nameAr: "جرافيت",
      nameEn: "Graphite",
      options: { color: "graphite" },
      priceHalalas: 14900,
      stock: 40,
      lowStockThreshold: 5,
      weightGrams: 180,
      lengthMm: 120,
      widthMm: 120,
      heightMm: 40,
    });

    const media = [
      ["hero", "MagCharge 76 على منصة داكنة مع حلقة الضوء", "MagCharge 76 on a dark stage with its light ring"],
      ["on-phone", "MagCharge 76 مثبت خلف جوال", "MagCharge 76 attached to the back of a phone"],
      ["top", "منظر علوي لشاحن MagCharge 76", "Top view of MagCharge 76"],
      ["side", "منظر جانبي يوضح نحافة MagCharge 76", "Side view showing the slim MagCharge 76"],
      ["in-box", "محتويات علبة MagCharge 76", "What's in the MagCharge 76 box"],
    ] as const;
    await db.insert(schema.productMedia).values(
      media.map(([file, altAr, altEn], i) => ({
        productId: p!.id,
        url: `${IMG}/${file}.webp`,
        altAr,
        altEn,
        width: 1600,
        height: 1600,
        placeholder: true,
        sort: i,
      })),
    );
    log("✓ product MagCharge 76");
  }

  // ── Policy pages (drafts the owner must review)
  const pages = [
    {
      slug: "shipping",
      titleAr: "الشحن والتوصيل",
      titleEn: "Shipping & delivery",
      bodyAr:
        "## التغطية\nنوصل الطلبات داخل المملكة العربية السعودية إلى المدن المتاحة في صفحة الدفع.\n\n## التكلفة والمدة\nتظهر تكلفة الشحن ومدة التوصيل التقديرية قبل تأكيد الطلب، وتُحسب على الخادم بحسب إعدادات المتجر الحالية.\n\n## تتبع الشحنة\nعند شحن طلبك يظهر رقم التتبع في صفحة الطلب، ويمكنك أيضًا تتبعه من صفحة «تتبع الطلب» برقم الطلب ورقم الجوال.\n\n## استلام الطلب\nيرجى التأكد من صحة العنوان ورقم الجوال حتى يتمكن المندوب من التواصل معك.",
      bodyEn:
        "## Coverage\nWe deliver within Saudi Arabia to the cities available at checkout.\n\n## Cost and timing\nShipping cost and estimated delivery time are shown before you confirm your order and are calculated on the server from the store's current settings.\n\n## Tracking\nOnce your order ships, its tracking number appears on your order page. You can also track it from the “Track order” page using your order number and mobile number.\n\n## Receiving your order\nPlease make sure your address and mobile number are correct so the courier can reach you.",
    },
    {
      slug: "returns",
      titleAr: "الاستبدال والاسترجاع",
      titleEn: "Returns & exchanges",
      bodyAr:
        "## مدة الاسترجاع\nيمكنك طلب الاسترجاع خلال المدة المحددة في إعدادات المتجر من تاريخ الاستلام، بشرط أن يكون المنتج بحالته الأصلية ومع جميع ملحقاته.\n\n## المنتجات المعيبة\nإذا وصلك المنتج معيبًا أو مختلفًا عن طلبك، تواصل معنا وسنرتب الاستبدال أو الاسترجاع.\n\n## طريقة الاسترجاع\nتواصل معنا برقم الطلب، وسنرسل لك خطوات الإرجاع. يُعاد المبلغ بنفس طريقة الدفع بعد فحص المنتج.\n\n## المبالغ المستردة\nتختلف مدة ظهور المبلغ في حسابك بحسب البنك أو وسيلة الدفع.",
      bodyEn:
        "## Return window\nYou can request a return within the period set in the store's settings from the delivery date, provided the product is in its original condition with all accessories.\n\n## Defective items\nIf your product arrives defective or different from what you ordered, contact us and we'll arrange an exchange or refund.\n\n## How to return\nContact us with your order number and we'll send you the return steps. Refunds go back to the original payment method after inspection.\n\n## Refund timing\nHow long a refund takes to appear depends on your bank or payment method.",
    },
    {
      slug: "privacy",
      titleAr: "سياسة الخصوصية",
      titleEn: "Privacy policy",
      bodyAr:
        "## البيانات التي نجمعها\nنجمع البيانات اللازمة لتنفيذ طلبك فقط: الاسم ورقم الجوال والعنوان والبريد الإلكتروني إن أدخلته.\n\n## بيانات الدفع\nتُدخل بيانات البطاقة لدى بوابة الدفع مباشرة، ولا يحفظها المتجر.\n\n## مشاركة البيانات\nنشارك بيانات التوصيل مع شركة الشحن، وبيانات الدفع اللازمة مع بوابة الدفع، لغرض تنفيذ الطلب فقط.\n\n## أدوات القياس\nلا نفعّل أدوات القياس والإعلانات إلا بعد موافقتك، ويمكنك تغيير اختيارك بمسح ملفات تعريف الارتباط.\n\n## حقوقك\nيمكنك طلب الاطلاع على بياناتك أو تصحيحها أو حذفها بالتواصل معنا.",
      bodyEn:
        "## Data we collect\nWe collect only what's needed to fulfil your order: your name, mobile number, address and email if you provide it.\n\n## Payment data\nCard details are entered on the payment gateway directly and are never stored by the store.\n\n## Sharing\nWe share delivery details with the carrier and the required payment details with the payment gateway, only to fulfil your order.\n\n## Analytics\nAnalytics and advertising tools are enabled only after your consent. You can change your choice by clearing cookies.\n\n## Your rights\nYou can ask to access, correct or delete your data by contacting us.",
    },
    {
      slug: "terms",
      titleAr: "الشروط والأحكام",
      titleEn: "Terms & conditions",
      bodyAr:
        "## الطلبات\nيُعد الطلب مؤكدًا بعد تأكيد الدفع من بوابة الدفع، أو بعد قبول طلب الدفع عند الاستلام.\n\n## الأسعار\nالأسعار بالريال السعودي، ويُحسب الإجمالي النهائي على الخادم قبل الدفع شاملًا الشحن والضريبة إن انطبقت.\n\n## التوفر\nإذا تعذّر توفير منتج بعد الطلب، نتواصل معك ونسترد المبلغ كاملًا.\n\n## التواصل\nلأي استفسار تواصل معنا عبر صفحة «تواصل معنا».",
      bodyEn:
        "## Orders\nAn order is confirmed once payment is confirmed by the payment gateway, or once a cash-on-delivery order is accepted.\n\n## Prices\nPrices are in Saudi riyals. The final total is calculated on the server before payment, including shipping and VAT where applicable.\n\n## Availability\nIf a product can't be supplied after you order, we'll contact you and refund the full amount.\n\n## Contact\nFor any question, reach us through the “Contact us” page.",
    },
    {
      slug: "contact",
      titleAr: "تواصل معنا",
      titleEn: "Contact us",
      bodyAr: "يسعدنا مساعدتك في أي سؤال عن المنتجات أو الطلبات. اذكر رقم طلبك إن وُجد ليسهل علينا خدمتك.",
      bodyEn: "We're happy to help with any question about products or orders. Include your order number if you have one so we can help faster.",
    },
    {
      slug: "business",
      titleAr: "المعلومات التجارية",
      titleEn: "Business information",
      bodyAr: "البيانات التجارية الموثقة للمتجر كما أدخلها مالك المتجر.",
      bodyEn: "The store's business details as entered by the store owner.",
    },
  ];
  for (const p of pages) await db.insert(schema.pages).values(p).onConflictDoNothing();

  // ── Business document placeholders (status: missing)
  const [anyDoc] = await db.select({ id: schema.businessDocuments.id }).from(schema.businessDocuments).limit(1);
  if (!anyDoc) {
    await db.insert(schema.businessDocuments).values([
      { kind: "cr", titleAr: "السجل التجاري", titleEn: "Commercial registration", status: "missing" },
      { kind: "ecommerce_auth", titleAr: "توثيق المتجر الإلكتروني", titleEn: "E-commerce store authentication", status: "missing" },
      { kind: "vat", titleAr: "شهادة التسجيل في ضريبة القيمة المضافة", titleEn: "VAT registration certificate", status: "missing" },
    ]);
  }

  log("✓ seed complete");
}
