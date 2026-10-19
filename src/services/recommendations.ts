import "server-only";
import { sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/lib/db";
import type { ProductView } from "@/services/catalog";

/** A product pair must appear in this many real orders before we say "often bought together". */
export const CO_PURCHASE_MIN_ORDERS = 2;

/** Products that appear in the same completed orders as `productId`, most frequent first. */
export async function coPurchased(productId: string, db?: DbOrTx, limit = 3): Promise<{ productId: string; orders: number }[]> {
  const conn = db ?? (await getDb());
  const res = await conn.execute(sql`
    select b.product_id as "productId", count(distinct a.order_id)::int as orders
    from order_items a
    join order_items b on b.order_id = a.order_id and b.product_id is not null and b.product_id <> a.product_id
    join orders o on o.id = a.order_id
    where a.product_id = ${productId}
      and o.status not in ('pending_payment', 'payment_failed', 'cancelled')
    group by b.product_id
    having count(distinct a.order_id) >= ${CO_PURCHASE_MIN_ORDERS}
    order by orders desc
    limit ${limit}`);
  const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as { productId: string; orders: number }[];
  return rows;
}

/**
 * What to show under a product: real co-purchases when there is enough order
 * history (labelled as such), otherwise same-category then other products
 * (labelled neutrally — never presented as purchase data).
 */
export async function recommendationsFor(product: ProductView, all: ProductView[], db?: DbOrTx, limit = 3): Promise<{ kind: "bought_together" | "related"; products: ProductView[] }> {
  const others = all.filter((p) => p.id !== product.id && p.variants.some((v) => v.inStock));
  const together = (await coPurchased(product.id, db, limit)).map((r) => others.find((p) => p.id === r.productId)).filter((p): p is ProductView => Boolean(p));
  if (together.length) return { kind: "bought_together", products: together };
  const cat = product.category?.slug;
  const sameCat = cat ? others.filter((p) => p.category?.slug === cat) : [];
  return { kind: "related", products: [...sameCat, ...others.filter((p) => !sameCat.includes(p))].slice(0, limit) };
}
