import type { ProductView } from "@/services/catalog";
import type { Settings } from "@/services/settings";
import type { Dictionary } from "@/i18n";
import type { BuyProduct } from "@/components/product/buy-box";

export function taxNote(settings: Settings, t: Dictionary): string | null {
  if (!settings.commerce.taxEnabled) return null;
  return settings.commerce.pricesIncludeTax ? t.product.vatIncluded : t.product.vatExcluded;
}

export function toBuyProduct(p: ProductView, settings: Settings, t: Dictionary): BuyProduct {
  return {
    slug: p.slug,
    nameAr: p.nameAr,
    nameEn: p.nameEn,
    imageUrl: p.media.find((m) => m.kind === "image")?.url ?? null,
    variants: p.variants,
    maxQtyPerItem: settings.commerce.maxQtyPerItem,
    taxNote: taxNote(settings, t),
  };
}

/** Transparent renders of the built-in models, used as posters while 3D loads. */
const BUILTIN_POSTERS: Record<string, string> = {
  "builtin:magcharge": "/products/magcharge-76/cutout.webp",
  "builtin:scalp-massager": "/products/scalp-massager-76/cutout.webp",
  "builtin:smart-wallet": "/products/smart-wallet-76/cutout.webp",
};

export function posterFor(p: Pick<ProductView, "model3d" | "media">): string | null {
  if (p.model3d && BUILTIN_POSTERS[p.model3d]) return BUILTIN_POSTERS[p.model3d]!;
  return p.media.find((m) => m.kind === "image")?.url ?? null;
}
