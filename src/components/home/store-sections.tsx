import Link from "next/link";
import { ArrowLeft, ArrowRight, PackageSearch } from "lucide-react";
import type { Settings } from "@/services/settings";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatSAR } from "@/lib/money";
import { shippingSummary } from "@/components/product/sections";

const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

/* ─────────────────────────── Store-wide FAQ — every answer comes from the settings */
export function StoreFaq({
  settings,
  t,
  locale,
  onlinePaymentsLive,
  codEnabled,
  paymentBadges,
}: {
  settings: Settings;
  t: Dictionary;
  locale: Locale;
  onlinePaymentsLive: boolean;
  codEnabled: boolean;
  paymentBadges: string[];
}) {
  const f = t.home.faq;
  const s = settings.shipping;
  const eta = locale === "ar" ? s.etaAr || s.etaEn : s.etaEn || s.etaAr;
  const sep = locale === "ar" ? "، " : ", ";

  const payment = [
    onlinePaymentsLive ? fill(f.paymentOnline, { methods: paymentBadges.length ? ` (${paymentBadges.join(sep)})` : "" }) : "",
    codEnabled
      ? fill(f.paymentCod, {
          fee: settings.payments.codFeeHalalas > 0 ? (locale === "ar" ? ` برسوم ${formatSAR(settings.payments.codFeeHalalas, "ar")}` : ` with a ${formatSAR(settings.payments.codFeeHalalas, "en")} fee`) : "",
        })
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const rows: { q: string; a: string; href?: string }[] = [
    {
      q: f.shippingQ,
      a: (locale === "ar" ? "الشحن داخل المملكة: " : "Shipping in Saudi Arabia: ") + shippingSummary(settings, locale) + (eta ? (locale === "ar" ? `، ويصل خلال ${eta}.` : `, delivered in ${eta}.`) : "."),
      href: `/${locale}/pages/shipping`,
    },
    ...(settings.commerce.returnsWindowDays > 0 ? [{ q: f.returnsQ, a: fill(f.returnsA, { days: String(settings.commerce.returnsWindowDays) }), href: `/${locale}/pages/returns` }] : []),
    ...(payment ? [{ q: f.paymentQ, a: payment }] : []),
    { q: f.trackQ, a: f.trackA },
    { q: f.accountQ, a: f.accountA },
  ];

  return (
    <section className="border-t border-paper-2 bg-porcelain" aria-labelledby="store-faq">
      <div className="container-x grid gap-10 py-16 md:grid-cols-[0.8fr_1.2fr] md:gap-16 md:py-24">
        <h2 id="store-faq" className="text-[1.65rem] font-semibold md:text-[2.1rem]">{t.home.faqTitle}</h2>
        <div className="divide-y divide-paper-2 border-y border-paper-2" data-testid="store-faq">
          {rows.map((r, i) => (
            <details key={i} className="group py-1" name="store-faq">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[1.05rem] font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                {r.q}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-metal-300 text-lg leading-none transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="pb-5 pe-12 leading-8 text-metal-700">
                {r.a}
                {r.href ? (
                  <>
                    {" "}
                    <Link href={r.href} className="text-volt underline-offset-4 hover:underline">{f.readMore}</Link>
                  </>
                ) : null}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Closing call to action for the whole store */
export function StoreCta({ t, locale, productNames }: { t: Dictionary; locale: Locale; productNames: { slug: string; name: string }[] }) {
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  return (
    <section className="relative overflow-hidden bg-ink text-porcelain" aria-labelledby="store-cta">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(50%_80%_at_80%_50%,rgba(45,99,245,.14),transparent_70%)]" />
      <div className="container-x grid items-center gap-10 py-16 md:grid-cols-[1.2fr_1fr] md:py-20">
        <div className="space-y-5">
          <h2 id="store-cta" className="text-[clamp(1.9rem,4.4vw,3rem)] font-semibold leading-tight">{t.home.ctaTitle}</h2>
          <p className="max-w-[46ch] text-metal-300">{t.home.ctaBody}</p>
          <div className="flex flex-wrap gap-3">
            <Link href={`/${locale}/products`} className="btn btn-primary">
              {t.home.ctaShop} <Arrow size={17} aria-hidden />
            </Link>
            <Link href={`/${locale}/track`} className="btn border border-white/20 text-porcelain hover:border-white/50">
              <PackageSearch size={17} aria-hidden /> {t.home.ctaTrack}
            </Link>
          </div>
        </div>
        <ul className="flex flex-wrap gap-2.5 md:justify-end">
          {productNames.map((p) => (
            <li key={p.slug}>
              <Link href={`/${locale}/products/${p.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-metal-100 transition-colors hover:border-field hover:text-white">
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
