import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge routing only (no database here):
 *  - URLs without a locale prefix redirect to the visitor's saved language, Arabic by default
 *  - /admin pages without a session cookie go to the login page
 *    (the session itself is verified on the server in every admin page/action)
 */
const LOCALES = ["ar", "en"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login" || pathname === "/admin/login/verify" || pathname === "/admin/forgot" || pathname === "/admin/reset") return NextResponse.next();
    if (!req.cookies.get("s76_admin")?.value) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const first = pathname.split("/")[1] ?? "";
  if (LOCALES.includes(first)) {
    const res = NextResponse.next();
    if (req.cookies.get("s76_locale")?.value !== first) {
      res.cookies.set("s76_locale", first, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    }
    return res;
  }

  const saved = req.cookies.get("s76_locale")?.value;
  const locale = saved && LOCALES.includes(saved) ? saved : "ar";
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, pathname === "/" ? 307 : 308);
}

export const config = {
  // Skip API routes, Next internals, metadata files and anything with a file extension
  matcher: ["/((?!api|_next|feeds|icon|apple-icon|manifest|sitemap.xml|robots.txt|.*\\..*).*)"],
};
