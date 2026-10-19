import Link from "next/link";
import Image from "next/image";
import { desc } from "drizzle-orm";
import { Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { productStockSummary } from "@/features/admin/product-actions";
import { PageHeader, Badge, Empty, thClass, tdClass } from "@/components/admin/static";
import { stockAlertCounts } from "@/services/stock-alerts";
import { Money } from "@/components/ui/price";

export const metadata = { title: "المنتجات" };

export default async function ProductsAdmin() {
  await requireAdmin("products.manage");
  const db = await getDb();
  const [products, stock, media, waiting] = await Promise.all([
    db.select().from(schema.products).orderBy(desc(schema.products.featured), desc(schema.products.updatedAt)),
    productStockSummary(),
    db.select({ productId: schema.productMedia.productId, url: schema.productMedia.url, sort: schema.productMedia.sort }).from(schema.productMedia),
    stockAlertCounts(db),
  ]);
  const statusLabel = { draft: "مسودة", published: "منشور", archived: "مؤرشف" } as const;
  return (
    <>
      <PageHeader
        title="المنتجات"
        description="أضف منتجًا جديدًا أو عدّل الأسعار والصور والمخزون. التغييرات تظهر في المتجر فور الحفظ."
        actions={<Link href="/admin/products/new" className="btn btn-primary btn-sm"><Plus size={16} /> منتج جديد</Link>}
      />
      {products.length === 0 ? (
        <Empty>لا توجد منتجات بعد.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-paper-2 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-paper-2"><tr><th className={thClass}>المنتج</th><th className={thClass}>الحالة</th><th className={thClass}>السعر</th><th className={thClass}>المخزون</th><th className={thClass}>الإصدارات</th></tr></thead>
            <tbody className="divide-y divide-paper-2">
              {products.map((p) => {
                const s = stock.find((x) => x.productId === p.id);
                const img = media.filter((m) => m.productId === p.id).sort((a, b) => a.sort - b.sort)[0];
                return (
                  <tr key={p.id} className="hover:bg-paper/50">
                    <td className={tdClass}>
                      <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 font-medium hover:underline" data-testid="admin-product-link">
                        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-ink">{img ? <Image src={img.url} alt="" fill sizes="44px" className="object-cover" /> : null}</span>
                        <span>{p.nameAr}{p.featured ? <span className="ms-2 text-xs text-volt">رئيسي</span> : null}<span className="block text-xs font-normal text-metal-500" dir="ltr">/{p.slug}</span></span>
                      </Link>
                    </td>
                    <td className={tdClass}><Badge tone={p.status === "published" ? "green" : p.status === "draft" ? "amber" : "gray"}>{statusLabel[p.status]}</Badge></td>
                    <td className={tdClass}>{s ? <Money halalas={s.minPrice} locale="ar" /> : "—"}</td>
                    <td className={tdClass}>{s ? <Badge tone={s.stock === 0 ? "red" : s.stock <= 5 ? "amber" : "gray"}>{s.stock}</Badge> : "—"}{waiting.get(p.id) ? <span className="ms-2 text-xs text-metal-500" data-testid="stock-waiting">{waiting.get(p.id)} بانتظار التوفر</span> : null}</td>
                    <td className={tdClass}>{s?.count ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
