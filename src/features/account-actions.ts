"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type Tx } from "@/lib/db";
import { normalizeSaudiMobile } from "@/lib/phone";
import { SAUDI_CITIES } from "@/lib/saudi-cities";
import { customerForVerified, deleteAccount, endSession, getCustomer, linkIdentifier, requestCode, startSession, verifyCode } from "@/services/customer-auth";

type Locale = "ar" | "en";
const loc = (fd: FormData): Locale => (fd.get("locale") === "en" ? "en" : "ar");
const ip = async () => {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
};
/** Only same-site paths are allowed as a post-login destination. */
const safeNext = (v: FormDataEntryValue | null, locale: Locale) => {
  const s = String(v ?? "");
  return /^\/(ar|en)(\/[\w\-/]*)?(\?[\w=&%-]*)?$/.test(s) ? s : `/${locale}/account`;
};

export type CodeStep = { step: "identify"; error?: string } | { step: "code"; otpId: string; masked: string; error?: string; devCode?: string };

export async function requestLoginCode(_: CodeStep | null, fd: FormData): Promise<CodeStep> {
  const r = await requestCode(String(fd.get("identifier") ?? ""), { purpose: "login", ip: await ip(), locale: loc(fd) });
  return r.ok ? { step: "code", otpId: r.otpId, masked: r.masked, devCode: r.devCode } : { step: "identify", error: r.reason };
}

export async function verifyLoginCode(prev: CodeStep | null, fd: FormData): Promise<CodeStep> {
  const locale = loc(fd);
  const otpId = String(fd.get("otpId") ?? "");
  const r = await verifyCode(otpId, String(fd.get("code") ?? ""));
  if (!r.ok || r.purpose !== "login") {
    const masked = prev && prev.step === "code" ? prev.masked : "";
    return { step: "code", otpId, masked, error: !r.ok ? (r.reason === "invalid" ? "code_invalid" : r.reason === "expired" ? "code_expired" : "too_many") : "code_invalid" };
  }
  const customer = await customerForVerified(r.identifier);
  await startSession(customer.id);
  const next = safeNext(fd.get("next"), locale);
  redirect(customer.name ? next : `/${locale}/account?tab=profile&welcome=1`);
}

export async function logout(fd: FormData) {
  await endSession();
  redirect(`/${loc(fd)}`);
}

async function requireCustomer(locale: Locale) {
  const c = await getCustomer();
  if (!c) redirect(`/${locale}/login`);
  return c;
}

export type SimpleState = { ok: boolean; message?: string; error?: string } | null;

export async function saveProfile(_: SimpleState, fd: FormData): Promise<SimpleState> {
  const c = await requireCustomer(loc(fd));
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  if (name.length < 2) return { ok: false, error: "name" };
  const db = await getDb();
  await db.update(schema.customers).set({ name, marketingOptIn: fd.get("marketing") === "on", updatedAt: new Date() }).where(eq(schema.customers.id, c.id));
  revalidatePath(`/${loc(fd)}/account`);
  return { ok: true };
}

export type LinkStep = { step: "identify"; error?: string } | { step: "code"; otpId: string; masked: string; error?: string; devCode?: string } | { step: "done" };

export async function requestLinkCode(_: LinkStep | null, fd: FormData): Promise<LinkStep> {
  const c = await requireCustomer(loc(fd));
  const r = await requestCode(String(fd.get("identifier") ?? ""), { purpose: "link", customerId: c.id, ip: await ip(), locale: loc(fd) });
  return r.ok ? { step: "code", otpId: r.otpId, masked: r.masked, devCode: r.devCode } : { step: "identify", error: r.reason };
}

export async function confirmLinkCode(prev: LinkStep | null, fd: FormData): Promise<LinkStep> {
  const c = await requireCustomer(loc(fd));
  const otpId = String(fd.get("otpId") ?? "");
  const r = await verifyCode(otpId, String(fd.get("code") ?? ""));
  const masked = prev && prev.step === "code" ? prev.masked : "";
  if (!r.ok || r.purpose !== "link" || r.customerId !== c.id) {
    return { step: "code", otpId, masked, error: !r.ok && r.reason === "expired" ? "code_expired" : !r.ok && r.reason === "too_many" ? "too_many" : "code_invalid" };
  }
  const linked = await linkIdentifier(c.id, r.identifier);
  if (!linked.ok) return { step: "identify", error: "taken" };
  revalidatePath(`/${loc(fd)}/account`);
  return { step: "done" };
}

