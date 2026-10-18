import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { FlaskConical } from "lucide-react";
import { getDb, schema } from "@/lib/db";
import { getDictionary } from "@/i18n";
import { asLocale } from "@/i18n/config";
import { testGatewayProvider } from "@/services/payments/test-gateway";
import { Money } from "@/components/ui/price";

export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = { params: Promise<{ locale: string; paymentId: string }>; searchParams: Promise<{ r?: string; c?: string }> };


/** Developer-only payment page that simulates a gateway (hard-disabled in production). */
export default async function TestGatewayPage({ params, searchParams }: Props) {
  const { locale: raw, paymentId } = await params;
  const { r, c } = await searchParams;
  const locale = asLocale(raw);
  const t = getDictionary(locale);
  if (!testGatewayProvider.isConfigured() || !/^[0-9a-f-]{36}$/.test(paymentId)) notFound();
  const db = await getDb();
  const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
  if (!payment || payment.provider !== "test" || !payment.providerRef) notFound();
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, payment.orderId));

  return (
    <div className="container-x flex justify-center py-14">
      <div className="panel w-full max-w-md p-6">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-warn/15 px-3 py-1 text-sm font-medium text-warn">
          <FlaskConical size={16} aria-hidden /> {t.testPay.title}
        </p>
        <p className="text-metal-700">{t.testPay.body}</p>
        <dl className="mt-5 flex items-center justify-between border-y border-paper-2 py-4">
          <dt>{t.testPay.amount}</dt>
          <dd className="text-2xl font-semibold">
            <Money halalas={payment.amountHalalas} locale={locale} />
          </dd>
        </dl>
        <p className="mt-2 text-sm text-metal-500">{order?.number}</p>
        <form action="/api/payments/test/simulate" method="post" className="mt-6 grid gap-3">
          <input type="hidden" name="paymentId" value={payment.id} />
          <input type="hidden" name="r" value={r ?? ""} />
          <input type="hidden" name="c" value={c ?? ""} />
          <button name="kind" value="paid" className="btn btn-primary" data-testid="test-pay-success">
            {t.testPay.succeed}
          </button>
          <button name="kind" value="failed" className="btn btn-ghost" data-testid="test-pay-fail">
            {t.testPay.fail}
          </button>
          <button name="kind" value="cancel" className="py-2 text-sm text-metal-500 underline" data-testid="test-pay-cancel">
            {t.testPay.cancel}
          </button>
        </form>
      </div>
    </div>
  );
}
