"use client";
import { useState } from "react";
import { Sparkles, LoaderCircle } from "lucide-react";
import type { ProductCopy } from "@/services/ai/product-copy";

/** Drafts product copy with AI from the owner's notes; nothing changes until "Apply". */
export function AiCopyPanel({ nameAr, nameEn, enabled, onApply }: { nameAr: string; nameEn: string; enabled: boolean; onApply: (c: ProductCopy, mode: "fill" | "replace") => void }) {
  const [notes, setNotes] = useState("");
  const [tone, setTone] = useState<"simple" | "premium" | "playful">("premium");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductCopy | null>(null);

  if (!enabled) {
    return (
      <p className="text-sm text-metal-500">
        لتفعيل الكاتب الذكي أضف <span dir="ltr" className="font-mono">GEMINI_API_KEY</span> في متغيرات البيئة (من Google AI Studio).
      </p>
    );
  }

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/ai/product-copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nameAr, nameEn, notes, tone }) });
      const data = (await res.json().catch(() => ({}))) as { copy?: ProductCopy; error?: string; message?: string };
      if (res.ok && data.copy) setDraft(data.copy);
      else setErr(data.message ?? (data.error === "rate_limited" ? "طلبات كثيرة. انتظر قليلًا." : "تعذّر إنشاء النص الآن. حاول مرة أخرى."));
    } catch {
      setErr("تعذّر الاتصال.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="ai-copy">
      <label className="label" htmlFor="ai-notes">اكتب ما تعرفه عن المنتج (مزايا، طريقة الاستخدام، لمن يناسب)</label>
      <textarea id="ai-notes" rows={4} maxLength={3000} value={notes} onChange={(e) => setNotes(e.target.value)} className="field" placeholder="مثال: مدلك رأس كهربائي، 4 رؤوس سيليكون تدور، زر واحد، يشحن بـ USB-C، مناسب بعد الدوام…" />
      <div className="flex flex-wrap items-center gap-2">
        <select value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} className="field min-h-10 w-auto py-1.5 text-sm" aria-label="أسلوب الكتابة">
          <option value="premium">أسلوب فاخر وهادئ</option>
          <option value="simple">أسلوب بسيط وواضح</option>
          <option value="playful">أسلوب ودود وخفيف</option>
        </select>
        <button type="button" onClick={run} disabled={busy || notes.trim().length < 10 || nameAr.trim().length < 2} className="btn btn-ink btn-sm">
          {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />} اكتب لي مسودة
        </button>
      </div>
      <p className="text-xs text-metal-500">يكتب فقط مما في ملاحظاتك، ولا يكتب المواصفات الفنية. راجع النص قبل النشر.</p>
      {err ? <p role="alert" className="text-sm text-danger">{err}</p> : null}
      {draft ? (
        <div className="space-y-3 rounded-xl border border-volt/30 bg-volt/5 p-3 text-sm" data-testid="ai-draft">
          <p className="font-semibold">{draft.taglineAr}</p>
          <p className="text-metal-700">{draft.shortAr}</p>
          <p className="whitespace-pre-line text-metal-700">{draft.descriptionAr}</p>
          {draft.highlights.length ? <ul className="list-inside list-disc">{draft.highlights.map((h, i) => <li key={i}>{h.ar}</li>)}</ul> : null}
          {draft.faqs.length ? <p className="text-xs text-metal-500">+ {draft.faqs.length} أسئلة شائعة (عربي وإنجليزي)</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onApply(draft, "fill")}>تطبيق على الحقول الفارغة فقط</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onApply(draft, "replace")}>استبدال النصوص الحالية</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
