import { NextResponse, type NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type Tx } from "@/lib/db";
import { getCustomer } from "@/services/customer-auth";
import { isSameOrigin } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = await getCustomer();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const rows = await db.select({ slug: schema.customerWishlist.productSlug }).from(schema.customerWishlist).where(eq(schema.customerWishlist.customerId, c.id)).orderBy(asc(schema.customerWishlist.createdAt));
  return NextResponse.json({ slugs: rows.map((r) => r.slug) });
}

const body = z.object({ slugs: z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).max(100) });

/** Replaces the account's wishlist with the list the browser holds (already merged). */
export async function PUT(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const c = await getCustomer();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const db = await getDb();
  await (db as unknown as Tx).transaction(async (tx) => {
    await tx.delete(schema.customerWishlist).where(eq(schema.customerWishlist.customerId, c.id));
    const slugs = [...new Set(parsed.data.slugs)];
    if (slugs.length) await tx.insert(schema.customerWishlist).values(slugs.map((productSlug) => ({ customerId: c.id, productSlug })));
  });
  return NextResponse.json({ ok: true });
}
