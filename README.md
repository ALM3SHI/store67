# STORE 76

متجر إلكتروني سعودي لمنتج إلكتروني واحد قابل للتوسع إلى مئات المنتجات: واجهة عربية RTL (مع نسخة إنجليزية)، سلة وإتمام طلب بدون حساب، لوحة إدارة محمية، طبقة دفع (Moyasar) وطبقة شحن (Aramex) قابلتان للاستبدال، وأساس SEO كامل.

> **حالة المشروع:** الكود يعمل ومختبر محليًا. الدفع الحقيقي والشحن الآلي **لا يعملان** حتى تضيف مفاتيح حساباتك لدى Moyasar وأرامكس وتختبرها (انظر [docs/LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md)). المتجر لا يدّعي غير ذلك: طرق الدفع غير المهيأة لا تظهر للعملاء.

## التشغيل محليًا (5 دقائق)

المتطلبات: Node.js 20.9 أو أحدث.

```bash
npm install
cp .env.example .env.local          # القيم الافتراضية تكفي للتطوير
npm run db:setup                     # ينشئ قاعدة بيانات محلية مدمجة (PGlite) ويضيف المنتج الأول
ADMIN_PASSWORD='اختر-كلمة-مرور-طويلة' npm run admin:create -- you@example.com "اسمك" owner
npm run dev
```

- المتجر: http://localhost:3000 (يحوّل إلى `/ar`)
- لوحة التحكم: http://localhost:3000/admin
- في التطوير تظهر «بوابة اختبار» في صفحة الدفع لتجربة الطلب كاملًا بدون أي مبلغ حقيقي.

على ويندوز (PowerShell) اضبط كلمة المرور هكذا:
```powershell
$env:ADMIN_PASSWORD='اختر-كلمة-مرور-طويلة'; npm run admin:create -- you@example.com "اسمك" owner
```

> **تنبيه OneDrive:** مجلد `node_modules` كبير جدًا، ومزامنته عبر OneDrive تبطئ الجهاز. الأفضل نقل المشروع خارج OneDrive (مثل `C:\dev\store76`) أو استبعاد `node_modules` و`.next` و`.data` من المزامنة.

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | خادم التطوير |
| `npm run build` / `npm start` | بناء ونشر نسخة الإنتاج |
| `npm run typecheck` | فحص TypeScript (وضع strict) |
| `npm run lint` | ESLint |
| `npm test` | اختبارات الوحدات والتكامل (Vitest، قاعدة بيانات في الذاكرة) |
| `npm run test:e2e` | اختبارات المتصفح الكاملة (Playwright) — تبني قاعدة جديدة وتشغّل خادم الإنتاج |
| `npm run check` | كل ما سبق عدا e2e |
| `npm run db:migrate` | تطبيق الترحيلات على `DATABASE_URL` (أو PGlite محليًا) |
| `npm run db:seed` | بيانات أولية (لا تكتب فوق تعديلاتك) |
| `npm run db:generate` | إنشاء ترحيل جديد بعد تعديل `src/lib/db/schema.ts` |
| `npm run admin:create -- email "name" role` | إنشاء مدير أو إعادة تعيين كلمة مروره |
| `npm run assets:render` | إعادة توليد الصور التوضيحية للمنتج |

لأول تشغيل لاختبارات Playwright: `npx playwright install chromium`.

## البنية

```
src/
  app/(store)/[locale]/   صفحات المتجر (ar / en): الرئيسية، المنتج، المتجر، الدفع، الطلب، التتبع، السياسات
  app/admin/              لوحة التحكم (محمية على الخادم)
  app/api/                البحث، تسعير السلة، إنشاء الطلب، إشعارات الدفع، رفع الصور، المهام المجدولة
  components/             مكونات الواجهة (المتجر والإدارة)
  config/brand.ts         ← اسم المتجر وشعاره وألوانه في مكان واحد
  features/               إجراءات الخادم (server actions)
  i18n/                   النصوص العربية والإنجليزية
  lib/                    قاعدة البيانات، الأمان، البحث العربي، SEO، المال
  schemas/                تحقق Zod المشترك بين المتصفح والخادم
  services/               منطق التجارة: التسعير، الطلبات، المخزون، الدفع، الشحن، التخزين، المساعد
drizzle/                  ترحيلات SQL (تشمل تفعيل RLS)
tests/                    unit + integration + e2e
docs/                     النشر وقائمة الإطلاق والتكاملات
```

التفاصيل التقنية والقرارات الهندسية: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
النشر وربط الخدمات: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
قائمة ما قبل الإطلاق: [docs/LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md)

## تغيير الاسم إلى STORE 67

عدّل `src/config/brand.ts` (أو اضبط `NEXT_PUBLIC_STORE_NAME="STORE 67"` و`NEXT_PUBLIC_STORE_MARK=67`). الشعار والأيقونة وعناوين الصفحات والبيانات المنظمة تتحدث تلقائيًا. ثم شغّل `NEXT_PUBLIC_STORE_MARK=67 NEXT_PUBLIC_STORE_NAME="STORE 67" node scripts/assets/brand.mjs` لتحديث ملفات `public/brand`.
