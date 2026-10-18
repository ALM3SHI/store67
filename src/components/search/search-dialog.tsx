"use client";
import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search, X, LoaderCircle } from "lucide-react";
import { useI18n, format } from "@/components/i18n-provider";
import { Money } from "@/components/ui/price";
import type { SearchHit } from "@/services/search";
import { cn } from "@/lib/utils";

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => inputRef.current?.focus(), 10);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    const ctrl = new AbortController();
    const h = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { hits: SearchHit[] };
        setHits(data.hits ?? []);
        setSearched(term);
        setActive(0);
      } catch {
        /* aborted or offline — keep previous results */
      } finally {
        setLoading(false);
      }
    }, 140);
    return () => {
      clearTimeout(h);
      ctrl.abort();
    };
  }, [q]);

  if (!open) return null;
  const visibleHits = q.trim() ? hits : [];

  const go = (slug: string) => {
    onClose();
    router.push(`/${locale}/products/${slug}`);
  };
  const viewAll = () => {
    onClose();
    router.push(`/${locale}/products?q=${encodeURIComponent(q.trim())}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, visibleHits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const h = visibleHits[active];
      if (h) go(h.slug);
      else if (q.trim()) viewAll();
    }
  };

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t.search.label} onKeyDown={onKeyDown}>
      <button className="backdrop-enter absolute inset-0 bg-ink/55 backdrop-blur-sm" aria-label={t.nav.close} onClick={onClose} tabIndex={-1} />
      <div className="relative mx-auto mt-0 w-full max-w-2xl animate-fade-up sm:mt-[10vh] sm:px-4">
        <div className="overflow-hidden bg-porcelain shadow-2xl sm:rounded-[var(--radius-panel)]">
          <div className="flex items-center gap-3 border-b border-paper-2 px-4">
            {loading ? <LoaderCircle size={20} className="animate-spin text-metal-500" aria-hidden /> : <Search size={20} className="text-metal-500" aria-hidden />}
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.search.placeholder}
              aria-label={t.search.label}
              role="combobox"
              aria-expanded={visibleHits.length > 0}
              aria-controls={listId}
              aria-activedescendant={visibleHits[active] ? `${listId}-${active}` : undefined}
              aria-autocomplete="list"
              enterKeyHint="search"
              className="h-16 flex-1 bg-transparent text-lg outline-none placeholder:text-metal-500"
              data-testid="search-input"
            />
            <button onClick={onClose} className="rounded-full p-2 text-metal-500 hover:bg-paper-2" aria-label={t.nav.close}>
              <X size={20} />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {!q.trim() ? (
              <p className="px-5 py-6 text-sm text-metal-500">{t.search.hint}</p>
            ) : visibleHits.length === 0 && searched && !loading ? (
              <p className="px-5 py-6 text-sm text-metal-700" data-testid="search-empty">
                {format(t.search.empty, { q: searched })}
              </p>
            ) : (
              <ul id={listId} role="listbox" aria-label={t.search.results} className="p-2">
                {visibleHits.map((h, i) => (
                  <li key={h.slug} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                    <button
                      onClick={() => go(h.slug)}
                      onMouseEnter={() => setActive(i)}
                      className={cn("flex w-full items-center gap-4 rounded-xl p-2.5 text-start transition-colors", i === active ? "bg-paper-2" : "hover:bg-paper")}
                      data-testid="search-hit"
                    >
                      <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-ink">
                        {h.imageUrl ? <Image src={h.imageUrl} alt="" fill sizes="56px" className="object-cover" /> : null}
                      </span>
                      <span className="flex-1">
                        <span className="block font-medium">{locale === "ar" ? h.nameAr : h.nameEn}</span>
                        <span className={cn("text-xs", h.inStock ? "text-ok" : "text-danger")}>{h.inStock ? t.search.inStock : t.search.outOfStock}</span>
                      </span>
                      <Money halalas={h.priceHalalas} locale={locale} className="text-sm" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {visibleHits.length > 0 ? (
              <div className="border-t border-paper-2 p-2">
                <button onClick={viewAll} className="w-full rounded-xl px-3 py-3 text-sm font-medium text-volt hover:bg-paper">
                  {t.search.viewAll}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
