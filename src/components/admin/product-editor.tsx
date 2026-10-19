"use client";
import { useActionState, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowUp, ArrowDown, ImagePlus, LoaderCircle, TriangleAlert } from "lucide-react";
import { saveProduct } from "@/features/admin/product-actions";
import { SubmitButton, FormMessage, type ActionState } from "./ui";
import type { ProductInput } from "@/schemas/product";
import { cn } from "@/lib/utils";
import { Product3D } from "@/components/product/product-3d";
import { I18nProvider } from "@/components/i18n-provider";
import { AiCopyPanel } from "./ai-copy";
import ar from "@/i18n/ar";

type Row = Record<string, string | boolean | number | null | undefined>;
type ColDef = { key: string; label: string; type?: "text" | "textarea" | "check"; dir?: "ltr" | "rtl"; width?: string };

function Rows({ title, hint, rows, setRows, cols, blank }: { title: string; hint?: string; rows: Row[]; setRows: (r: Row[]) => void; cols: ColDef[]; blank: Row }) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const c = [...rows];
    [c[i], c[j]] = [c[j]!, c[i]!];
    setRows(c);
  };
  return (
    <fieldset className="rounded-2xl border border-paper-2 bg-white p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {hint ? <p className="mb-3 text-xs text-metal-500">{hint}</p> : null}
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2 rounded-xl bg-paper/60 p-2">
            <div className="grid flex-1 gap-2 md:grid-cols-2">
              {cols.map((c) =>
                c.type === "check" ? (
                  <label key={c.key} className="flex items-center gap-2 text-sm md:col-span-2">
                    <input type="checkbox" checked={Boolean(r[c.key])} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, [c.key]: e.target.checked } : x)))} />
                    {c.label}
                  </label>
                ) : c.type === "textarea" ? (
                  <textarea key={c.key} aria-label={c.label} placeholder={c.label} dir={c.dir} rows={2} value={String(r[c.key] ?? "")} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, [c.key]: e.target.value } : x)))} className="field min-h-0 py-2 text-sm" />
                ) : (
                  <input key={c.key} aria-label={c.label} placeholder={c.label} dir={c.dir} value={String(r[c.key] ?? "")} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, [c.key]: e.target.value } : x)))} className="field min-h-10 py-2 text-sm" />
                ),
              )}
            </div>
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => move(i, -1)} className="rounded p-1 text-metal-500 hover:bg-paper-2" aria-label="أعلى"><ArrowUp size={14} /></button>
              <button type="button" onClick={() => move(i, 1)} className="rounded p-1 text-metal-500 hover:bg-paper-2" aria-label="أسفل"><ArrowDown size={14} /></button>
              <button type="button" onClick={() => setRows(rows.filter((_, k) => k !== i))} className="rounded p-1 text-danger hover:bg-danger/10" aria-label="حذف"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setRows([...rows, { ...blank }])} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-volt"><Plus size={15} /> إضافة</button>
    </fieldset>
  );
}

type Variant = NonNullable<ProductInput["variants"]>[number];
type Media = NonNullable<ProductInput["media"]>[number];

