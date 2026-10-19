import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { seedDatabase } from "@/lib/db/seed";
import { env } from "@/config/env";
import { placeOrder } from "@/services/checkout";
import { getSetting, saveSetting } from "@/services/settings";
import { transport } from "@/services/notify/transport";
import { aiProvider, parseJsonReply } from "@/services/ai";
import { answerWithAi, orderContext, orderStatusSentence } from "@/services/assistant";
import { draftProductCopy } from "@/services/ai/product-copy";

let orderNumber = "";

beforeAll(async () => {
  const db = await getDb();
  await seedDatabase(db);
  await db.update(schema.productVariants).set({ stock: 50 });
  await saveSetting("payments", { ...(await getSetting("payments")), codEnabled: true });
  vi.spyOn(transport, "email").mockResolvedValue({ ok: true });
  vi.spyOn(transport, "telegram").mockResolvedValue({ ok: true });
  const [v] = await db.select().from(schema.productVariants);
  const r = await placeOrder({
    idempotencyKey: `ai_${Date.now()}`,
    locale: "ar",
    items: [{ variantId: v!.id, quantity: 1 }],
    paymentMethod: "cod",
    customer: { name: "ريم", phone: "0551239876", email: "" },
    address: { city: "Riyadh", district: "العليا", street: "شارع 1", nationalAddress: "", postalCode: "", notes: "" },
  });
  orderNumber = r.orderNumber;
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(env.assistant, { geminiKey: undefined, provider: undefined });
});

const geminiReply = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }), { status: 200 });

describe("Gemini provider", () => {
  it("is used when GEMINI_API_KEY is set, with the key in a header (never the URL)", async () => {
    Object.assign(env.assistant, { geminiKey: "test-key", geminiModel: "gemini-3.7-flash" });
    expect(aiProvider()).toBe("gemini");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiReply("مدلّك الرأس 76 يناسبك بعد يوم طويل."));
    const r = await answerWithAi([{ role: "user", text: "أبغى شي يريحني بعد الدوام" }], "ar");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent");
    expect(String(url)).not.toContain("test-key");
    expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(String(init!.body));
    expect(body.systemInstruction.parts[0].text).toContain("STORE DATA");
    expect(body.contents[0]).toEqual({ role: "user", parts: [{ text: "أبغى شي يريحني بعد الدوام" }] });
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe("low");
    expect(r.answer).toContain("مدلّك");
    expect(r.products.map((p) => p.slug)).toEqual(["scalp-massager-76"]);
  });

  it("retries without thinkingConfig if the model rejects it, and skips thought parts", async () => {
    Object.assign(env.assistant, { geminiKey: "k" });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Unknown name thinkingConfig" } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: "الشحن 25 ر.س" }] } }] }), { status: 200 }));
    const r = await answerWithAi([{ role: "user", text: "كم الشحن" }], "ar");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body)).generationConfig.thinkingConfig).toBeUndefined();
    expect(r.answer).toBe("الشحن 25 ر.س");
  });

  it("retries a busy model, then uses the lighter fallback model", async () => {
    Object.assign(env.assistant, { geminiKey: "k", geminiModel: "gemini-3.8-flash", geminiFallbackModel: "gemini-3.5-flash-lite" });
    const busy = () => new Response(JSON.stringify({ error: { message: "high demand" } }), { status: 503 });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(busy()).mockResolvedValueOnce(busy()).mockResolvedValueOnce(geminiReply("الشحن 25 ر.س"));
    const r = await answerWithAi([{ role: "user", text: "كم الشحن" }], "ar");
    expect(r.answer).toBe("الشحن 25 ر.س");
    expect(String(fetchMock.mock.calls[2]![0])).toContain("gemini-3.5-flash-lite:generateContent");
  });

  it("treats a blocked or empty reply as a failure (the route then falls back to FAQ)", async () => {
    Object.assign(env.assistant, { geminiKey: "k" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 }));
    await expect(answerWithAi([{ role: "user", text: "x" }], "ar")).rejects.toThrow(/blocked/);
  });

  it("product copy: JSON is validated and over-long fields are dropped", async () => {
    Object.assign(env.assistant, { geminiKey: "k" });
    const reply = { taglineAr: "راحة بلمسة", taglineEn: "Calm in a touch", shortAr: "مدلّك رأس.", shortEn: "A scalp massager.", descriptionAr: "x".repeat(5000), descriptionEn: "ok", highlights: [{ ar: "أربعة رؤوس", en: "Four heads" }], faqs: [] };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiReply("```json\n" + JSON.stringify(reply) + "\n```"));
    const c = await draftProductCopy({ nameAr: "مدلّك", nameEn: "", notes: "أربعة رؤوس سيليكون تدور", tone: "premium" });
    expect(c.taglineAr).toBe("راحة بلمسة");
    expect(c.descriptionAr).toBe(""); // too long → rejected, not truncated silently into the store
    expect(c.highlights).toHaveLength(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)).generationConfig.responseMimeType).toBe("application/json");
    expect(parseJsonReply<{ a: number }>('noise {"a": 1} noise').a).toBe(1);
  });
});

describe("order support in the chat", () => {
  it("asks for the mobile when only the order number is given", async () => {
    const r = await orderContext([{ role: "user", text: `وين طلبي ${orderNumber.toLowerCase()}` }], "ar");
    expect(r.found).toBe(false);
    expect(r.text).toContain("no mobile");
  });

  it("finds the order only with the matching mobile (spaces and Arabic digits allowed)", async () => {
    const wrong = await orderContext([{ role: "user", text: `${orderNumber} 0559999999` }], "ar");
    expect(wrong.found).toBe(false);
    const ok = await orderContext([{ role: "user", text: `طلبي ${orderNumber}` }, { role: "assistant", text: "أرسل الجوال" }, { role: "user", text: "٠٥٥ ١٢٣ ٩٨٧٦" }], "ar");
    expect(ok.found).toBe(true);
    expect(ok.text).toContain("status:");
    expect(ok.text).not.toContain("العليا"); // no address in the chat
    expect(orderStatusSentence(ok.text!, "ar")).toContain(orderNumber);
  });

  it("the AI prompt carries the verified order lookup", async () => {
    Object.assign(env.assistant, { geminiKey: "k" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiReply("طلبك مؤكد."));
    await answerWithAi([{ role: "user", text: `${orderNumber} 0551239876 وين وصل؟` }], "ar");
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body.systemInstruction.parts[0].text).toContain("ORDER LOOKUP (verified");
    const db = await getDb();
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.number, orderNumber));
    expect(o).toBeTruthy();
  });
});
