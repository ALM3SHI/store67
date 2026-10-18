import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema } from "@/lib/db";
import { asLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { RichText } from "@/components/ui/rich-text";
import { getShell } from "@/services/storefront";

type Props = { params: Promise<{ locale: string; slug: string }> };

const getPage = cache(async (slug: string) => {
  const db = await getDb();
  const [p] = await db.select().from(schema.pages).where(and(eq(schema.pages.slug, slug), eq(schema.pages.published, true)));
  return p ?? null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = asLocale(raw);
  const p = await getPage(slug);
  if (!p) return {};
  return { title: locale === "ar" ? p.titleAr : p.titleEn, alternates: { canonical: `/${locale}/pages/${slug}`, languages: { ar: `/ar/pages/${slug}`, en: `/en/pages/${slug}` } } };
}

export default async function PolicyPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale = asLocale(raw);
  const t = getDictionary(locale);
  const p = await getPage(slug);
  if (!p) notFound();
  const shell = await getShell(locale);
  const s = shell.settings.store;
  const body = (locale === "ar" ? p.bodyAr : p.bodyEn).replaceAll("{returns_days}", String(shell.settings.commerce.returnsWindowDays));

  return (
    <article className="container-x max-w-3xl py-12 md:py-16">
      <h1 className="text-[2rem] font-semibold md:text-[2.6rem]">{locale === "ar" ? p.titleAr : p.titleEn}</h1>
      <p className="mt-2 text-sm text-metal-500">
        {locale === "ar" ? "آخر تحديث" : "Last updated"}: {new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "long" }).format(p.updatedAt)}
      </p>
      <RichText text={body} className="prose-store mt-8 text-[1.05rem] text-metal-700" />

      {slug === "returns" ? (
        <p className="mt-6 rounded-2xl bg-paper-2 px-4 py-3">
          {locale === "ar" ? `مدة طلب الاسترجاع الحالية: ${shell.settings.commerce.returnsWindowDays} أيام من الاستلام.` : `Current return window: ${shell.settings.commerce.returnsWindowDays} days from delivery.`}
        </p>
      ) : null}

      {slug === "contact" ? (
        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          {s.contactEmail ? <div className="panel p-4"><dt className="text-sm text-metal-500">Email</dt><dd><a href={`mailto:${s.contactEmail}`} dir="ltr">{s.contactEmail}</a></dd></div> : null}
          {s.contactPhone ? <div className="panel p-4"><dt className="text-sm text-metal-500">{locale === "ar" ? "الهاتف" : "Phone"}</dt><dd dir="ltr">{s.contactPhone}</dd></div> : null}
          {s.whatsapp ? <div className="panel p-4"><dt className="text-sm text-metal-500">WhatsApp</dt><dd><a href={`https://wa.me/${s.whatsapp}`} target="_blank" rel="noopener noreferrer" dir="ltr">+{s.whatsapp}</a></dd></div> : null}
          {(locale === "ar" ? s.supportHoursAr : s.supportHoursEn) ? <div className="panel p-4"><dt className="text-sm text-metal-500">{locale === "ar" ? "ساعات العمل" : "Hours"}</dt><dd>{locale === "ar" ? s.supportHoursAr : s.supportHoursEn}</dd></div> : null}
          {!s.contactEmail && !s.contactPhone && !s.whatsapp ? <p className="text-metal-500">{locale === "ar" ? "ستُضاف وسائل التواصل قريبًا." : "Contact details will be added soon."}</p> : null}
        </dl>
      ) : null}

      {slug === "business" ? (
        shell.publicDocuments.length ? (
          <dl className="mt-8 divide-y divide-paper-2 border-y border-paper-2">
            <div className="grid grid-cols-2 gap-4 py-3"><dt className="text-metal-500">{locale === "ar" ? "اسم المتجر" : "Store name"}</dt><dd>{shell.storeName}</dd></div>
            {shell.publicDocuments.map((d) => (
              <div key={d.kind} className="grid grid-cols-2 gap-4 py-3"><dt className="text-metal-500">{locale === "ar" ? d.titleAr : d.titleEn}</dt><dd dir="ltr" className="text-start font-display">{d.number}</dd></div>
            ))}
          </dl>
        ) : (
          <p className="mt-8 rounded-2xl bg-paper-2 px-4 py-3 text-metal-700">{locale === "ar" ? "لم تُنشر بيانات تجارية بعد." : "No business details have been published yet."}</p>
        )
      ) : null}
      <p className="mt-12 text-sm text-metal-500">{t.footer.contact}: <a className="underline" href={`/${locale}/pages/contact`}>{t.footer.contact}</a></p>
    </article>
  );
}
