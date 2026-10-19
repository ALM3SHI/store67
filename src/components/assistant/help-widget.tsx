"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, X, Send, LoaderCircle, ArrowUpLeft, ArrowUpRight } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "bot"; text: string; mode?: "ai" | "faq"; products?: { slug: string; name: string }[] };

export function HelpWidget({ whatsapp, aiEnabled, suggestions }: { whatsapp: string; aiEnabled: boolean; suggestions: string[] }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [msgs, busy]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setQ("");
    setBusy(true);
    try {
      // The last few turns go with the question so follow-ups ("and the price?") make sense.
      const history = msgs.slice(-6).map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.text }));
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, history, locale }) });
      const data = (await res.json()) as { answer?: string | null; mode?: "ai" | "faq"; error?: string; products?: { slug: string; name: string }[] };
      const fallback = data.error === "rate_limited" ? t.track.tooMany : t.assistant.noMatch;
      setMsgs((m) => [...m, { role: "bot", text: data.answer || fallback, mode: data.mode, products: data.products }]);
    } catch {
      setMsgs((m) => [...m, { role: "bot", text: t.assistant.error }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-4 end-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:end-6 print:hidden">
      {open ? (
        <section
          className="flex h-[min(560px,calc(100dvh-7rem))] w-[min(380px,calc(100vw-2rem))] animate-fade-up flex-col overflow-hidden rounded-[var(--radius-panel)] bg-porcelain shadow-2xl ring-1 ring-ink/10"
          aria-label={t.assistant.title}
        >
          <header className="flex items-center justify-between bg-ink px-4 py-3 text-porcelain">
            <div>
              <h2 className="text-base font-semibold">{aiEnabled ? t.assistant.title : t.assistant.faqTitle}</h2>
              <p className="text-xs text-metal-300">{aiEnabled ? t.assistant.aiNote : t.assistant.faqNote}</p>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-white/10" aria-label={t.nav.close}>
              <X size={18} />
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-[0.95rem]" aria-live="polite">
            {msgs.length === 0 ? (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="rounded-full border border-metal-300 bg-white px-3 py-1.5 text-sm hover:border-ink">
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
            {msgs.map((m, i) => (
              <div key={i} className={cn("max-w-[85%] space-y-2", m.role === "user" && "ms-auto")}>
                <p className={cn("whitespace-pre-line rounded-2xl px-3.5 py-2.5 leading-7", m.role === "user" ? "bg-volt text-white" : "bg-white ring-1 ring-paper-2")} data-testid={m.role === "bot" ? "assistant-answer" : undefined}>
                  {m.text}
                </p>
                {m.products?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {m.products.map((p) => (
                      <Link key={p.slug} href={`/${locale}/products/${p.slug}`} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs text-white hover:bg-ink-3" data-testid="assistant-product">
                        {p.name} {locale === "ar" ? <ArrowUpLeft size={13} /> : <ArrowUpRight size={13} />}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {busy ? <LoaderCircle className="animate-spin text-metal-500" size={18} aria-label={t.common.loading} /> : null}
            <div ref={endRef} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(q);
            }}
            className="flex items-center gap-2 border-t border-paper-2 p-3"
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.assistant.placeholder} aria-label={t.assistant.placeholder} maxLength={500} className="field min-h-11 flex-1" />
            <button type="submit" className="btn btn-primary min-h-11 w-11 px-0" aria-label={t.assistant.send} disabled={busy || !q.trim()}>
              <Send size={17} className="rtl:-scale-x-100" />
            </button>
          </form>
          {whatsapp ? (
            <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="border-t border-paper-2 px-4 py-3 text-center text-sm font-medium text-ok hover:bg-white">
              {t.assistant.whatsapp}
            </a>
          ) : null}
        </section>
      ) : null}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 items-center gap-2 rounded-full bg-ink px-5 text-porcelain shadow-[0_14px_30px_-12px_rgba(10,14,20,.55)] ring-1 ring-white/10 transition hover:bg-ink-3"
        aria-expanded={open}
        aria-label={t.assistant.open}
        data-testid="help-button"
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
        <span className="hidden text-sm sm:inline">{t.nav.support}</span>
      </button>
    </div>
  );
}
