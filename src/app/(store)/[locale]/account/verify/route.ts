import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/config/env";
import { CUSTOMER_COOKIE, SESSION_DAYS, makeToken, readToken } from "@/services/customer-access";

export const dynamic = "force-dynamic";

/** Opens the emailed sign-in link: swaps it for a 30-day session cookie. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw === "en" ? "en" : "ar";
  const email = readToken("link", req.nextUrl.searchParams.get("token"));
  const dest = new URL(`/${locale}/account${email ? "" : "?invalid=1"}`, env.appUrl);
  const res = NextResponse.redirect(dest, 303);
  res.headers.set("Referrer-Policy", "no-referrer");
  if (email) {
    res.cookies.set(CUSTOMER_COOKIE, makeToken("session", email, SESSION_DAYS * 86400_000), {
      httpOnly: true,
      sameSite: "lax",
      secure: env.appUrl.startsWith("https://"),
      path: "/",
      maxAge: SESSION_DAYS * 86400,
    });
  }
  return res;
}
