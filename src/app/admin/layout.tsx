import type { Metadata } from "next";
import "../globals.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "لوحة التحكم", template: "%s | لوحة التحكم" }, robots: { index: false, follow: false } };

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-dvh bg-paper">{children}</body>
    </html>
  );
}
