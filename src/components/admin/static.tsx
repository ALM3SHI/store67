import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[1.6rem] font-semibold">{title}</h1>
        {description ? <p className="mt-1 max-w-[70ch] text-sm text-metal-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({ title, children, className, actions }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-paper-2 bg-white p-5", className)}>
      {title || actions ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="text-base font-semibold">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const tones = {
  gray: "bg-paper-2 text-metal-700",
  green: "bg-ok/12 text-ok",
  amber: "bg-warn/12 text-warn",
  red: "bg-danger/10 text-danger",
  blue: "bg-volt/10 text-volt",
  ink: "bg-ink text-white",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone])}>{children}</span>;
}

export const orderStatusTone: Record<string, keyof typeof tones> = {
  pending_payment: "amber",
  confirmed: "blue",
  processing: "blue",
  shipped: "ink",
  delivered: "green",
  cancelled: "gray",
  payment_failed: "red",
  refunded: "gray",
};
export const paymentStatusTone: Record<string, keyof typeof tones> = {
  initiated: "gray",
  pending: "amber",
  paid: "green",
  failed: "red",
  cancelled: "gray",
  refunded: "gray",
  partially_refunded: "amber",
  cod_pending: "amber",
  cod_collected: "green",
};

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-metal-300 px-4 py-8 text-center text-sm text-metal-500">{children}</p>;
}

export const thClass = "px-3 py-2.5 text-start text-xs font-medium text-metal-500";
export const tdClass = "px-3 py-3 align-middle";
