"use client";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart/cart-provider";
import { useI18n } from "@/components/i18n-provider";
import type { BuyProduct } from "./buy-box";

/** Compact purchase buttons for secondary placements (final CTA, catalog cards). */
export function QuickBuy({ product, variant = "pair" }: { product: BuyProduct; variant?: "pair" | "add" }) {
  const { t, locale } = useI18n();
  const cart = useCart();
  const router = useRouter();
  const v = product.variants.find((x) => x.inStock);
  if (!v) return <p className="text-sm opacity-70">{t.product.outOfStock}</p>;
  const snap = {
    slug: product.slug,
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    variantNameAr: product.variants.length > 1 ? v.nameAr : "",
    variantNameEn: product.variants.length > 1 ? v.nameEn : "",
    imageUrl: product.imageUrl,
    priceHalalas: v.priceHalalas,
    maxQuantity: Math.min(product.maxQtyPerItem, v.available ?? product.maxQtyPerItem),
  };
  if (variant === "add") {
    return (
      <button className="btn btn-ink btn-sm" onClick={() => cart.add(v.id, 1, snap)}>
        {t.product.addToCart}
      </button>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      <button
        className="btn btn-primary min-w-44"
        onClick={() => {
          if (!cart.items.some((i) => i.variantId === v.id)) cart.add(v.id, 1, snap, { openDrawer: false });
          router.push(`/${locale}/checkout`);
        }}
      >
        {t.product.buyNow}
      </button>
      <button className="btn btn-ghost text-porcelain" onClick={() => cart.add(v.id, 1, snap)}>
        {t.product.addToCart}
      </button>
    </div>
  );
}

/** Adds one of each bundle product (first in-stock variant) and opens the cart. */
export function AddBundle({ products }: { products: BuyProduct[] }) {
  const { t } = useI18n();
  const cart = useCart();
  const picks = products.map((p) => ({ p, v: p.variants.find((x) => x.inStock) }));
  if (picks.some((x) => !x.v)) return <p className="text-sm text-metal-500">{t.product.bundleUnavailable}</p>;
  return (
    <button
      className="btn btn-ink"
      data-testid="add-bundle"
      onClick={() => {
        picks.forEach(({ p, v }, i) => {
          if (cart.items.some((it) => it.variantId === v!.id)) return;
          cart.add(
            v!.id,
            1,
            {
              slug: p.slug,
              nameAr: p.nameAr,
              nameEn: p.nameEn,
              variantNameAr: p.variants.length > 1 ? v!.nameAr : "",
              variantNameEn: p.variants.length > 1 ? v!.nameEn : "",
              imageUrl: p.imageUrl,
              priceHalalas: v!.priceHalalas,
              maxQuantity: Math.min(p.maxQtyPerItem, v!.available ?? p.maxQtyPerItem),
            },
            { openDrawer: i === picks.length - 1 },
          );
        });
        if (picks.every(({ v }) => cart.items.some((it) => it.variantId === v!.id))) cart.setOpen(true);
      }}
    >
      {t.product.bundleAdd}
    </button>
  );
}
