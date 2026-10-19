"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ArrowLeft, ArrowRight } from "lucide-react";
import { BuyBox, type BuyProduct } from "@/components/product/buy-box";
import { Product3D } from "@/components/product/product-3d";
import { cn } from "@/lib/utils";

export type ShowcaseItem = {
  slug: string;
  name: string;
  tagline: string;
  short: string;
  highlights: string[];
  model3d: string | null;
  poster: string | null;
  imageAlt: string;
  buy: BuyProduct;
};

/**
 * Home hero for a multi-product store: the store's promise on one side, and a
 * "stage" that shows one product at a time as a 3D model. Visitors switch
 * products with the tabs (or arrow keys); the price and buttons follow.
 */
export function HeroShowcase({
  locale,
  storeName,
  title,
  intro,
  items,
  detailsLabel,
  chooseLabel,
}: {
  locale: "ar" | "en";
  storeName: string;
  title: string;
  intro: string;
  items: ShowcaseItem[];
  detailsLabel: string;
  chooseLabel: string;
}) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const item = items[active]!;
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;

  const select = (i: number, focus = false) => {
    const n = (i + items.length) % items.length;
    setActive(n);
    if (focus) tabs.current[n]?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    // In RTL the "next" tab is to the left.
    const next = locale === "ar" ? "ArrowLeft" : "ArrowRight";
    const prev = locale === "ar" ? "ArrowRight" : "ArrowLeft";
    if (e.key === next) select(active + 1, true);
    else if (e.key === prev) select(active - 1, true);
    else if (e.key === "Home") select(0, true);
    else if (e.key === "End") select(items.length - 1, true);
    else return;
    e.preventDefault();
  };

  return (
    <section className="relative isolate overflow-clip bg-ink text-porcelain" aria-labelledby="hero-title" data-testid="hero-showcase">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_25%_55%,rgba(88,216,239,.10),transparent_70%),radial-gradient(50%_60%_at_85%_10%,rgba(45,99,245,.12),transparent_70%)] rtl:[transform:scaleX(-1)]" />
      <div className="container-x grid gap-x-12 gap-y-7 pb-14 pt-8 md:grid-cols-[1.05fr_1fr] md:py-14 [grid-template-areas:'intro'_'stage'_'tabs'_'panel'] md:[grid-template-areas:'intro_stage'_'tabs_stage'_'panel_stage']">
        <div className="space-y-4 [grid-area:intro]">
          <p className="flex items-center gap-2 text-[0.95rem] text-metal-300" style={{ fontFamily: "var(--font-display)" }}>
            <span className="h-2 w-2 rounded-full bg-field shadow-[0_0_12px_2px_rgba(88,216,239,.6)]" aria-hidden />
            {storeName}
          </p>
          <h1 id="hero-title" className="max-w-[16ch] text-[clamp(2.1rem,5vw,3.6rem)] font-semibold leading-[1.1] tracking-[-0.02em]">
            {title}
          </h1>
          <p className="max-w-[48ch] text-[0.98rem] leading-7 text-metal-300 md:text-[1.05rem] md:leading-8">{intro}</p>
        </div>

        <div className={cn("[grid-area:tabs]", items.length < 2 && "hidden")}>
          <p id="showcase-label" className="mb-2.5 text-sm text-metal-500">{chooseLabel}</p>
          <div role="tablist" aria-labelledby="showcase-label" className="flex flex-wrap gap-2" onKeyDown={onKey}>
            {items.map((p, i) => (
              <button
                key={p.slug}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`showcase-tab-${p.slug}`}
                aria-selected={i === active}
                aria-controls="showcase-panel"
                tabIndex={i === active ? 0 : -1}
                onClick={() => select(i)}
                data-testid="showcase-tab"
                className={cn(
                  "min-h-11 rounded-full border px-4 text-[0.95rem] transition-colors",
                  i === active ? "border-field bg-field/10 text-white" : "border-white/15 text-metal-300 hover:border-white/40 hover:text-white",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[min(540px,80vw)] [grid-area:stage] md:sticky md:top-24 md:self-start">
          <div className="field-rings" aria-hidden>
            <span className="h-full w-full" />
            <span className="h-full w-full" />
            <span className="h-full w-full" />
          </div>
          <div aria-hidden className="absolute inset-[14%] rounded-full bg-[radial-gradient(circle,rgba(88,216,239,.22),transparent_65%)] blur-2xl" />
          <div className="absolute inset-[2%]" key={item.slug}>
            {item.model3d ? (
              <Product3D source={item.model3d} poster={item.poster} alt={item.name} tone="dark" priority={active === 0} sizes="(min-width: 768px) 540px, 86vw" className="h-full w-full animate-snap-in" />
            ) : item.poster ? (
              <Image src={item.poster} alt={item.imageAlt || item.name} fill priority={active === 0} sizes="(min-width: 768px) 520px, 86vw" className="animate-snap-in object-contain drop-shadow-[0_40px_60px_rgba(0,0,0,.55)]" />
            ) : null}
          </div>
        </div>

        <div id="showcase-panel" role="tabpanel" aria-labelledby={`showcase-tab-${item.slug}`} className="space-y-5 [grid-area:panel]" data-testid="showcase-panel">
          <div>
            <h2 className="text-[1.5rem] font-semibold leading-snug md:text-[1.75rem]">{item.tagline || item.name}</h2>
            {item.short ? <p className="mt-2 max-w-[50ch] leading-8 text-metal-300">{item.short}</p> : null}
          </div>
          <BuyBox key={item.slug} product={item.buy} tone="dark" />
          {item.highlights.length ? (
            <ul className="grid gap-x-6 gap-y-2.5 border-t border-white/10 pt-5 text-[0.95rem] text-metal-100 sm:grid-cols-2">
              {item.highlights.slice(0, 4).map((h, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <Check size={17} className="mt-1 shrink-0 text-field" aria-hidden />
                  {h}
                </li>
              ))}
            </ul>
          ) : null}
          <Link href={`/${locale}/products/${item.slug}`} className="inline-flex items-center gap-1.5 text-[0.95rem] font-medium text-field underline-offset-4 hover:underline">
            {detailsLabel} <Arrow size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
