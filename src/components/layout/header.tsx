"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, ShoppingBag, Menu, X, Languages, Heart, UserRound } from "lucide-react";
import { useWishlist } from "@/components/wishlist/wishlist";
import { Logo } from "@/components/brand/logo";
import { useI18n } from "@/components/i18n-provider";
import { useCart } from "@/components/cart/cart-provider";
import { SearchDialog } from "@/components/search/search-dialog";
import { cn } from "@/lib/utils";

export function Header({ signedIn = false }: { signedIn?: boolean }) {
  const { t, locale } = useI18n();
  const cart = useCart();
  const wish = useWishlist();
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Keyboard shortcut: "/" or Ctrl/Cmd+K opens search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


  const other = locale === "ar" ? "en" : "ar";
  const switchHref = pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${other}`) || `/${other}`;

  const links = [
    { href: `/${locale}`, label: t.nav.home },
    { href: `/${locale}/products`, label: t.nav.shop },
    { href: `/${locale}/track`, label: t.nav.track },
    { href: `/${locale}/pages/shipping`, label: t.nav.policies },
  ];

  const iconBtn = "inline-flex h-11 w-11 items-center justify-center rounded-full text-metal-100 transition-colors hover:bg-white/10 hover:text-white";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink text-porcelain">
        <div className="container-x flex h-16 items-center gap-2">
          <Link href={`/${locale}`} className="me-auto shrink-0 rounded-lg md:me-6" aria-label={t.nav.home}>
            <Logo inverted />
          </Link>

          <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label={t.nav.menu}>
            {links.map((l) => {
              const active = l.href === `/${locale}` ? pathname === l.href : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("rounded-full px-3.5 py-2 text-[0.95rem] transition-colors", active ? "bg-white/10 text-white" : "text-metal-300 hover:text-white")}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <button type="button" className={iconBtn} onClick={() => setSearchOpen(true)} aria-label={t.nav.search} aria-keyshortcuts="/">
            <Search size={20} />
          </button>
          <Link href={switchHref} hrefLang={other} className={cn(iconBtn, "w-auto gap-1.5 px-3 text-sm")} aria-label={`${t.nav.language}: ${t.meta.switchTo}`}>
            <Languages size={18} aria-hidden />
            <span className="hidden sm:inline">{t.meta.switchTo}</span>
          </Link>
          <Link
            href={signedIn ? `/${locale}/account` : `/${locale}/login`}
            className={cn(iconBtn, "relative")}
            aria-label={signedIn ? t.nav.myOrders : t.nav.login}
            data-testid="account-link"
          >
            <UserRound size={20} />
            {signedIn ? <span className="absolute end-2 top-2 h-2 w-2 rounded-full bg-ok ring-2 ring-ink" aria-hidden /> : null}
          </Link>
          <Link href={`/${locale}/wishlist`} className={cn(iconBtn, "relative hidden sm:inline-flex")} aria-label={`${t.nav.wishlist} (${wish.slugs.length})`} data-testid="wishlist-link">
            <Heart size={20} />
            {wish.slugs.length > 0 ? (
              <span className="absolute -top-0.5 end-0 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white" data-testid="wishlist-count">
                {wish.slugs.length}
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            className={cn(iconBtn, "relative")}
            onClick={() => cart.setOpen(true)}
            aria-label={`${t.nav.cart} (${cart.count})`}
            data-testid="cart-button"
          >
            {/* Re-keyed on every add so the "snap" ring animation replays */}
            {cart.pulse > 0 ? <span key={cart.pulse} className="cart-snap pointer-events-none absolute inset-0 rounded-full" aria-hidden /> : null}
            <ShoppingBag size={20} />
            {cart.hydrated && cart.count > 0 ? (
              <span className="absolute -top-0.5 end-0 grid h-5 min-w-5 place-items-center rounded-full bg-field px-1 text-[11px] font-semibold text-ink" data-testid="cart-count">
                {cart.count}
              </span>
            ) : null}
          </button>
          <button type="button" className={cn(iconBtn, "md:hidden")} onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-controls="mobile-menu" aria-label={t.nav.menu}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuOpen ? (
          <nav id="mobile-menu" className="border-t border-white/5 bg-ink md:hidden" aria-label={t.nav.menu}>
            <ul className="container-x flex flex-col py-2">
              {[
                ...links,
                { href: signedIn ? `/${locale}/account` : `/${locale}/login`, label: signedIn ? t.nav.myOrders : t.nav.login },
                { href: `/${locale}/wishlist`, label: `${t.nav.wishlist}${wish.slugs.length ? ` (${wish.slugs.length})` : ""}` },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} onClick={() => setMenuOpen(false)} className="flex min-h-12 items-center rounded-xl px-3 text-lg text-metal-100 hover:bg-white/5">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
