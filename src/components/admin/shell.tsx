"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Package, Receipt, Users, TicketPercent, Settings, FileBadge, ScrollText, LogOut, Menu, X, Star, FileText, UserCog, ExternalLink } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import type { Permission } from "@/lib/auth/permissions";

const NAV: { href: string; label: string; icon: typeof Package; perm: Permission }[] = [
  { href: "/admin", label: "نظرة عامة", icon: LayoutDashboard, perm: "dashboard.view" },
  { href: "/admin/orders", label: "الطلبات", icon: Receipt, perm: "orders.view" },
  { href: "/admin/products", label: "المنتجات", icon: Package, perm: "products.manage" },
  { href: "/admin/customers", label: "العملاء", icon: Users, perm: "customers.view" },
  { href: "/admin/coupons", label: "العروض والكوبونات", icon: TicketPercent, perm: "coupons.manage" },
  { href: "/admin/reviews", label: "التقييمات", icon: Star, perm: "reviews.manage" },
  { href: "/admin/pages", label: "الصفحات والسياسات", icon: FileText, perm: "pages.manage" },
  { href: "/admin/documents", label: "التراخيص والوثائق", icon: FileBadge, perm: "documents.manage" },
  { href: "/admin/settings", label: "إعدادات المتجر", icon: Settings, perm: "settings.manage" },
  { href: "/admin/users", label: "المستخدمون", icon: UserCog, perm: "users.manage" },
  { href: "/admin/audit", label: "سجل العمليات", icon: ScrollText, perm: "audit.view" },
];

export function AdminShell({ user, perms, logout, children, badges }: { user: { name: string; email: string; roleLabel: string }; perms: Permission[]; logout: () => Promise<void>; children: React.ReactNode; badges: Record<string, number> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => perms.includes(n.perm));
  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="قائمة الإدارة">
      {items.map((n) => {
        const active = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.95rem] transition-colors", active ? "bg-white/10 text-white" : "text-metal-300 hover:bg-white/5 hover:text-white")}
          >
            <n.icon size={18} aria-hidden />
            <span className="flex-1">{n.label}</span>
            {badges[n.href] ? <span className="rounded-full bg-field px-2 text-xs font-semibold text-ink">{badges[n.href]}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
  const footer = (
    <div className="space-y-3 border-t border-white/10 pt-4 text-sm">
      <div>
        <p className="font-medium text-white">{user.name}</p>
        <p className="text-xs text-metal-500" dir="ltr">{user.email}</p>
        <p className="text-xs text-metal-500">{user.roleLabel}</p>
      </div>
      <a href="/ar" target="_blank" className="flex items-center gap-2 text-metal-300 hover:text-white"><ExternalLink size={15} /> عرض المتجر</a>
      <form action={logout}>
        <button className="flex items-center gap-2 text-metal-300 hover:text-white" data-testid="logout"><LogOut size={15} /> تسجيل الخروج</button>
      </form>
    </div>
  );
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto bg-ink p-4 lg:flex">
        <Link href="/admin" className="flex items-center gap-2.5 px-2 pt-1 text-white"><LogoMark size={32} /><span className="font-display font-semibold">لوحة التحكم</span></Link>
        <div className="flex-1">{nav}</div>
        {footer}
      </aside>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between bg-ink px-4 text-white lg:hidden">
        <Link href="/admin" className="flex items-center gap-2"><LogoMark size={28} /><span className="font-display text-sm">لوحة التحكم</span></Link>
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="القائمة" className="p-2">{open ? <X /> : <Menu />}</button>
      </div>
      {open ? <div className="fixed inset-x-0 top-14 z-30 max-h-[calc(100dvh-3.5rem)] overflow-y-auto bg-ink p-4 lg:hidden">{nav}<div className="mt-4">{footer}</div></div> : null}
      <main className="min-w-0 p-4 md:p-8">{children}</main>
    </div>
  );
}
