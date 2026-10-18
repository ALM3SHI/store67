"use client";
import Script from "next/script";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

export const CONSENT_COOKIE = "s76_consent";
const CONSENT_EVENT = "s76:consent";

function subscribe(cb: () => void) {
  window.addEventListener(CONSENT_EVENT, cb);
  return () => window.removeEventListener(CONSENT_EVENT, cb);
}

function readConsent(): "all" | "necessary" | null {
  const m = document.cookie.match(/(?:^|; )s76_consent=(all|necessary)/);
  return (m?.[1] as "all" | "necessary") ?? null;
}

/**
 * Loads GA4 / Meta Pixel / TikTok Pixel only when (1) the admin configured an
 * ID and (2) the visitor accepted analytics. Nothing is sent before consent.
 */
export function Analytics({ ga4Id, metaPixelId, tiktokPixelId }: { ga4Id: string; metaPixelId: string; tiktokPixelId: string }) {
  const { t, locale } = useI18n();
  const configured = Boolean(ga4Id || metaPixelId || tiktokPixelId);
  // Cookie-backed consent; the server snapshot is "unknown" so nothing renders until hydration.
  const consent = useSyncExternalStore(subscribe, readConsent, () => "unknown" as const);

  const choose = (v: "all" | "necessary") => {
    document.cookie = `${CONSENT_COOKIE}=${v}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    window.dispatchEvent(new Event(CONSENT_EVENT));
  };

  if (!configured) return null;

  return (
    <>
      {consent === null ? (
        <div role="dialog" aria-live="polite" aria-label={t.consent.policy} className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-xl rounded-2xl bg-ink p-4 text-sm text-porcelain shadow-2xl sm:p-5">
          <p className="leading-7">
            {t.consent.body}{" "}
            <Link href={`/${locale}/pages/privacy`} className="text-field underline underline-offset-4">
              {t.consent.policy}
            </Link>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-sm bg-porcelain text-ink" onClick={() => choose("all")}>
              {t.consent.accept}
            </button>
            <button className="btn btn-sm btn-ghost text-porcelain" onClick={() => choose("necessary")}>
              {t.consent.reject}
            </button>
          </div>
        </div>
      ) : null}

      {consent === "all" && ga4Id ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config',${JSON.stringify(ga4Id)},{anonymize_ip:true});`}
          </Script>
        </>
      ) : null}
      {consent === "all" && metaPixelId ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(metaPixelId)});fbq('track','PageView');`}
        </Script>
      ) : null}
      {consent === "all" && tiktokPixelId ? (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(${JSON.stringify(tiktokPixelId)});ttq.page();}(window,document,'ttq');`}
        </Script>
      ) : null}
    </>
  );
}
