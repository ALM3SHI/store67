import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { aiConfigured, answerFromFaq, answerWithAi, mentionedProducts, orderContext, orderStatusSentence } from "@/services/assistant";
import { rateLimit } from "@/services/rate-limit";
import { reportError } from "@/services/monitoring";
import { isSameOrigin, requestIp } from "@/lib/http/origin";
import { env } from "@/config/env";

export const dynamic = "force-dynamic";

const turn = z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(1200) });
const body = z.object({
  // `question` alone still works (older clients); `history` carries the conversation.
  question: z.string().trim().min(2).max(500),
  history: z.array(turn).max(12).default([]),
  locale: z.enum(["ar", "en"]).default("ar"),
});

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { question, history, locale } = parsed.data;
  const ip = requestIp(req);

  const perIp = await rateLimit(`assistant:ip:${ip}`, 30, 3600);
  if (!perIp.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const turns = [...history.slice(-7), { role: "user" as const, text: question }];

  // Outside production, the reason an AI call failed is returned to help setup (never in production).
  let aiError: string | undefined;
  if (aiConfigured()) {
    const day = new Date().toISOString().slice(0, 10);
    const global = await rateLimit(`assistant:global:${day}`, env.assistant.dailyLimit, 86400);
    if (global.allowed) {
      try {
        return NextResponse.json({ mode: "ai", ...(await answerWithAi(turns, locale)) });
      } catch (e) {
        await reportError("request", e, { path: "assistant (AI failed, FAQ fallback)" });
        if (env.appEnv !== "production") aiError = e instanceof Error ? e.message : String(e);
      }
    } else if (env.appEnv !== "production") aiError = "daily limit reached";
  }
  const debug = aiError ? { aiError } : {};

  // Without AI: order status still works when the number and mobile are given.
  const order = await orderContext(turns, locale);
  if (order.found && order.text) return NextResponse.json({ mode: "faq", answer: orderStatusSentence(order.text, locale), products: [], ...debug });
  if (order.asked && !order.found) {
    const msg =
      locale === "ar"
        ? order.text?.includes("no mobile") ? "لعرض حالة الطلب أرسل رقم الجوال الذي استخدمته عند الطلب." : "لم أجد طلبًا بهذا الرقم ورقم الجوال. تأكد منهما أو استخدم صفحة تتبع الطلب."
        : order.text?.includes("no mobile") ? "To show the order status, send the mobile number you used when ordering." : "I couldn't find an order with that number and mobile. Please check both or use the Track order page.";
    return NextResponse.json({ mode: "faq", answer: msg, products: [], ...debug });
  }
  const answer = await answerFromFaq(question, locale);
  return NextResponse.json({ mode: "faq", answer, products: answer ? await mentionedProducts(answer, locale) : [], ...debug });
}
