"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Rotate3d, LoaderCircle } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import type { Viewer } from "@/lib/three/viewer";

/**
 * Interactive 3D product viewer.
 * - Shows the poster image immediately (fast first paint, SEO, no-WebGL fallback)
 * - Loads three.js only when the viewer approaches the screen, and frees the
 *   WebGL context again when it scrolls far away (so long pages stay light)
 * - Drag to rotate, tap to interact, arrow keys / Enter for keyboard users
 * - Respects prefers-reduced-motion (no auto-rotation or idle animation)
 */
export function Product3D({
  source,
  poster,
  alt,
  tone = "light",
  autoRotate = true,
  interactive = true,
  azimuth,
  elevation,
  className,
  priority = false,
  showHint = true,
  sizes = "(min-width: 768px) 50vw, 100vw",
}: {
  source: string;
  poster: string | null;
  alt: string;
  tone?: "dark" | "light";
  autoRotate?: boolean;
  interactive?: boolean;
  azimuth?: number;
  elevation?: number;
  className?: string;
  priority?: boolean;
  showHint?: boolean;
  sizes?: string;
}) {
  const { locale } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [hint, setHint] = useState<Viewer["hint"]>(undefined);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let cancelled = false;
    let creating = false;

    const create = async () => {
      if (viewerRef.current || creating) return;
      creating = true;
      setState((s) => (s === "ready" ? s : "loading"));
      try {
        const mod = await import("@/lib/three/viewer");
        if (cancelled) return;
        if (!mod.supportsWebGL()) {
          setState("failed");
          return;
        }
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const accent = getComputedStyle(document.documentElement).getPropertyValue("--color-field").trim() || "#58d8ef";
        const v = await mod.createViewer(canvas, { source, autoRotate, interactive, reducedMotion, accent, tone, azimuth, elevation, startOpen: true });
        if (cancelled) {
          v.dispose();
          return;
        }
        viewerRef.current = v;
        setHint(v.hint);
        setState("ready");
      } catch (e) {
        console.warn("[3d] viewer failed, showing image instead:", e);
        if (!cancelled) setState("failed");
      } finally {
        creating = false;
      }
    };
    const destroy = () => {
      viewerRef.current?.dispose();
      viewerRef.current = null;
      setState((s) => (s === "failed" ? s : "idle"));
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void create();
        else destroy();
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(wrap);
    return () => {
      cancelled = true;
      io.disconnect();
      viewerRef.current?.dispose();
      viewerRef.current = null;
    };
  }, [source, autoRotate, interactive, tone, azimuth, elevation]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const v = viewerRef.current;
    if (!v) return;
    const step = 0.26;
    if (e.key === "ArrowLeft") v.nudge(locale === "ar" ? step : -step);
    else if (e.key === "ArrowRight") v.nudge(locale === "ar" ? -step : step);
    else if (e.key === "Enter" || e.key === " ") v.activate();
    else return;
    e.preventDefault();
    setTouched(true);
  };

  const ready = state === "ready";
  const label = locale === "ar" ? `${alt} — مجسم ثلاثي الأبعاد، اسحب للتدوير` : `${alt} — 3D model, drag to rotate`;

  return (
    <div
      ref={wrapRef}
      className={cn("group/3d overflow-hidden", /\b(absolute|fixed)\b/.test(className ?? "") ? "" : "relative", className)}
      role="img"
      aria-label={label}
      aria-roledescription={locale === "ar" ? "مجسم ثلاثي الأبعاد" : "3D model"}
      tabIndex={interactive ? 0 : -1}
      onKeyDown={onKeyDown}
      onPointerDown={() => setTouched(true)}
      data-testid="product-3d"
      data-state={state}
    >
      {poster ? (
        <Image
          src={poster}
          alt=""
          fill
          sizes={sizes}
          priority={priority}
          className={cn("object-contain transition-opacity duration-700", ready ? "opacity-0" : "opacity-100")}
          aria-hidden
        />
      ) : null}
      <canvas ref={canvasRef} className={cn("absolute inset-0 h-full w-full transition-opacity duration-700", ready ? "opacity-100" : "opacity-0", interactive && "cursor-grab active:cursor-grabbing")} aria-hidden />

      {state === "loading" && !poster ? <LoaderCircle className="absolute inset-0 m-auto animate-spin text-metal-500" size={22} aria-hidden /> : null}

      {showHint && interactive && state !== "failed" ? (
        <span
          className={cn(
            "pointer-events-none absolute bottom-3 start-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition-opacity duration-500 rtl:translate-x-1/2",
            tone === "dark" ? "bg-white/10 text-metal-100 backdrop-blur" : "bg-ink/75 text-porcelain",
            touched ? "opacity-0" : "opacity-100",
          )}
          aria-hidden
        >
          <Rotate3d size={14} />
          {locale === "ar" ? "اسحب للتدوير" : "Drag to rotate"}
          {hint ? <span className="border-s border-current/30 ps-1.5 opacity-75">{hint[locale]}</span> : null}
        </span>
      ) : null}
    </div>
  );
}
