import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { addOrderEvent } from "@/services/orders";
import { reportError } from "@/services/monitoring";
import { getSetting } from "@/services/settings";
import { getOnlineProvider } from "./registry";

/** Tells the payment provider the order shipped (Tamara captures the payment at this point). */
export async function paymentProviderOnShipped(orderId: string) {
  const db = await getDb();
  const payments = await db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId)).orderBy(desc(schema.payments.createdAt));
  const paid = payments.find((p) => p.status === "paid" && p.providerRef);
  const provider = paid ? getOnlineProvider(paid.provider) : null;
  if (!paid || !provider?.onShipped) return;
  const [shipment] = await db.select().from(schema.shipments).where(eq(schema.shipments.orderId, orderId)).orderBy(desc(schema.shipments.createdAt)).limit(1);
  const shipping = await getSetting("shipping");
  try {
    await provider.onShipped({
      providerRef: paid.providerRef!,
      amountHalalas: paid.amountHalalas,
      carrier: shipment?.carrierName || shipping.carrierName || "Courier",
      trackingNumber: shipment?.trackingNumber ?? null,
      trackingUrl: shipment?.trackingUrl ?? null,
    });
    await addOrderEvent(db, { orderId, type: "payment", message: `أُبلغ ${provider.label} بالشحن وتم التقاط المبلغ (Capture)` });
  } catch (e) {
    await reportError("payment", e, { path: `${provider.label}: capture on shipping` });
    await addOrderEvent(db, { orderId, type: "payment", message: `تعذّر إبلاغ ${provider.label} بالشحن — راجع الطلب في لوحة ${provider.label}` });
  }
}
