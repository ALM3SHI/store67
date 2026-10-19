import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import type { Shell } from "@/services/storefront";

export function Footer({ t, locale, shell }: { t: Dictionary; locale: Locale; shell: Shell }) {
  const s = shell.settings.store;
  const year = new Date().getFullYear();
  const socials = Object.entries(s.socials).filter(([, url]) => url);
  const socialNames: Record<string, string> = { instagram: "Instagram", x: "X", tiktok: "TikTok", snapchat: "Snapchat", youtube: "YouTube" };
  const address = locale === "ar" ? s.addressAr : s.addressEn;
  const hours = locale === "ar" ? s.supportHoursAr : s.supportHoursEn;
  const link = "text-metal-300 transition-colors hover:text-white";

  return (
    <footer className="bg-ink text-sm text-metal-300">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div className="space-y-4">
          <Logo inverted />
          <p className="max-w-xs leading-7">{t.footer.about}</p>
          {shell.paymentBadges.length || shell.codEnabled ? (
            <div>
              <p className="mb-2 text-xs text-metal-500">{t.footer.paymentMethods}</p>
              <ul className="flex flex-wrap gap-1.5">
                {shell.paymentBadges.map((b) => (
                  <li key={b} className="rounded-md border border-white/10 px-2 py-1 text-xs text-metal-100">
                    {b}
                  </li>
                ))}
                {shell.codEnabled ? <li className="rounded-md border border-white/10 px-2 py-1 text-xs text-metal-100">{t.checkout.cod}</li> : null}
              </ul>
            </div>
          ) : null}
        </div>

        <nav aria-label={t.footer.company}>
          <h2 className="mb-3 text-[0.95rem] font-medium text-white">{t.footer.company}</h2>
          <ul className="space-y-2">
            <li><Link className={link} href={`/${locale}/products`}>{t.nav.shop}</Link></li>
            <li><Link className={link} href={`/${locale}/track`}>{t.nav.track}</Link></li>
            <li><Link className={link} href={`/${locale}/account`}>{t.nav.myOrders}</Link></li>
            <li><Link className={link} href={`/${locale}/wishlist`}>{t.nav.wishlist}</Link></li>
            <li><Link className={link} href={`/${locale}/pages/contact`}>{t.footer.contact}</Link></li>
            <li><Link className={link} href={`/${locale}/pages/business`}>{t.footer.business}</Link></li>
          </ul>
        </nav>

        <nav aria-label={t.footer.help}>
          <h2 className="mb-3 text-[0.95rem] font-medium text-white">{t.footer.help}</h2>
          <ul className="space-y-2">
            <li><Link className={link} href={`/${locale}/pages/shipping`}>{locale === "ar" ? "الشحن والتوصيل" : "Shipping"}</Link></li>
            <li><Link className={link} href={`/${locale}/pages/returns`}>{t.checkout.returns}</Link></li>
            <li><Link className={link} href={`/${locale}/pages/privacy`}>{t.consent.policy}</Link></li>
            <li><Link className={link} href={`/${locale}/pages/terms`}>{t.checkout.terms}</Link></li>
          </ul>
        </nav>

        <div>
          <h2 className="mb-3 text-[0.95rem] font-medium text-white">{t.footer.contact}</h2>
          <ul className="space-y-2">
            {s.contactEmail ? <li><a className={link} href={`mailto:${s.contactEmail}`} dir="ltr">{s.contactEmail}</a></li> : null}
            {s.contactPhone ? <li><a className={link} href={`tel:${s.contactPhone.replace(/\s/g, "")}`} dir="ltr">{s.contactPhone}</a></li> : null}
            {s.whatsapp ? <li><a className={link} href={`https://wa.me/${s.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></li> : null}
            {address ? <li className="leading-6">{address}</li> : null}
            {hours ? <li className="text-metal-500">{hours}</li> : null}
            {!s.contactEmail && !s.contactPhone && !s.whatsapp ? (
              <li><Link className={link} href={`/${locale}/pages/contact`}>{t.footer.contact}</Link></li>
            ) : null}
          </ul>
          {socials.length ? (
            <ul className="mt-4 flex flex-wrap gap-3">
              {socials.map(([k, url]) => (
                <li key={k}>
                  <a className={link} href={url} target="_blank" rel="noopener noreferrer me">{socialNames[k] ?? k}</a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="container-x flex flex-col gap-2 py-5 text-xs text-metal-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {shell.storeName}. {t.footer.rights}.</p>
          {shell.publicDocuments.length ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {shell.publicDocuments.map((d) => (
                <li key={d.kind}>
                  {locale === "ar" ? d.titleAr : d.titleEn}: <bdi dir="ltr">{d.number}</bdi>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
