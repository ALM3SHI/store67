"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Quote } from "@/services/quote";
import { useToast } from "@/components/ui/toast";
import { useI18n, format } from "@/components/i18n-provider";
import { track } from "@/components/analytics/track";

export type CartSnapshot = {
  slug: string;
  nameAr: string;
  nameEn: string;
  variantNameAr: string;
  variantNameEn: string;
  imageUrl: string | null;
  priceHalalas: number;
  maxQuantity: number | null;
};
export type CartItem = { variantId: string; quantity: number; snapshot: CartSnapshot };

type Stored = { v: 1; items: CartItem[]; coupon: string | null; savedAt: number };

type Ctx = {
  items: CartItem[];
  count: number;
  hydrated: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (variantId: string, quantity: number, snapshot: CartSnapshot, opts?: { openDrawer?: boolean }) => boolean;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  coupon: string | null;
  setCoupon: (code: string | null) => void;
  quote: Quote | null;
  quoting: boolean;
  quoteError: boolean;
  refreshQuote: (extra?: { city?: string; paymentMethod?: string }) => void;
  pulse: number;
};

const CartContext = createContext<Ctx | null>(null);
const KEY = "s76_cart";
const MAX_AGE = 1000 * 60 * 60 * 24 * 30; // keep a cart for 30 days

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (s.v !== 1 || !Array.isArray(s.items) || Date.now() - s.savedAt > MAX_AGE) return null;
    return s;
  } catch {
    return null;
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<CartItem[]>([]);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState(false);
  const [pulse, setPulse] = useState(0);
  const extraRef = useRef<{ city?: string; paymentMethod?: string }>({});
  const reqId = useRef(0);

  // Restore cart from the last visit. localStorage only exists after hydration,
  // so this one-time sync from an external store has to happen in an effect.
  useEffect(() => {
    const s = readStored();
    if (s) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems(s.items);
      setCoupon(s.coupon);
      try {
        if (s.items.length && !sessionStorage.getItem("s76_cart_restored")) {
          sessionStorage.setItem("s76_cart_restored", "1");
          toast.push({ kind: "info", message: t.cart.restored, action: { label: t.cart.title, onClick: () => setOpen(true) } });
        }
      } catch {
        /* storage unavailable */
      }
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, items, coupon, savedAt: Date.now() } satisfies Stored));
    } catch {
      /* private mode */
    }
  }, [items, coupon, hydrated]);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      const s = readStored();
      setItems(s?.items ?? []);
      setCoupon(s?.coupon ?? null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const fetchQuote = useCallback(async () => {
    const id = ++reqId.current;
    if (items.length === 0) {
      setQuote(null);
      setQuoteError(false);
      return;
    }
    setQuoting(true);
    try {
      const res = await fetch("/api/cart/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
          couponCode: coupon ?? undefined,
          ...extraRef.current,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const q = (await res.json()) as Quote;
      if (id !== reqId.current) return;
      setQuote(q);
      setQuoteError(false);

      // Reconcile with server truth: drop removed products, clamp to stock, refresh snapshots
      let changed = false;
      const next: CartItem[] = [];
      for (const it of items) {
        if (q.removedVariantIds.includes(it.variantId)) {
          changed = true;
          continue;
        }
        const line = q.lines.find((l) => l.variantId === it.variantId);
        if (!line) {
          next.push(it);
          continue;
        }
        if (line.maxQuantity === 0) {
          changed = true;
          continue;
        }
        const qty = Math.min(it.quantity, line.maxQuantity);
        const snap: CartSnapshot = {
          ...it.snapshot,
          priceHalalas: line.unitPriceHalalas,
          maxQuantity: line.maxQuantity,
          imageUrl: line.imageUrl ?? it.snapshot.imageUrl,
        };
        if (qty !== it.quantity || snap.priceHalalas !== it.snapshot.priceHalalas || snap.maxQuantity !== it.snapshot.maxQuantity) changed = true;
        next.push({ ...it, quantity: qty, snapshot: snap });
      }
      if (changed) {
        const priceMoved = items.some((it) => {
          const l = q.lines.find((x) => x.variantId === it.variantId);
          return l && l.unitPriceHalalas !== it.snapshot.priceHalalas;
        });
        setItems(next);
        toast.push({ kind: "info", message: priceMoved ? t.cart.priceChanged : t.cart.itemUnavailable });
      }
    } catch {
      if (id === reqId.current) setQuoteError(true);
    } finally {
      if (id === reqId.current) setQuoting(false);
    }
  }, [items, coupon, t, toast]);

  useEffect(() => {
    if (!hydrated) return;
    const h = setTimeout(fetchQuote, 220);
    return () => clearTimeout(h);
  }, [fetchQuote, hydrated]);

  // Re-quote when the connection comes back
  useEffect(() => {
    const on = () => fetchQuote();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [fetchQuote]);

  const add = useCallback<Ctx["add"]>(
    (variantId, quantity, snapshot, opts) => {
      let ok = true;
      setItems((cur) => {
        const existing = cur.find((i) => i.variantId === variantId);
        const max = snapshot.maxQuantity ?? 99;
        const want = (existing?.quantity ?? 0) + quantity;
        const qty = Math.min(want, max);
        if (qty <= (existing?.quantity ?? 0)) {
          ok = false;
          return cur;
        }
        if (existing) return cur.map((i) => (i.variantId === variantId ? { ...i, quantity: qty, snapshot } : i));
        return [...cur, { variantId, quantity: qty, snapshot }];
      });
      if (ok) {
        setPulse((p) => p + 1);
        track("add_to_cart", { value: (snapshot.priceHalalas * quantity) / 100, currency: "SAR", items: [{ item_id: variantId, item_name: snapshot.nameEn, quantity }] });
        if (opts?.openDrawer !== false) setOpen(true);
      } else {
        toast.push({ kind: "error", message: format(t.cart.maxStock, { n: snapshot.maxQuantity ?? 0 }) });
      }
      return ok;
    },
    [t, toast],
  );

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    setItems((cur) =>
      cur
        .map((i) => {
          if (i.variantId !== variantId) return i;
          const max = i.snapshot.maxQuantity ?? 99;
          return { ...i, quantity: Math.max(0, Math.min(quantity, max)) };
        })
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const remove = useCallback((variantId: string) => setItems((cur) => cur.filter((i) => i.variantId !== variantId)), []);
  const clear = useCallback(() => {
    setItems([]);
    setCoupon(null);
  }, []);

  const refreshQuote = useCallback(
    (extra?: { city?: string; paymentMethod?: string }) => {
      extraRef.current = extra ?? {};
      fetchQuote();
    },
    [fetchQuote],
  );

  const value = useMemo<Ctx>(
    () => ({
      items,
      count: items.reduce((s, i) => s + i.quantity, 0),
      hydrated,
      open,
      setOpen,
      add,
      setQuantity,
      remove,
      clear,
      coupon,
      setCoupon,
      quote,
      quoting,
      quoteError,
      refreshQuote,
      pulse,
    }),
    [items, hydrated, open, add, setQuantity, remove, clear, coupon, quote, quoting, quoteError, refreshQuote, pulse],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const v = useContext(CartContext);
  if (!v) throw new Error("useCart outside CartProvider");
  return v;
}
