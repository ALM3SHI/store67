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
