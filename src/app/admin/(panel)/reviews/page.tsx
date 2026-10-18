import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { PageHeader, Badge, Empty } from "@/components/admin/static";
import { moderateReview } from "@/features/admin/misc-actions";

export const metadata = { title: "التقييمات" };

export default async function Reviews() {
  await requireAdmin("reviews.manage");
  const db = await getDb();
  const rows = await db.select({ r: schema.reviews, name: schema.products.nameAr }).from(schema.reviews).innerJoin(schema.products, eq(schema.products.id, schema.reviews.productId)).orderBy(desc(schema.reviews.createdAt)).limit(200);
  const tone = { pending: "amber", approved: "green", rejected: "gray" } as const;
  const label = { pending: "بانتظار المراجعة", approved: "منشور", rejected: "مرفوض" } as const;
  return (
    <>
      <PageHeader title="التقييمات" description="التقييمات تأتي فقط من عملاء استلموا طلباتهم، ولا تُنشر إلا بعد موافقتك. لا تعدّل نص تقييم عميل." />
      {rows.length === 0 ? <Empty>لا توجد تقييمات بعد.</Empty> : (
        <ul className="space-y-3">
          {rows.map(({ r, name }) => (
            <li key={r.id} className="rounded-2xl border border-paper-2 bg-white p-4">
              <div className="flex flex-wrap items-center gap-3 text-sm"><span className="font-medium">{r.authorName}</span><span>{"★".repeat(r.rating)}</span><span className="text-metal-500">{name}</span><Badge tone={tone[r.status]}>{label[r.status]}</Badge>{r.orderId ? <Badge tone="blue">مشترٍ موثّق</Badge> : null}</div>
              <p className="mt-2 leading-7">{r.body}</p>
              <div className="mt-3 flex gap-2">
                {r.status !== "approved" ? <form action={moderateReview}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="approved" /><button className="btn btn-ink btn-sm">نشر</button></form> : null}
                {r.status !== "rejected" ? <form action={moderateReview}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="rejected" /><button className="btn btn-ghost btn-sm">رفض</button></form> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
