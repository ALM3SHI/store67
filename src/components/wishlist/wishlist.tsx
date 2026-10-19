"use client";
import { useEffect, useSyncExternalStore } from "react";
import { Heart } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

/* Wishlist kept on the visitor's device (no account needed). Product slugs only. */
const KEY = "s76_wishlist";
const listeners = new Set<() => void>();
let cache: string[] | null = null;
const EMPTY: string[] = [];

function read(): string[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  } catch {
    cache = [];
  }
  return cache;
}

/** Set by <WishlistSync> when a customer is signed in: changes are saved to the account too. */
let syncToAccount = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
function pushToAccount(list: string[]) {
  if (!syncToAccount) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    fetch("/api/account/wishlist", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slugs: list }) }).catch(() => {});
  }, 400);
}

function write(next: string[], push = true) {
  cache = next;
  if (push) pushToAccount(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: keep it in memory for this visit */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useWishlist() {
  const slugs = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    slugs,
    has: (slug: string) => slugs.includes(slug),
    toggle: (slug: string) => write(slugs.includes(slug) ? slugs.filter((s) => s !== slug) : [slug, ...slugs]),
  };
}

export function WishlistButton({ slug, tone = "light", className }: { slug: string; tone?: "light" | "dark"; className?: string }) {
  const { t } = useI18n();
  const w = useWishlist();
  const on = w.has(slug);
  return (
    <button
      type="button"
      onClick={() => w.toggle(slug)}
      aria-pressed={on}
      aria-label={on ? t.wishlist.remove : t.wishlist.add}
      title={on ? t.wishlist.remove : t.wishlist.add}
      data-testid="wishlist-toggle"
      className={cn(
        "grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors",
        tone === "dark" ? "text-metal-300 hover:bg-white/10" : "text-metal-700 hover:bg-paper-2",
        on && "text-danger",
        className,
      )}
    >
      <Heart size={19} className={cn("transition-transform", on && "scale-110 fill-current")} />
    </button>
  );
}

/**
 * When signed in: merges this device's wishlist with the account's (both ways)
 * once per page load, then keeps saving changes to the account.
 */
export function WishlistSync({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    syncToAccount = signedIn;
    if (!signedIn) return;
    let cancelled = false;
    fetch("/api/account/wishlist")
      .then((r) => (r.ok ? (r.json() as Promise<{ slugs: string[] }>) : null))
      .then((data) => {
        if (!data || cancelled) return;
        const local = read();
        const merged = [...new Set([...local, ...data.slugs])].slice(0, 100);
        if (merged.length !== data.slugs.length) pushToAccount(merged);
        if (merged.length !== local.length) write(merged, false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn]);
  return null;
}
