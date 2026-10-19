import "server-only";
import { env } from "@/config/env";

/*
 * One small interface over the AI providers the store can use. Gemini (Google)
 * is used when GEMINI_API_KEY is set; Claude (Anthropic) when ANTHROPIC_API_KEY
 * is set. Keys stay on the server; nothing is sent from the browser directly.
 */

export type AiMessage = { role: "user" | "assistant"; text: string };
export type AiRequest = { system: string; messages: AiMessage[]; maxTokens?: number; json?: boolean; timeoutMs?: number };

export class AiError extends Error {}

export function aiProvider(): "gemini" | "anthropic" | null {
  const a = env.assistant;
  if (a.provider === "gemini") return a.geminiKey ? "gemini" : null;
  if (a.provider === "anthropic") return a.anthropicKey ? "anthropic" : null;
  if (a.geminiKey) return "gemini";
  if (a.anthropicKey) return "anthropic";
  return null;
}

export const aiModelName = () => (aiProvider() === "gemini" ? env.assistant.geminiModel : aiProvider() === "anthropic" ? env.assistant.model : null);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BUSY = new Set([429, 500, 503, 504]);

async function geminiCall(model: string, req: AiRequest, thinking: boolean, deadline: number) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  return fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": env.assistant.geminiKey!, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] })),
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 600,
        ...(req.json ? { responseMimeType: "application/json" } : {}),
        // Short support answers don't need long reasoning: faster and cheaper.
        ...(thinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
      },
    }),
    signal: AbortSignal.timeout(Math.max(3000, deadline - Date.now())),
  });
}

/**
 * Gemini with resilience: a busy model (503/429) is retried once after a short
 * pause, then the lighter fallback model is tried. A model that rejects the
 * thinking setting is retried without it.
 */
async function gemini(req: AiRequest): Promise<string> {
  const deadline = Date.now() + (req.timeoutMs ?? 25000);
  const models = [env.assistant.geminiModel, env.assistant.geminiModel, env.assistant.geminiFallbackModel].filter(Boolean);
  let lastError = "";
  for (let i = 0; i < models.length; i++) {
    const model = models[i]!;
    if (i === 1) await sleep(900);
    if (Date.now() > deadline - 2500) break;
    let res = await geminiCall(model, req, true, deadline);
    if (res.status === 400) res = await geminiCall(model, req, false, deadline);
    if (BUSY.has(res.status)) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      lastError = `gemini HTTP ${res.status} (${model}): ${err.error?.message ?? ""}`;
      continue;
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new AiError(`gemini HTTP ${res.status} (${model}): ${err.error?.message ?? ""}`.slice(0, 300));
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    if (data.promptFeedback?.blockReason) throw new AiError(`gemini blocked: ${data.promptFeedback.blockReason}`);
    const c = data.candidates?.[0];
    const text = (c?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text)
      .join("")
      .trim();
    if (!text) throw new AiError(`gemini empty answer (${c?.finishReason ?? "no candidate"})`);
    return text;
  }
  throw new AiError((lastError || "gemini: no time left").slice(0, 300));
}

async function anthropic(req: AiRequest): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.assistant.anthropicKey!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: env.assistant.model,
      max_tokens: req.maxTokens ?? 600,
      system: req.system + (req.json ? "\nRespond with a single JSON object only." : ""),
      messages: req.messages.map((m) => ({ role: m.role, content: m.text })),
    }),
    signal: AbortSignal.timeout(req.timeoutMs ?? 20000),
  });
  if (!res.ok) throw new AiError(`anthropic HTTP ${res.status}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((c) => c.type === "text")?.text?.trim();
  if (!text) throw new AiError("anthropic empty answer");
  return text;
}

export async function generate(req: AiRequest): Promise<string> {
  const p = aiProvider();
  if (!p) throw new AiError("no AI provider configured");
  return p === "gemini" ? gemini(req) : anthropic(req);
}

/** Parses a JSON object out of a model reply (tolerates ```json fences). */
export function parseJsonReply<T>(text: string): T {
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new AiError("no JSON object in reply");
  return JSON.parse(clean.slice(start, end + 1)) as T;
}
