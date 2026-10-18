import type { Metadata } from "next";
import { getDictionary } from "@/i18n";
import { asLocale } from "@/i18n/config";
import { getShell } from "@/services/storefront";
import { TrackForm } from "@/components/order/track-form";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  return { title: getDictionary(locale).track.title, alternates: { canonical: `/${locale}/track` } };
}

export default async function TrackPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  const shell = await getShell(locale);
  return (
    <div className="container-x max-w-3xl py-12 md:py-16">
      <h1 className="text-[2rem] font-semibold md:text-[2.5rem]">{t.track.title}</h1>
      <p className="mb-8 mt-2 text-metal-700">{t.track.body}</p>
      <TrackForm trackingTemplate={shell.settings.shipping.trackingUrlTemplate} />
    </div>
  );
}
