/**
 * Starter catalog beyond the first product. Each product is inserted only if
 * its slug doesn't exist yet, so re-running never touches admin edits.
 * Specs are marked unverified until confirmed with the manufacturer.
 */
import { eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";

type Def = {
  category: { slug: string; nameAr: string; nameEn: string; sort: number };
  product: Omit<typeof schema.products.$inferInsert, "categoryId">;
  variant: Omit<typeof schema.productVariants.$inferInsert, "productId">;
  media: [file: string, altAr: string, altEn: string][];
};

const DEFS: Def[] = [
  {
    category: { slug: "personal-care", nameAr: "العناية الشخصية", nameEn: "Personal care", sort: 2 },
    product: {
      slug: "scalp-massager-76",
      status: "published",
      featured: false,
      sort: 2,
      brand: "STORE 76",
      nameAr: "مدلّك الرأس 76",
      nameEn: "Scalp Massager 76",
      taglineAr: "أربعة رؤوس، ولمسة تريحك بعد يوم طويل.",
      taglineEn: "Four heads, one calm moment after a long day.",
      shortAr: "مدلّك كهربائي للرأس بأربعة رؤوس سيليكون مرنة تدور بلطف. يُمسك بيد واحدة ويعمل بزر واحد.",
      shortEn: "An electric scalp massager with four flexible silicone heads that rotate gently. One hand to hold, one button to run.",
      descriptionAr:
        "صُمم مدلّك الرأس 76 ليكون أبسط جهاز في يومك: قبة ناعمة تستقر في راحة يدك، وأربعة رؤوس من السيليكون تدور على فروة الرأس بحركة متناوبة.\n\nزر واحد في الأعلى يشغّله ويوقفه، والرؤوس المرنة تنثني مع شكل الرأس بدل أن تضغط عليه.",
      descriptionEn:
        "Scalp Massager 76 is designed to be the simplest device in your day: a smooth dome that rests in your palm, and four silicone heads that rotate across your scalp in alternating directions.\n\nOne button on top turns it on and off, and the flexible heads bend with the shape of your head instead of pressing into it.",
      highlights: [
        { ar: "أربعة رؤوس سيليكون مرنة تدور بالتناوب", en: "Four flexible silicone heads rotating in alternation" },
        { ar: "تشغيل وإيقاف بزر واحد", en: "One-button on and off" },
        { ar: "قبة ناعمة تُمسك بيد واحدة", en: "Smooth dome that fits one hand" },
        { ar: "رؤوس قابلة للفك للتنظيف", en: "Detachable heads for cleaning" },
      ],
      specs: [
        { labelAr: "عدد الرؤوس", labelEn: "Heads", valueAr: "4 رؤوس سيليكون", valueEn: "4 silicone heads", verified: false },
        { labelAr: "الشحن", labelEn: "Charging", valueAr: "USB‑C", valueEn: "USB‑C", verified: false },
        { labelAr: "الخامة", labelEn: "Materials", valueAr: "بلاستيك ABS ورؤوس سيليكون", valueEn: "ABS body, silicone heads", verified: false },
        { labelAr: "مقاومة الماء", labelEn: "Water resistance", valueAr: "تُحدد بعد التحقق من المصنّع", valueEn: "To be confirmed with the manufacturer", verified: false },
      ],
      inBox: [
        { ar: "جهاز مدلّك الرأس 76", en: "Scalp Massager 76" },
        { ar: "كابل شحن USB‑C", en: "USB‑C charging cable" },
        { ar: "دليل استخدام", en: "User guide" },
      ],
      compatibility: [],
      howToUse: [
        { titleAr: "اشحنه", titleEn: "Charge it", bodyAr: "اشحن الجهاز بالكامل قبل أول استخدام.", bodyEn: "Fully charge the device before first use." },
        { titleAr: "شغّله", titleEn: "Switch on", bodyAr: "اضغط الزر في الأعلى لتبدأ الرؤوس بالدوران.", bodyEn: "Press the top button to start the heads." },
        { titleAr: "حرّكه ببطء", titleEn: "Move slowly", bodyAr: "مرّره على فروة الرأس بحركة هادئة لبضع دقائق.", bodyEn: "Glide it slowly across your scalp for a few minutes." },
      ],
      faqs: [
        {
          qAr: "هل يمكن استخدامه مع الماء أو في الاستحمام؟",
          qEn: "Can I use it in the shower?",
          aAr: "لا تستخدمه مع الماء حتى تتأكد من درجة مقاومة الماء المذكورة في دليل المنتج.",
          aEn: "Don't use it with water until you've confirmed the water-resistance rating in the product guide.",
        },
        {
          qAr: "هل هو جهاز طبي؟",
          qEn: "Is it a medical device?",
          aAr: "لا، هو جهاز للاسترخاء والعناية الشخصية. توقف عن استخدامه إذا شعرت بأي إزعاج، واستشر طبيبك عند وجود مشكلة في فروة الرأس.",
          aEn: "No, it's a personal-care relaxation device. Stop if you feel any discomfort and see your doctor for any scalp condition.",
        },
        {
          qAr: "كيف أنظفه؟",
          qEn: "How do I clean it?",
          aAr: "افصل الرؤوس السيليكونية واغسلها بماء وصابون خفيف، وامسح الجسم بقطعة قماش جافة.",
          aEn: "Detach the silicone heads and wash them with mild soap and water; wipe the body with a dry cloth.",
        },
      ],
      warrantyAr: "",
      warrantyEn: "",
      seoTitleAr: "مدلّك الرأس 76 — جهاز مساج كهربائي بأربعة رؤوس",
      seoTitleEn: "Scalp Massager 76 — electric massager with four heads",
      seoDescAr: "مدلّك رأس كهربائي برؤوس سيليكون مرنة تدور بلطف، يعمل بزر واحد. اطلبه من STORE 76 مع توصيل داخل المملكة.",
      seoDescEn: "An electric scalp massager with flexible silicone heads and one-button control. Order from STORE 76 with delivery across Saudi Arabia.",
      keywords: "مساج الراس مدلك الرأس جهاز مساج فروة الرأس مساج كهربائي scalp massager head massage",
      model3d: "builtin:scalp-massager",
    },
    variant: { sku: "S76-SM-WHT", nameAr: "أبيض", nameEn: "White", options: { color: "white" }, priceHalalas: 12900, stock: 30, lowStockThreshold: 5, weightGrams: 350, lengthMm: 140, widthMm: 140, heightMm: 120 },
    media: [
      ["hero", "مدلّك الرأس 76 بأربعة رؤوس سيليكون", "Scalp Massager 76 with four silicone heads"],
      ["front", "منظر أمامي لمدلّك الرأس 76", "Front view of Scalp Massager 76"],
      ["heads", "الرؤوس السيليكونية لمدلّك الرأس 76", "The silicone heads of Scalp Massager 76"],
      ["top", "منظر علوي يوضح زر التشغيل", "Top view showing the power button"],
    ],
  },
  {
    category: { slug: "accessories", nameAr: "الإكسسوارات", nameEn: "Accessories", sort: 3 },
    product: {
      slug: "smart-wallet-76",
      status: "published",
      featured: false,
      sort: 3,
      brand: "STORE 76",
      nameAr: "المحفظة الذكية 76",
      nameEn: "Smart Wallet 76",
      taglineAr: "بطاقاتك تخرج بضغطة واحدة.",
      taglineEn: "Your cards, out in one press.",
      shortAr: "محفظة معدنية نحيفة تُخرج بطاقاتك بشكل متدرج بضغطة واحدة، مع وحدة تتبع مدمجة في ظهرها.",
      shortEn: "A slim metal wallet that fans your cards out in one press, with a tracker module built into the back.",
      descriptionAr:
        "المحفظة الذكية 76 تحمل البطاقات التي تحتاجها فعلًا، وتُخرجها لك متدرجة بضغطة على الزر السفلي، فتختار البطاقة دون أن تُفرغ المحفظة.\n\nفي ظهرها وحدة تتبع صغيرة تساعدك في الوصول إليها إذا نسيتها. تفاصيل التوافق مع تطبيقات التتبع تُنشر بعد التحقق منها.",
      descriptionEn:
        "Smart Wallet 76 carries the cards you actually use and fans them out with one press of the bottom trigger, so you pick a card without emptying the wallet.\n\nA small tracker module on the back helps you find it if you leave it behind. Tracking-app compatibility is published once verified.",
      highlights: [
        { ar: "إخراج البطاقات بضغطة واحدة", en: "Cards pop up in one press" },
        { ar: "هيكل معدني نحيف", en: "Slim metal shell" },
        { ar: "وحدة تتبع مدمجة في الظهر", en: "Tracker module built into the back" },
        { ar: "يناسب الجيب الأمامي", en: "Fits a front pocket" },
      ],
      specs: [
        { labelAr: "السعة", labelEn: "Capacity", valueAr: "حتى 6 بطاقات", valueEn: "Up to 6 cards", verified: false },
        { labelAr: "الخامة", labelEn: "Materials", valueAr: "ألمنيوم", valueEn: "Aluminium", verified: false },
        { labelAr: "حماية RFID", labelEn: "RFID blocking", valueAr: "تُحدد بعد التحقق من المصنّع", valueEn: "To be confirmed with the manufacturer", verified: false },
        { labelAr: "التتبع", labelEn: "Tracking", valueAr: "عبر تطبيق على الجوال — يُوثّق التوافق قبل الإطلاق", valueEn: "Via a phone app — compatibility confirmed before launch", verified: false },
      ],
      inBox: [
        { ar: "المحفظة الذكية 76", en: "Smart Wallet 76" },
        { ar: "دليل استخدام", en: "User guide" },
      ],
      compatibility: [],
      howToUse: [
        { titleAr: "رتّب بطاقاتك", titleEn: "Load your cards", bodyAr: "أدخل البطاقات من الأعلى حتى تستقر في القاعدة.", bodyEn: "Slide your cards in from the top until they sit on the base." },
        { titleAr: "اضغط الزر", titleEn: "Press the trigger", bodyAr: "اضغط الزر السفلي لتخرج البطاقات متدرجة.", bodyEn: "Press the bottom trigger to fan the cards out." },
        { titleAr: "أعدها", titleEn: "Push back", bodyAr: "ادفع البطاقات للأسفل لتعود إلى مكانها.", bodyEn: "Push the cards down to put them away." },
      ],
      faqs: [
        {
          qAr: "كم بطاقة تتسع؟",
          qEn: "How many cards does it hold?",
          aAr: "السعة الموثقة تظهر في المواصفات بعد التحقق من المصنّع.",
          aEn: "The confirmed capacity appears in the specifications once verified with the manufacturer.",
        },
        {
          qAr: "هل تعمل وحدة التتبع مع جوالي؟",
          qEn: "Does the tracker work with my phone?",
          aAr: "ننشر قائمة الأجهزة والتطبيقات المتوافقة بعد التحقق منها. تواصل معنا قبل الطلب إن كان التوافق مهمًا لك.",
          aEn: "We publish compatible phones and apps once verified. Contact us before ordering if compatibility matters to you.",
        },
      ],
      warrantyAr: "",
      warrantyEn: "",
      seoTitleAr: "المحفظة الذكية 76 — محفظة بطاقات معدنية بإخراج تلقائي",
      seoTitleEn: "Smart Wallet 76 — pop-up metal card wallet",
      seoDescAr: "محفظة بطاقات معدنية نحيفة تُخرج البطاقات بضغطة، مع وحدة تتبع. اطلبها من STORE 76 مع توصيل داخل المملكة.",
      seoDescEn: "A slim metal card wallet with one-press pop-up and a tracker module. Order from STORE 76 with delivery across Saudi Arabia.",
      keywords: "محفظة ذكية محفظة بطاقات محفظة معدنية محفظة تتبع smart wallet card holder tracker",
      model3d: "builtin:smart-wallet",
    },
    variant: { sku: "S76-SW-GRA", nameAr: "جرافيت", nameEn: "Graphite", options: { color: "graphite" }, priceHalalas: 18900, stock: 25, lowStockThreshold: 5, weightGrams: 90, lengthMm: 110, widthMm: 70, heightMm: 20 },
    media: [
      ["hero", "المحفظة الذكية 76 والبطاقات خارجة", "Smart Wallet 76 with cards popped up"],
      ["front", "الواجهة الأمامية للمحفظة الذكية 76", "Front of Smart Wallet 76"],
      ["back", "ظهر المحفظة مع وحدة التتبع", "Back of the wallet with the tracker module"],
      ["side", "منظر جانبي يوضح نحافة المحفظة", "Side view showing how slim the wallet is"],
    ],
  },
];

export async function seedMoreProducts(db: Db, log: (m: string) => void) {
  for (const d of DEFS) {
    await db.insert(schema.categories).values(d.category).onConflictDoNothing();
    const [cat] = await db.select().from(schema.categories).where(eq(schema.categories.slug, d.category.slug));
    const [exists] = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.slug, d.product.slug));
    if (exists) continue;
    const [p] = await db.insert(schema.products).values({ ...d.product, categoryId: cat?.id ?? null }).returning();
    await db.insert(schema.productVariants).values({ ...d.variant, productId: p!.id });
    await db.insert(schema.productMedia).values(
      d.media.map(([file, altAr, altEn], i) => ({
        productId: p!.id,
        url: `/products/${d.product.slug}/${file}.webp`,
        altAr,
        altEn,
        width: 1600,
        height: 1600,
        placeholder: true,
        sort: i,
      })),
    );
    log(`✓ product ${d.product.nameEn}`);
  }
}
