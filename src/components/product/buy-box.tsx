"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { QuantityStepper } from "@/components/cart/cart-drawer";
import { useI18n, format } from "@/components/i18n-provider";
import { PriceTag } from "@/components/ui/price";
import { useToast } from "@/components/ui/toast";
import { discountPercent } from "@/lib/money";
import { cn } from "@/lib/utils";
import { WishlistButton } from "@/components/wishlist/wishlist";
import type { VariantView } from "@/services/catalog";

export type BuyProduct = {
  slug: string;
  nameAr: string;
  nameEn: string;
  imageUrl: string | null;
  variants: VariantView[];
  maxQtyPerItem: number;
  taxNote: string | null;
};

export function useSelectedVariant(p: BuyProduct) {
  const first = p.variants.find((v) => v.inStock) ?? p.variants[0]!;
  return useState(first.id);
}

/**
 * Price, variant, quantity and the two purchase actions. `tone` adapts it to
 * the dark hero stage or the light product page. It also drives the mobile
 * sticky bar, which appears once these buttons scroll out of view.
 */
export function BuyBox({ product, tone = "light", showShare = false }: { product: BuyProduct; tone?: "light" | "dark"; showShare?: boolean }) {
  const { t, locale } = useI18n();
  const cart = useCart();
  const router = useRouter();
  const toast = useToast();
  const [variantId, setVariantId] = useSelectedVariant(product);
  const [qtyRaw, setQty] = useState(1);
  const [stickyVisible, setStickyVisible] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const v = product.variants.find((x) => x.id === variantId) ?? product.variants[0]!;
  const name = locale === "ar" ? product.nameAr : product.nameEn;
  const max = Math.max(1, Math.min(product.maxQtyPerItem, v.available ?? product.maxQtyPerItem));
  const qty = Math.min(qtyRaw, max);
  const pct = discountPercent(v.priceHalalas, v.compareAtHalalas);
  const dark = tone === "dark";


  useEffect(() => {
    const el = actionsRef.current;
    if (!el) return;
    // Shown once the purchase buttons have scrolled above the viewport. A cheap
    // rAF-throttled scroll check backs up the observer, whose callbacks some
    // browsers delay while a WebGL canvas keeps the GPU busy.
    const check = () => setStickyVisible(el.getBoundingClientRect().bottom < 0);
    const io = new IntersectionObserver(check, { threshold: 0 });
    io.observe(el);
    let queued = 0;
    const onScroll = () => {
      if (!queued) queued = requestAnimationFrame(() => ((queued = 0), check()));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (queued) cancelAnimationFrame(queued);
    };
  }, []);

  const snapshot = () => ({
    slug: product.slug,
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    variantNameAr: product.variants.length > 1 ? v.nameAr : "",
    variantNameEn: product.variants.length > 1 ? v.nameEn : "",
    imageUrl: product.imageUrl,
    priceHalalas: v.priceHalalas,
    maxQuantity: Math.min(product.maxQtyPerItem, v.available ?? product.maxQtyPerItem),
  });

  const addToCart = (open = true) => cart.add(v.id, qty, snapshot(), { openDrawer: open });
  const buyNow = () => {
    const inCart = cart.items.find((i) => i.variantId === v.id);
    if (!inCart) addToCart(false);
    router.push(`/${locale}/checkout`);
  };
  const share = async () => {
    const url = `${location.origin}/${locale}/products/${product.slug}`;
    try {
      if (navigator.share) await navigator.share({ title: name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.push({ kind: "success", message: t.product.shareCopied });
      }
    } catch {
      /* cancelled */
    }
  };

  const stockLine = !v.inStock ? (
    <span className="text-danger">{t.product.outOfStock}</span>
  ) : v.lowStock && v.available !== null ? (
    <span className="text-warn">{format(t.product.lowStock, { n: v.available })}</span>
  ) : (
    <span className={dark ? "text-field" : "text-ok"}>{t.product.inStock}</span>
  );

  return (
    <div className="space-y-5" data-testid="buy-box">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <PriceTag price={v.priceHalalas} compareAt={v.compareAtHalalas} locale={locale} size="xl" wasLabel={t.product.priceWas} />
          {pct ? <span className="rounded-full bg-field/15 px-2.5 py-1 text-sm font-medium text-field">{format(t.product.save, { p: pct })}</span> : null}
        </div>
        <p className={cn("flex flex-wrap items-center gap-x-3 text-sm", dark ? "text-metal-300" : "text-metal-500")}>
          {product.taxNote ? <span>{product.taxNote}</span> : null}
          <span className="inline-flex items-center gap-1.5" data-testid="stock-status">
            <span className={cn("h-1.5 w-1.5 rounded-full", v.inStock ? (v.lowStock ? "bg-warn" : "bg-ok") : "bg-danger")} aria-hidden />
            {stockLine}
          </span>
        </p>
      </div>

      {product.variants.length > 1 ? (
        <fieldset>
          <legend className={cn("mb-2 text-sm", dark ? "text-metal-300" : "text-metal-700")}>{t.product.variant}</legend>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((x) => (
              <label
                key={x.id}
                className={cn(
                  "cursor-pointer rounded-full border px-4 py-2 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-volt",
                  x.id === variantId ? (dark ? "border-field text-white" : "border-ink bg-ink text-white") : dark ? "border-white/20 text-metal-300" : "border-metal-300",
                  !x.inStock && "opacity-50",
                )}
              >
                <input type="radio" name="variant" value={x.id} checked={x.id === variantId} onChange={() => setVariantId(x.id)} className="sr-only" />
                {locale === "ar" ? x.nameAr : x.nameEn}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div ref={actionsRef} className="flex flex-wrap items-center gap-3">
        {v.inStock ? (
          <>
            <QuantityStepper value={qty} max={max} onChange={setQty} testId="buy-qty" />
            <button type="button" className="btn btn-primary min-w-40 flex-1 sm:flex-none" onClick={buyNow} data-testid="buy-now">
              {t.product.buyNow}
            </button>
            <button
              type="button"
              className={cn("btn btn-ghost flex-1 sm:flex-none", dark ? "text-porcelain" : "text-ink")}
              onClick={() => addToCart(true)}
              data-testid="add-to-cart"
            >
              {t.product.addToCart}
            </button>
          </>
        ) : (
          <BackInStockForm key={v.id} variantId={v.id} dark={dark} />
        )}
        {showShare ? <WishlistButton slug={product.slug} tone={dark ? "dark" : "light"} className="h-12 w-12" /> : null}
        {showShare ? (
          <button type="button" onClick={share} className={cn("grid h-12 w-12 place-items-center rounded-full", dark ? "text-metal-300 hover:bg-white/10" : "text-metal-700 hover:bg-paper-2")} aria-label={t.product.share}>
            <Share2 size={18} />
          </button>
        ) : null}
      </div>

      {/* Mobile sticky purchase bar */}
      {v.inStock ? (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-30 border-t border-paper-2 bg-porcelain/95 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-transform duration-300 md:hidden",
            stickyVisible ? "translate-y-0" : "translate-y-full",
          )}
          aria-hidden={!stickyVisible}
          data-testid="sticky-buy"
        >
          <div className="flex items-center gap-3 pe-16">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{name}</p>
              <PriceTag price={v.priceHalalas} compareAt={null} locale={locale} size="sm" wasLabel="" />
            </div>
            <button type="button" className="btn btn-primary btn-sm min-h-11" onClick={() => addToCart(true)} tabIndex={stickyVisible ? 0 : -1}>
              {t.product.addToCart}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Shown instead of the purchase buttons when the chosen version is sold out. */
function BackInStockForm({ variantId, dark }: { variantId: string; dark: boolean }) {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "in_stock" | "error">("idle");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/stock-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variantId, email, locale }) });
      const data = (await res.json().catch(() => ({}))) as { result?: string };
      setState(!res.ok ? "error" : data.result === "in_stock" ? "in_stock" : "done");
    } catch {
      setState("error");
    }
  };
  if (state === "done" || state === "in_stock") {
    return (
      <p role="status" className={cn("w-full rounded-2xl px-4 py-3 text-sm", dark ? "bg-white/5 text-field" : "bg-ok/10 text-ok")} data-testid="stock-alert-done">
        {state === "done" ? t.product.notifyDone : t.product.notifyInStock}
      </p>
    );
  }
  return (
    <form onSubmit={submit} className={cn("w-full space-y-2 rounded-2xl border p-4", dark ? "border-white/15" : "border-paper-2 bg-porcelain")} data-testid="stock-alert-form">
      <p className={cn("font-medium", dark ? "text-white" : "text-ink")}>{t.product.notifyTitle}</p>
      <p className={cn("text-sm", dark ? "text-metal-300" : "text-metal-700")}>{t.product.notifyBody}</p>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor={`sa-${variantId}`}>{t.product.notifyEmail}</label>
        <input
          id={`sa-${variantId}`}
          type="email"
          required
          dir="ltr"
          autoComplete="email"
          placeholder={t.product.notifyEmail}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field min-w-0 flex-1 text-start"
        />
        <button className="btn btn-primary" disabled={state === "sending"}>{t.product.notifySubmit}</button>
      </div>
      {state === "error" ? <p role="alert" className="text-sm text-danger">{t.product.notifyError}</p> : null}
    </form>
  );
}
