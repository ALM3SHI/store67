"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import { useI18n, format } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import type { MediaView } from "@/services/catalog";

export function Gallery({ media, productName, showPlaceholderNote }: { media: MediaView[]; productName: string; showPlaceholderNote: boolean }) {
  const { t, locale } = useI18n();
  const images = media.filter((m) => m.kind === "image");
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const rtl = locale === "ar";

  // Keep the active thumbnail in sync with swipes
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting && e.intersectionRatio > 0.6) setIndex(Number((e.target as HTMLElement).dataset.i));
      },
      { root: el, threshold: [0.6] },
    );
    el.querySelectorAll("[data-i]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [images.length]);

  const goTo = useCallback((i: number) => {
    const el = trackRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    setIndex(i);
  }, []);

  if (images.length === 0) return <div className="aspect-square rounded-[var(--radius-panel)] bg-ink" />;
  const alt = (m: MediaView) => (locale === "ar" ? m.altAr : m.altEn) || productName;

  return (
    <div className="flex flex-col gap-3" aria-roledescription="carousel" aria-label={t.product.gallery}>
      <div className="relative">
        <div ref={trackRef} className="flex snap-x snap-mandatory overflow-x-auto rounded-[var(--radius-panel)] bg-ink [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((m, i) => (
            <button
              key={m.id}
              data-i={i}
              onClick={() => setLightbox(i)}
              className="group relative aspect-square w-full shrink-0 snap-center cursor-zoom-in"
              aria-label={format(t.product.openImage, { n: i + 1 })}
            >
              <Image src={m.url} alt={alt(m)} fill priority={i === 0} sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
              <span className="absolute bottom-3 end-3 grid h-9 w-9 place-items-center rounded-full bg-ink/60 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                <ZoomIn size={16} />
              </span>
            </button>
          ))}
        </div>
        {images.length > 1 ? (
          <>
            <button
              className="absolute start-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-porcelain/90 text-ink shadow md:grid"
              onClick={() => goTo((index - 1 + images.length) % images.length)}
              aria-label={t.product.prev}
            >
              {rtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
            <button
              className="absolute end-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-porcelain/90 text-ink shadow md:grid"
              onClick={() => goTo((index + 1) % images.length)}
              aria-label={t.product.next}
            >
              {rtl ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </button>
          </>
        ) : null}
        {showPlaceholderNote && images[index]?.placeholder ? (
          <span className="pointer-events-none absolute start-3 top-3 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] text-metal-100">{t.product.illustrative}</span>
        ) : null}
      </div>

      {images.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {images.map((m, i) => (
            <li key={m.id}>
              <button
                onClick={() => goTo(i)}
                aria-label={format(t.product.openImage, { n: i + 1 })}
                aria-current={i === index}
                className={cn("relative block h-16 w-16 overflow-hidden rounded-xl bg-ink ring-offset-2 ring-offset-paper transition", i === index ? "ring-2 ring-volt" : "opacity-70 hover:opacity-100")}
              >
                <Image src={m.url} alt="" fill sizes="64px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {lightbox !== null ? <Lightbox images={images} start={lightbox} alt={alt} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}

export function Lightbox({ images, start, alt, onClose }: { images: MediaView[]; start: number; alt: (m: MediaView) => string; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const closeRef = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const rtl = locale === "ar";
  const next = useCallback(() => (setZoom(false), setI((v) => (v + 1) % images.length)), [images.length]);
  const prev = useCallback(() => (setZoom(false), setI((v) => (v - 1 + images.length) % images.length)), [images.length]);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") (rtl ? prev : next)();
      if (e.key === "ArrowLeft") (rtl ? next : prev)();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      prevFocus?.focus?.();
    };
  }, [onClose, next, prev, rtl]);

  const m = images[i]!;
  return (
    <div className="backdrop-enter fixed inset-0 z-[80] flex flex-col bg-ink/96 text-porcelain" role="dialog" aria-modal="true" aria-label={t.product.gallery}>
      <div className="flex items-center justify-between p-3">
        <span className="px-2 text-sm text-metal-300 tabular-nums" dir="ltr">
          {i + 1} / {images.length}
        </span>
        <button ref={closeRef} onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10" aria-label={t.product.closeImage}>
          <X size={22} />
        </button>
      </div>
      <div
        className="relative flex-1 overflow-hidden"
        onTouchStart={(e) => (touch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY })}
        onTouchEnd={(e) => {
          if (!touch.current || zoom) return;
          const dx = e.changedTouches[0]!.clientX - touch.current.x;
          if (Math.abs(dx) > 50) (dx < 0 ? (rtl ? prev : next) : rtl ? next : prev)();
          touch.current = null;
        }}
      >
        <button
          className={cn("relative h-full w-full", zoom ? "cursor-zoom-out" : "cursor-zoom-in")}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
            setZoom((z) => !z);
          }}
          aria-label={alt(m)}
        >
          <Image
            src={m.url}
            alt={alt(m)}
            fill
            sizes="100vw"
            className="object-contain transition-transform duration-300"
            style={{ transform: zoom ? "scale(2.4)" : "none", transformOrigin: origin }}
          />
        </button>
      </div>
      {images.length > 1 ? (
        <div className="flex items-center justify-center gap-3 p-4">
          <button onClick={prev} className="grid h-12 w-12 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label={t.product.prev}>
            {rtl ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
          <button onClick={next} className="grid h-12 w-12 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label={t.product.next}>
            {rtl ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Editorial image grid for the landing page; every tile opens the lightbox. */
export function GalleryMosaic({ media, productName, skipFirst = true }: { media: MediaView[]; productName: string; skipFirst?: boolean }) {
  const { t, locale } = useI18n();
  const all = media.filter((m) => m.kind === "image");
  const images = skipFirst && all.length > 2 ? all.slice(1) : all;
  const [open, setOpen] = useState<number | null>(null);
  const alt = (m: MediaView) => (locale === "ar" ? m.altAr : m.altEn) || productName;
  if (!images.length) return null;
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:grid-rows-2 md:gap-4">
        {images.slice(0, 5).map((m, i) => (
          <li key={m.id} className={cn("relative overflow-hidden rounded-[var(--radius-panel)] bg-paper-2", i === 0 ? "col-span-2 aspect-square md:row-span-2" : "aspect-square")}>
            <button className="group absolute inset-0 cursor-zoom-in" onClick={() => setOpen(i)} aria-label={format(t.product.openImage, { n: i + 1 })}>
              <Image src={m.url} alt={alt(m)} fill sizes={i === 0 ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"} className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      {open !== null ? <Lightbox images={images} start={open} alt={alt} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