export function ProductEditor({ initial, categories, aiEnabled = false }: { initial: ProductInput & { id?: string }; categories: { id: string; nameAr: string }[]; aiEnabled?: boolean }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await saveProduct(prev, fd);
    if (res?.ok && res.id && !p.id) router.replace(`/admin/products/${res.id}?saved=1`);
    else if (res?.ok) router.refresh();
    return res;
  }, null);

  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setP((x) => ({ ...x, [k]: v }));
  const text = (k: keyof ProductInput, label: string, opts: { dir?: "ltr" | "rtl"; area?: boolean; rows?: number; max?: number; hint?: string } = {}) => (
    <div>
      <label className="label" htmlFor={`p-${String(k)}`}>{label}</label>
      {opts.area ? (
        <textarea id={`p-${String(k)}`} dir={opts.dir} rows={opts.rows ?? 3} maxLength={opts.max} value={String(p[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} className="field" />
      ) : (
        <input id={`p-${String(k)}`} dir={opts.dir} maxLength={opts.max} value={String(p[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} className="field" />
      )}
      {opts.hint ? <p className="mt-1 text-xs text-metal-500">{opts.hint}</p> : null}
      {state?.errors?.[String(k)] ? <p className="mt-1 text-xs text-danger">{state.errors[String(k)]}</p> : null}
    </div>
  );

  const variants = p.variants ?? [];
  const media = p.media ?? [];
  const setVariant = (i: number, patch: Partial<Variant>) => set("variants", variants.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  const setMedia = (m: Media[]) => set("media", m);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadErr(null);
    const added: Media[] = [];
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/admin/uploads", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { url?: string; width?: number; height?: number; error?: string };
      if (res.ok && data.url) added.push({ url: data.url, kind: "image", altAr: p.nameAr ?? "", altEn: p.nameEn ?? "", width: data.width ?? null, height: data.height ?? null, placeholder: false });
      else setUploadErr(data.error === "too_large" ? "الصورة أكبر من 8MB." : "الملف ليس صورة مدعومة (JPG, PNG, WebP, AVIF).");
    }
    setMedia([...media, ...added]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const unverified = (p.specs ?? []).some((s) => !s.verified);
  const modelRef = useRef<HTMLInputElement>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelErr, setModelErr] = useState<string | null>(null);
  const uploadModel = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setModelBusy(true);
    setModelErr(null);
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch("/api/admin/uploads?kind=model", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.ok && data.url) set("model3d", data.url);
    else setModelErr(data.error === "too_large" ? "الملف أكبر من 15MB." : "الملف يجب أن يكون نموذج glTF ثنائي (.glb).");
    setModelBusy(false);
    if (modelRef.current) modelRef.current.value = "";
  };
  const model = p.model3d ?? "";
  const builtinOptions = [
    { v: "builtin:magcharge", l: "شاحن مغناطيسي (مدمج)" },
    { v: "builtin:scalp-massager", l: "مدلّك الرأس (مدمج)" },
    { v: "builtin:smart-wallet", l: "المحفظة الذكية (مدمج)" },
  ];

  return (
    <form action={action} className="space-y-6" data-testid="product-editor">
      <input type="hidden" name="payload" value={JSON.stringify(p)} />

      <div className="sticky top-14 z-20 -mx-4 flex flex-wrap items-center gap-3 border-b border-paper-2 bg-paper/95 px-4 py-3 backdrop-blur lg:top-0 md:-mx-8 md:px-8">
        <select value={p.status} onChange={(e) => set("status", e.target.value as ProductInput["status"])} className="field min-h-10 w-auto py-1.5 text-sm" aria-label="حالة النشر">
          <option value="draft">مسودة (غير منشور)</option>
          <option value="published">منشور</option>
          <option value="archived">مؤرشف</option>
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(p.featured)} onChange={(e) => set("featured", e.target.checked)} /> منتج رئيسي (يظهر في الصفحة الرئيسية)</label>
        <div className="ms-auto flex items-center gap-3">
          <FormMessage state={state} />
          <SubmitButton data-testid="save-product">حفظ المنتج</SubmitButton>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="space-y-4 rounded-2xl border border-paper-2 bg-white p-5">
            <h2 className="font-semibold">المعلومات الأساسية</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {text("nameAr", "اسم المنتج (عربي)", { max: 120 })}
              {text("nameEn", "اسم المنتج (إنجليزي)", { dir: "ltr", max: 120 })}
              {text("slug", "الرابط المختصر", { dir: "ltr", max: 80, hint: "يظهر في الرابط: /products/magcharge-76" })}
              <div>
                <label className="label" htmlFor="p-cat">التصنيف</label>
                <select id="p-cat" value={p.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value || null)} className="field">
                  <option value="">بدون تصنيف</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
                </select>
                <a href="/admin/categories" target="_blank" className="mt-1 inline-block text-xs text-volt">إضافة أو تعديل التصنيفات</a>
              </div>
              {text("taglineAr", "العنوان التسويقي (عربي)", { max: 160 })}
              {text("taglineEn", "العنوان التسويقي (إنجليزي)", { dir: "ltr", max: 160 })}
              {text("shortAr", "الوصف المختصر (عربي)", { area: true, max: 500 })}
              {text("shortEn", "الوصف المختصر (إنجليزي)", { area: true, dir: "ltr", max: 500 })}
            </div>
            {text("descriptionAr", "الوصف الطويل (عربي)", { area: true, rows: 6, hint: "سطر فارغ = فقرة جديدة. ## عنوان. - نقطة." })}
            {text("descriptionEn", "الوصف الطويل (إنجليزي)", { area: true, rows: 6, dir: "ltr" })}
          </section>

          <section className="space-y-3 rounded-2xl border border-paper-2 bg-white p-5">
            <h2 className="flex items-center gap-2 font-semibold">الكاتب الذكي <span className="rounded-full bg-volt/10 px-2 py-0.5 text-xs font-normal text-volt">Gemini</span></h2>
            <AiCopyPanel
              enabled={aiEnabled}
              nameAr={p.nameAr ?? ""}
              nameEn={p.nameEn ?? ""}
              onApply={(c, mode) =>
                setP((x) => {
                  const pick = (cur: string | undefined, next: string) => (mode === "replace" ? next || cur || "" : cur?.trim() ? cur : next);
                  return {
                    ...x,
                    taglineAr: pick(x.taglineAr, c.taglineAr),
                    taglineEn: pick(x.taglineEn, c.taglineEn),
                    shortAr: pick(x.shortAr, c.shortAr),
                    shortEn: pick(x.shortEn, c.shortEn),
                    descriptionAr: pick(x.descriptionAr, c.descriptionAr),
                    descriptionEn: pick(x.descriptionEn, c.descriptionEn),
                    highlights: mode === "replace" || !(x.highlights ?? []).length ? c.highlights : x.highlights,
                    faqs: mode === "replace" || !(x.faqs ?? []).length ? c.faqs : x.faqs,
                  };
                })
              }
            />
          </section>

          <section className="space-y-4 rounded-2xl border border-paper-2 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">الإصدارات والأسعار والمخزون</h2>
              <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-volt" onClick={() => set("variants", [...variants, { sku: "", nameAr: "", nameEn: "", price: "", compareAt: "", stock: 0, trackInventory: true, lowStockThreshold: 5, weightGrams: null, lengthMm: null, widthMm: null, heightMm: null, active: true }])}>
                <Plus size={15} /> إصدار جديد
              </button>
            </div>
            <p className="text-xs text-metal-500">الأسعار بالريال السعودي. «السعر قبل الخصم» يُعرض فقط إذا كان أعلى من السعر الحالي.</p>
            {variants.map((v, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-paper-2 p-4" data-testid="variant-row">
                <div className="grid gap-3 md:grid-cols-4">
                  <div><label className="label">SKU</label><input dir="ltr" value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} className="field" /></div>
                  <div><label className="label">اسم الإصدار (عربي)</label><input value={v.nameAr ?? ""} onChange={(e) => setVariant(i, { nameAr: e.target.value })} className="field" placeholder="مثال: أسود" /></div>
                  <div><label className="label">اسم الإصدار (إنجليزي)</label><input dir="ltr" value={v.nameEn ?? ""} onChange={(e) => setVariant(i, { nameEn: e.target.value })} className="field" /></div>
                  <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active ?? true} onChange={(e) => setVariant(i, { active: e.target.checked })} /> مفعّل</label></div>
                  <div><label className="label">السعر (ر.س)</label><input dir="ltr" inputMode="decimal" value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} className="field" data-testid="variant-price" /></div>
                  <div><label className="label">السعر قبل الخصم</label><input dir="ltr" inputMode="decimal" value={v.compareAt ?? ""} onChange={(e) => setVariant(i, { compareAt: e.target.value })} className="field" placeholder="اختياري" /></div>
                  <div><label className="label">المخزون</label><input dir="ltr" type="number" min={0} value={v.stock as number} onChange={(e) => setVariant(i, { stock: Number(e.target.value) })} className="field" data-testid="variant-stock" /></div>
                  <div><label className="label">تنبيه المخزون عند</label><input dir="ltr" type="number" min={0} value={(v.lowStockThreshold as number) ?? 5} onChange={(e) => setVariant(i, { lowStockThreshold: Number(e.target.value) })} className="field" /></div>
                  <div><label className="label">الوزن (غرام)</label><input dir="ltr" type="number" min={0} value={(v.weightGrams as number) ?? ""} onChange={(e) => setVariant(i, { weightGrams: e.target.value === "" ? null : Number(e.target.value) })} className="field" /></div>
                  <div><label className="label">الطول (مم)</label><input dir="ltr" type="number" min={0} value={(v.lengthMm as number) ?? ""} onChange={(e) => setVariant(i, { lengthMm: e.target.value === "" ? null : Number(e.target.value) })} className="field" /></div>
                  <div><label className="label">العرض (مم)</label><input dir="ltr" type="number" min={0} value={(v.widthMm as number) ?? ""} onChange={(e) => setVariant(i, { widthMm: e.target.value === "" ? null : Number(e.target.value) })} className="field" /></div>
                  <div><label className="label">الارتفاع (مم)</label><input dir="ltr" type="number" min={0} value={(v.heightMm as number) ?? ""} onChange={(e) => setVariant(i, { heightMm: e.target.value === "" ? null : Number(e.target.value) })} className="field" /></div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.trackInventory ?? true} onChange={(e) => setVariant(i, { trackInventory: e.target.checked })} /> تتبّع المخزون (يمنع البيع بعد النفاد)</label>
                  {variants.length > 1 ? <button type="button" className="text-sm text-danger" onClick={() => set("variants", variants.filter((_, k) => k !== i))}>حذف الإصدار</button> : null}
                </div>
              </div>
            ))}
          </section>

          <Rows title="أبرز المزايا" rows={(p.highlights ?? []) as Row[]} setRows={(r) => set("highlights", r as never)} blank={{ ar: "", en: "" }} cols={[{ key: "ar", label: "بالعربية" }, { key: "en", label: "English", dir: "ltr" }]} />
          <Rows
            title="المواصفات التقنية"
            hint="لا تظهر المواصفة للعملاء في بيئة الإنتاج إلا بعد تحديد «موثقة من المصنّع»."
            rows={(p.specs ?? []) as Row[]}
            setRows={(r) => set("specs", r as never)}
            blank={{ labelAr: "", labelEn: "", valueAr: "", valueEn: "", verified: false }}
            cols={[{ key: "labelAr", label: "البند (عربي)" }, { key: "labelEn", label: "Label", dir: "ltr" }, { key: "valueAr", label: "القيمة (عربي)" }, { key: "valueEn", label: "Value", dir: "ltr" }, { key: "verified", label: "موثقة من المصنّع", type: "check" }]}
          />
          <Rows title="داخل العلبة" rows={(p.inBox ?? []) as Row[]} setRows={(r) => set("inBox", r as never)} blank={{ ar: "", en: "" }} cols={[{ key: "ar", label: "بالعربية" }, { key: "en", label: "English", dir: "ltr" }]} />
          <Rows title="التوافق" rows={(p.compatibility ?? []) as Row[]} setRows={(r) => set("compatibility", r as never)} blank={{ ar: "", en: "", verified: false }} cols={[{ key: "ar", label: "بالعربية" }, { key: "en", label: "English", dir: "ltr" }, { key: "verified", label: "مؤكد", type: "check" }]} />
          <Rows title="طريقة الاستخدام (خطوات مرتبة)" rows={(p.howToUse ?? []) as Row[]} setRows={(r) => set("howToUse", r as never)} blank={{ titleAr: "", titleEn: "", bodyAr: "", bodyEn: "" }} cols={[{ key: "titleAr", label: "العنوان" }, { key: "titleEn", label: "Title", dir: "ltr" }, { key: "bodyAr", label: "الشرح", type: "textarea" }, { key: "bodyEn", label: "Body", type: "textarea", dir: "ltr" }]} />
          <Rows title="الأسئلة المتكررة" rows={(p.faqs ?? []) as Row[]} setRows={(r) => set("faqs", r as never)} blank={{ qAr: "", qEn: "", aAr: "", aEn: "" }} cols={[{ key: "qAr", label: "السؤال" }, { key: "qEn", label: "Question", dir: "ltr" }, { key: "aAr", label: "الإجابة", type: "textarea" }, { key: "aEn", label: "Answer", type: "textarea", dir: "ltr" }]} />
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-paper-2 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">الصور</h2>
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-ink btn-sm" disabled={uploading}>
                {uploading ? <LoaderCircle size={15} className="animate-spin" /> : <ImagePlus size={15} />} رفع صور
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
            </div>
            {uploadErr ? <p className="mb-2 text-sm text-danger">{uploadErr}</p> : null}
            <p className="mb-3 text-xs text-metal-500">الصورة الأولى هي الصورة الرئيسية. تُحوّل الصور إلى WebP وتُزال منها بيانات الموقع والكاميرا.</p>
            <ul className="space-y-3">
              {media.map((m, i) => (
                <li key={m.url + i} className="flex gap-3 rounded-xl bg-paper/60 p-2">
                  <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-ink"><Image src={m.url} alt="" fill sizes="80px" className="object-cover" /></span>
                  <div className="flex-1 space-y-1.5">
                    <input value={m.altAr ?? ""} onChange={(e) => setMedia(media.map((x, k) => (k === i ? { ...x, altAr: e.target.value } : x)))} placeholder="نص بديل (عربي)" aria-label="نص بديل عربي" className="field min-h-9 py-1.5 text-sm" />
                    <input dir="ltr" value={m.altEn ?? ""} onChange={(e) => setMedia(media.map((x, k) => (k === i ? { ...x, altEn: e.target.value } : x)))} placeholder="Alt text (English)" aria-label="Alt text English" className="field min-h-9 py-1.5 text-sm" />
                    {m.placeholder ? <p className="flex items-center gap-1 text-xs text-warn"><TriangleAlert size={13} /> صورة توضيحية — استبدلها بصورة المنتج الحقيقي</p> : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button type="button" onClick={() => i > 0 && setMedia(media.map((x, k) => (k === i - 1 ? media[i]! : k === i ? media[i - 1]! : x)))} className="rounded p-1 text-metal-500 hover:bg-paper-2" aria-label="تقديم"><ArrowUp size={14} /></button>
                    <button type="button" onClick={() => i < media.length - 1 && setMedia(media.map((x, k) => (k === i + 1 ? media[i]! : k === i ? media[i + 1]! : x)))} className="rounded p-1 text-metal-500 hover:bg-paper-2" aria-label="تأخير"><ArrowDown size={14} /></button>
                    <button type="button" onClick={() => setMedia(media.filter((_, k) => k !== i))} className="rounded p-1 text-danger hover:bg-danger/10" aria-label="حذف الصورة"><Trash2 size={14} /></button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3 rounded-2xl border border-paper-2 bg-white p-5" data-testid="model-3d-section">
            <h2 className="font-semibold">المجسم ثلاثي الأبعاد</h2>
            <p className="text-xs text-metal-500">يظهر بدل الصور في الصفحة الرئيسية وصفحة المنتج. اختر نموذجًا مدمجًا أو ارفع ملف .glb للمنتج الحقيقي (من المصنّع أو مصمم ثلاثي الأبعاد).</p>
            <select value={model.startsWith("builtin:") || model === "" ? model : "custom"} onChange={(e) => e.target.value !== "custom" && set("model3d", e.target.value)} className="field" aria-label="المجسم">
              <option value="">بدون مجسم (صور فقط)</option>
              {builtinOptions.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              {model && !model.startsWith("builtin:") ? <option value="custom">ملف مرفوع: {model.split("/").pop()}</option> : null}
            </select>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => modelRef.current?.click()} className="btn btn-ghost btn-sm" disabled={modelBusy}>
                {modelBusy ? <LoaderCircle size={15} className="animate-spin" /> : null} رفع ملف .glb
              </button>
              <input ref={modelRef} type="file" accept=".glb,model/gltf-binary" className="hidden" onChange={(e) => uploadModel(e.target.files)} />
              {modelErr ? <span className="text-sm text-danger">{modelErr}</span> : null}
            </div>
            {model ? (
              <I18nProvider locale="ar" dict={ar}>
                <Product3D key={model} source={model} poster={media[0]?.url ?? null} alt={p.nameAr ?? ""} className="aspect-square rounded-xl bg-paper" />
              </I18nProvider>
            ) : null}
            {state?.errors?.model3d ? <p className="text-xs text-danger">{state.errors.model3d}</p> : null}
          </section>

          <section className="space-y-4 rounded-2xl border border-paper-2 bg-white p-5">
            <h2 className="font-semibold">الضمان</h2>
            {text("warrantyAr", "سياسة الضمان (عربي)", { area: true, hint: "اتركه فارغًا إذا لم يكن هناك ضمان موثق — لن يظهر قسم الضمان." })}
            {text("warrantyEn", "Warranty (English)", { area: true, dir: "ltr" })}
          </section>

          <section className="space-y-4 rounded-2xl border border-paper-2 bg-white p-5">
            <h2 className="font-semibold">محركات البحث (SEO)</h2>
            {text("seoTitleAr", "عنوان الصفحة (عربي)", { max: 70, hint: `${(p.seoTitleAr ?? "").length}/70` })}
            {text("seoTitleEn", "Page title (English)", { dir: "ltr", max: 70 })}
            {text("seoDescAr", "الوصف (عربي)", { area: true, max: 170, hint: `${(p.seoDescAr ?? "").length}/170` })}
            {text("seoDescEn", "Description (English)", { area: true, dir: "ltr", max: 170 })}
            {text("keywords", "كلمات البحث والمرادفات", { area: true, rows: 2, hint: "تُستخدم في بحث المتجر الداخلي، مثل: شاحن مغناطيسي magsafe" })}
            <div className="grid gap-4 md:grid-cols-3">
              {text("brand", "العلامة التجارية", { max: 80 })}
              {text("gtin", "GTIN / الباركود", { dir: "ltr" })}
              {text("mpn", "MPN", { dir: "ltr" })}
            </div>
          </section>

          {unverified ? (
            <p className={cn("flex gap-2 rounded-2xl bg-warn/10 p-4 text-sm text-warn")}>
              <TriangleAlert size={18} className="shrink-0" /> بعض المواصفات غير موثقة؛ لن تظهر للعملاء في بيئة الإنتاج.
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
