"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useCart, type CartSnapshot } from "@/components/cart/cart-provider";

/** Puts the reminded items back in the cart (keeping anything already there) and opens checkout. */
export function RestoreCart({ items, next, label }: { items: { variantId: string; quantity: number; snapshot: CartSnapshot }[]; next: string; label: string }) {
  const cart = useCart();
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (!cart.hydrated || done.current) return;
    done.current = true;
    for (const it of items) {
      if (!cart.items.some((c) => c.variantId === it.variantId)) cart.add(it.variantId, it.quantity, it.snapshot, { openDrawer: false });
    }
    router.replace(next);
  }, [cart, items, next, router]);
  return (
    <p className="flex items-center gap-2 text-metal-700" role="status">
      <LoaderCircle className="animate-spin" size={18} aria-hidden /> {label}
    </p>
  );
}
