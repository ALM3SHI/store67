import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { aiConfigured, answerFromFaq, answerWithAi } from "@/services/assistant";
import { rateLimit } from "@/services/rate-limit";
import { env } from "@/config/env";

export const dynamic = "force-dynamic";

const body = z.object({ question: z.string().trim().min(2).max(500), locale: z.enum(["ar", "en"]).default("ar") });

export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { question, locale } = parsed.data;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  const perIp = await rateLimit(`assistant:ip:${ip}`, 20, 3600);
  if (!perIp.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  if (aiConfigured()) {
    const day = new Date().toISOString().slice(0, 10);
    const global = await rateLimit(`assistant:global:${day}`, env.assistant.dailyLimit, 86400);
    if (global.allowed) {
      try {
        return NextResponse.json({ mode: "ai", answer: await answerWithAi(question, locale) });
      } catch (e) {
        console.warn("[assistant] AI failed, falling back to FAQ:", e instanceof Error ? e.message : e);
      }
    }
  }
  const answer = await answerFromFaq(question, locale);
  return NextResponse.json({ mode: "faq", answer });
}