const addressSchema = z.object({
  label: z.string().trim().max(40).default(""),
  recipientName: z.string().trim().min(2).max(80),
  phone: z.string().transform((v, ctx) => {
    const p = normalizeSaudiMobile(v);
    if (!p) ctx.addIssue({ code: "custom", message: "phone" });
    return p ?? "";
  }),
  city: z.string().refine((v) => SAUDI_CITIES.some((c) => c.en === v), "city"),
  district: z.string().trim().min(2).max(80),
  street: z.string().trim().min(3).max(160),
  nationalAddress: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-Z]{4}\d{4})?$/, "nationalAddress")
    .default(""),
  postalCode: z.string().trim().regex(/^(\d{5})?$/, "postalCode").default(""),
  isDefault: z.boolean().default(false),
});

export async function saveAddress(_: SimpleState, fd: FormData): Promise<SimpleState> {
  const locale = loc(fd);
  const c = await requireCustomer(locale);
  const parsed = addressSchema.safeParse({
    label: fd.get("label") ?? "",
    recipientName: fd.get("recipientName") ?? "",
    phone: fd.get("phone") ?? "",
    city: fd.get("city") ?? "",
    district: fd.get("district") ?? "",
    street: fd.get("street") ?? "",
    nationalAddress: fd.get("nationalAddress") ?? "",
    postalCode: fd.get("postalCode") ?? "",
    isDefault: fd.get("isDefault") === "on",
  });
  if (!parsed.success) return { ok: false, error: String(parsed.error.issues[0]?.path[0] ?? "invalid") };
  const id = String(fd.get("id") ?? "");
  const db = await getDb();
  await (db as unknown as Tx).transaction(async (tx) => {
    const existing = await tx.select({ id: schema.customerAddresses.id }).from(schema.customerAddresses).where(eq(schema.customerAddresses.customerId, c.id));
    if (existing.length >= 10 && !id) throw new Error("too many addresses");
    const isDefault = parsed.data.isDefault || existing.length === 0;
    let savedId = id;
    if (id) {
      const [u] = await tx
        .update(schema.customerAddresses)
        .set({ ...parsed.data, isDefault, updatedAt: new Date() })
        .where(and(eq(schema.customerAddresses.id, id), eq(schema.customerAddresses.customerId, c.id)))
        .returning({ id: schema.customerAddresses.id });
      if (!u) return;
    } else {
      const [n] = await tx.insert(schema.customerAddresses).values({ ...parsed.data, isDefault, customerId: c.id }).returning({ id: schema.customerAddresses.id });
      savedId = n!.id;
    }
    if (isDefault) {
      await tx
        .update(schema.customerAddresses)
        .set({ isDefault: false })
        .where(and(eq(schema.customerAddresses.customerId, c.id), ne(schema.customerAddresses.id, savedId)));
    }
  });
  revalidatePath(`/${locale}/account`);
  return { ok: true };
}

export async function deleteAddress(fd: FormData) {
  const locale = loc(fd);
  const c = await requireCustomer(locale);
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return;
  const db = await getDb();
  await db.delete(schema.customerAddresses).where(and(eq(schema.customerAddresses.id, id.data), eq(schema.customerAddresses.customerId, c.id)));
  revalidatePath(`/${locale}/account`);
}

export async function deleteMyAccount(_: SimpleState, fd: FormData): Promise<SimpleState> {
  const locale = loc(fd);
  const c = await requireCustomer(locale);
  const word = String(fd.get("confirm") ?? "").trim().toLowerCase();
  if (word !== "حذف" && word !== "delete") return { ok: false, error: "confirm" };
  await endSession();
  await deleteAccount(c.id);
  redirect(`/${locale}?account_deleted=1`);
}
