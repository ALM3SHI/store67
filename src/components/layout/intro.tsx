"use client";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { brand } from "@/config/brand";

/**
 * First-visit brand intro. It sits *over* already-rendered page content (so
 * crawlers and slow devices still get the real page), is skipped for bots,
 * automation and reduced-motion users, plays once per session, and its
 * progress bar reflects real readiness: fonts + the hero image.
 * A CSS fallback dismisses it after ~2.6s even if this script never runs.
 */
export const INTRO_BOOT_SCRIPT = `try{var d=document.documentElement,n=navigator;if(!sessionStorage.getItem('s76_intro')&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!n.webdriver&&!/bot|crawl|spider|lighthouse|preview/i.test(n.userAgent)){d.dataset.intro='play';sessionStorage.setItem('s76_intro','1')}}catch(e){}`;

export function Intro({ label, imageUrl }: { label: string; imageUrl: string | null }) {
  const [progress, setProgress] = useState(0.08);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.intro !== "play") {
      // The boot script decided before hydration; server HTML can't know, so sync once here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGone(true);
      return;
    }
    let cancelled = false;
    const start = performance.now();
    const steps: Promise<unknown>[] = [document.fonts?.ready ?? Promise.resolve()];
    if (imageUrl) {
      steps.push(
        new Promise<void>((res) => {
          const img = new Image();
          img.onload = img.onerror = () => res();
          img.src = imageUrl;
        }),
      );
    }
    let done = 0;
    steps.forEach((p) =>
      p.then(() => {
        done++;
        if (!cancelled) setProgress(0.15 + (done / steps.length) * 0.85);
      }),
    );
    const finish = () => {
      if (cancelled) return;
      setProgress(1);
      setTimeout(() => {
        root.dataset.intro = "done";
        setTimeout(() => setGone(true), 420);
      }, 180);
    };
    // Never hold the visitor longer than needed: min 900ms for the mark to draw, max 2.2s
    const max = setTimeout(finish, 2200);
    Promise.all(steps).then(() => {
      const elapsed = performance.now() - start;
      setTimeout(finish, Math.max(0, 900 - elapsed));
      clearTimeout(max);
    });
    return () => {
      cancelled = true;
      clearTimeout(max);
    };
  }, [imageUrl]);

  if (gone) return null;

  return (
    <div className="intro place-items-center bg-ink text-porcelain" aria-hidden="true">
      <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
        <div className="h-[120vmin] w-[120vmin] shrink-0 rounded-full bg-[radial-gradient(circle,rgba(88,216,239,.14),transparent_60%)]" />
      </div>
      <div className="relative flex flex-col items-center gap-7">
        <div className="relative grid place-items-center">
          <svg width="168" height="168" viewBox="0 0 120 120" className="absolute">
            <circle className="intro-ring" cx="60" cy="60" r="48" fill="none" stroke="#58d8ef" strokeWidth="1.6" strokeLinecap="round" transform="rotate(-60 60 60)" />
          </svg>
          <div className="animate-snap-in" style={{ animationDelay: "650ms" }}>
            <LogoMark size={92} />
          </div>
        </div>
        <p className="animate-fade-up font-display text-2xl tracking-[0.3em]" style={{ animationDelay: "500ms", fontFamily: "var(--font-display)" }} dir="ltr">
          {brand.name}
        </p>
        <div className="w-40">
          <div className="h-px overflow-hidden bg-white/15">
            <div className="intro-progress h-full bg-field" style={{ transform: `scaleX(${progress})` }} />
          </div>
          <p className="mt-3 text-center text-xs text-metal-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
