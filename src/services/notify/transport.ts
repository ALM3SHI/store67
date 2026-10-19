import "server-only";
import { env } from "@/config/env";

export type SendResult = { ok: true; id?: string } | { ok: false; error: string; skipped?: boolean };
export type EmailMessage = { to: string; subject: string; html: string; text: string };

export const emailConfigured = () => Boolean(env.email.resendKey && env.email.from);
export const telegramConfigured = () => Boolean(env.telegram.botToken && env.telegram.chatId);
export const smsConfigured = () => Boolean(env.sms.taqnyatKey && env.sms.sender);

const TIMEOUT_MS = 8000;

async function sendEmailViaResend(m: EmailMessage): Promise<SendResult> {
  if (!emailConfigured()) {
    // Local development: show the message in the server console instead.
    if (env.appEnv !== "production") console.info(`[email:not-configured] to=${m.to} subject=${m.subject}\n${m.text}\n`);
    return { ok: false, error: "not_configured", skipped: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.email.resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.email.from,
        to: [m.to],
        subject: m.subject,
        html: m.html,
        text: m.text,
        ...(env.email.replyTo ? { reply_to: env.email.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) return { ok: false, error: `resend ${res.status}: ${body.message ?? body.name ?? "error"}`.slice(0, 300) };
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: `resend: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) };
  }
}

async function sendTelegramMessage(text: string): Promise<SendResult> {
  if (!telegramConfigured()) {
    if (env.appEnv !== "production") console.info(`[telegram:not-configured]\n${text}\n`);
    return { ok: false, error: "not_configured", skipped: true };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.telegram.chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { message_id?: number } };
    if (!res.ok || !body.ok) return { ok: false, error: `telegram ${res.status}: ${body.description ?? "error"}`.slice(0, 300) };
    return { ok: true, id: String(body.result?.message_id ?? "") };
  } catch (e) {
    return { ok: false, error: `telegram: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) };
  }
}

/** Taqnyat SMS (POST https://api.taqnyat.sa/v1/messages, Bearer token). `to` is +9665XXXXXXXX. */
async function sendSmsViaTaqnyat(to: string, body: string): Promise<SendResult> {
  if (!smsConfigured()) {
    if (env.appEnv !== "production") console.info(`[sms:not-configured] to=${to}\n${body}\n`);
    return { ok: false, error: "not_configured", skipped: true };
  }
  const recipient = to.replace(/^\+/, "");
  if (!/^9665\d{8}$/.test(recipient)) return { ok: false, error: "invalid_number" };
  try {
    const res = await fetch("https://api.taqnyat.sa/v1/messages", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.sms.taqnyatKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipients: [recipient], body, sender: env.sms.sender }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as { messageId?: string | number; message?: string; rejected?: unknown[] };
    if (!res.ok) return { ok: false, error: `taqnyat ${res.status}: ${data.message ?? "error"}`.slice(0, 300) };
    if (Array.isArray(data.rejected) && data.rejected.length) return { ok: false, error: "taqnyat: number rejected" };
    return { ok: true, id: data.messageId !== undefined ? String(data.messageId) : undefined };
  } catch (e) {
    return { ok: false, error: `taqnyat: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) };
  }
}

/** Indirection so tests can capture outgoing messages without network access. */
export const transport = {
  email: sendEmailViaResend,
  telegram: sendTelegramMessage,
  sms: sendSmsViaTaqnyat,
};
