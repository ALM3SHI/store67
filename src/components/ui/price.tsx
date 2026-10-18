import { formatSAR, type Locale } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Money is always rendered as an isolated LTR run so digits don't flip inside Arabic text. */
export function Money({ halalas, locale, className }: { halalas: number; locale: Locale; className?: string }) {
  return (
    <bdi className={cn("whitespace-nowrap font-display tabular-nums", className)} style={{ fontFamily: "var(--font-display)" }}>
      {formatSAR(halalas, locale)}
    </bdi>
  );
}

export function PriceTag({
  price,
  compareAt,
  locale,
  size = "md",
  wasLabel,
}: {
  price: number;
  compareAt: number | null;
  locale: Locale;
  size?: "sm" | "md" | "lg" | "xl";
  wasLabel: string;
}) {
  const sizes = { sm: "text-base", md: "text-xl", lg: "text-3xl", xl: "text-4xl md:text-5xl" };
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <Money halalas={price} locale={locale} className={cn(sizes[size], "font-semibold")} />
      {compareAt && compareAt > price ? (
        <span className="text-sm opacity-60">
          <span className="sr-only">{wasLabel} </span>
          <s>
            <Money halalas={compareAt} locale={locale} />
          </s>
        </span>
      ) : null}
    </span>
  );
}
