"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CUSTOMER_COOKIE, requestOrdersLink } from "@/services/customer-access";

export type LinkState = { ok: boolean; key: "sent" | "limited" | "invalid" } | null;

export async function requestOrdersLinkAction(_: LinkState, fd: FormData): Promise<LinkState> {
  const email = String(fd.get("email") ?? "").trim();
  const locale = fd.get("locale") === "en" ? "en" : "ar";
  if (!z.email().safeParse(email).success) return { ok: false, key: "invalid" };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const r = await requestOrdersLink(email, locale, ip);
  return r.limited ? { ok: false, key: "limited" } : { ok: true, key: "sent" };
}

export async function customerSignOut(fd: FormData) {
  const locale = fd.get("locale") === "en" ? "en" : "ar";
  (await cookies()).delete(CUSTOMER_COOKIE);
  redirect(`/${locale}/account`);
}
