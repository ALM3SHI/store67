"use client";
import { useEffect, useState } from "react";
import { Copy, Check, RefreshCw, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { track } from "@/components/analytics/track";

export function CopyOrderLink() {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(location.href);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* ignore */
        }
      }}
    >
      {done ? <Check size={15} /> : <Copy size={15} />} {done ? t.order.linkCopied : t.order.copyLink}
    </button>
  );
}

/** While a payment is pending, refresh a few times so the webhook result shows up. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  useEffect(() => {
    if (!active) return;
    let n = 0;
    const h = setInterval(() => {
      if (++n > 6) return clearInterval(h);
      router.refresh();
    }, 4000);
    return () => clearInterval(h);
  }, [active, router]);
  if (!active) return null;
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.refresh()}>
      <RefreshCw size={15} /> {t.common.retry}
    </button>
  );
}

/** Fires the purchase event once per order, only after payment/confirmation. */
export function PurchaseEvent({ number, value }: { number: string; value: number }) {
  useEffect(() => {
    try {
      const k = `s76_purchase_${number}`;
      if (localStorage.getItem(k)) return;
      localStorage.setItem(k, "1");
    } catch {
      /* ignore */
    }
    track("purchase", { transaction_id: number, value, currency: "SAR" });
  }, [number, value]);
  return null;
}

export function PrintReceipt() {
  const { t } = useI18n();
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()} data-testid="print-receipt">
      <Printer size={15} /> {t.order.printReceipt}
    </button>
  );
}
