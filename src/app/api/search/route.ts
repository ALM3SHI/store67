import { NextResponse, type NextRequest } from "next/server";
import { searchProducts } from "@/services/search";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    const hits = await searchProducts(q, 8);
    return NextResponse.json({ q, hits }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
  } catch (e) {
    console.error("[search]", e instanceof Error ? e.message : e);
    return NextResponse.json({ q, hits: [], error: "search_failed" }, { status: 500 });
  }
}
