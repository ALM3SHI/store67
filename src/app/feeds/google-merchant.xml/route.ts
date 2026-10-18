import { listPublishedProducts } from "@/services/catalog";
import { getAllSettings } from "@/services/settings";
import { absUrl } from "@/lib/seo";
import { brand } from "@/config/brand";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Google Merchant Center product feed (RSS 2.0 + g: namespace), Arabic.
 * Values are generated from live catalog data, so price and availability
 * always match the product page.
 */
export async function GET() {
  const [products, settings] = await Promise.all([listPublishedProducts(), getAllSettings()]);
  if (!settings.seo.merchantFeedEnabled) return new Response("Feed disabled", { status: 404 });
  const ship = settings.shipping;
  const items = products.flatMap((p) =>
    p.variants.map((v) => {
      const img = p.media.filter((m) => m.kind === "image");
      return `<item>
<g:id>${esc(v.sku)}</g:id>
<g:item_group_id>${esc(p.slug)}</g:item_group_id>
<title>${esc(p.nameAr + (p.variants.length > 1 ? ` - ${v.nameAr}` : ""))}</title>
<description>${esc(p.shortAr || p.descriptionAr)}</description>
<link>${esc(absUrl(`/ar/products/${p.slug}`))}</link>
${img[0] ? `<g:image_link>${esc(absUrl(img[0].url))}</g:image_link>` : ""}
${img.slice(1, 10).map((m) => `<g:additional_image_link>${esc(absUrl(m.url))}</g:additional_image_link>`).join("\n")}
<g:availability>${v.inStock ? "in_stock" : "out_of_stock"}</g:availability>
<g:price>${(v.compareAtHalalas ?? v.priceHalalas) / 100} SAR</g:price>
${v.compareAtHalalas ? `<g:sale_price>${v.priceHalalas / 100} SAR</g:sale_price>` : ""}
<g:condition>new</g:condition>
<g:brand>${esc(p.brand || brand.name)}</g:brand>
${p.gtin ? `<g:gtin>${esc(p.gtin)}</g:gtin>` : ""}${p.mpn ? `<g:mpn>${esc(p.mpn)}</g:mpn>` : ""}${!p.gtin && !p.mpn ? "<g:identifier_exists>no</g:identifier_exists>" : ""}
${v.weightGrams ? `<g:shipping_weight>${v.weightGrams} g</g:shipping_weight>` : ""}
${ship.rateSource === "flat" ? `<g:shipping><g:country>SA</g:country><g:price>${ship.freeOverHalalas !== null && v.priceHalalas >= ship.freeOverHalalas ? 0 : ship.flatRateHalalas / 100} SAR</g:price></g:shipping>` : ""}
</item>`;
    }),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${esc(settings.store.nameAr || brand.name)}</title>
<link>${esc(absUrl("/ar"))}</link>
<description>${esc(brand.taglineAr)}</description>
${items.join("\n")}
</channel>
</rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}
