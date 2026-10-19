import "server-only";
import os from "node:os";
import path from "node:path";

/**
 * Server-side environment access. Secrets are read only here and never
 * exported to client components (this module is guarded by `server-only`).
 */
function str(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const env = {
  appEnv: (str("APP_ENV") ?? "development") as "development" | "staging" | "production",
  appUrl: (str("APP_URL") ?? "http://localhost:3000").replace(/\/$/, ""),
  databaseUrl: str("DATABASE_URL"),
  /**
   * Embedded dev database location. Kept OUTSIDE the project by default: files
   * written inside the project make `next dev` reload the page on every query,
   * and cloud-synced folders (OneDrive, iCloud) shouldn't sync a live database.
   */
  pgliteDir: (str("PGLITE_DIR") ?? path.join(os.homedir(), ".store76", "pglite")).replace(/^~(?=$|[\\/])/, os.homedir()),
  sessionSecret: str("SESSION_SECRET"),
  cronSecret: str("CRON_SECRET"),

  moyasar: {
    secretKey: str("MOYASAR_SECRET_KEY"),
    publishableKey: str("MOYASAR_PUBLISHABLE_KEY"),
    webhookSecret: str("MOYASAR_WEBHOOK_SECRET"),
    apiBase: str("MOYASAR_API_BASE") ?? "https://api.moyasar.com/v1",
  },
  testGateway: {
    enabled: str("PAYMENTS_TEST_GATEWAY") === "enabled",
  },
  aramex: {
    username: str("ARAMEX_USERNAME"),
    password: str("ARAMEX_PASSWORD"),
    accountNumber: str("ARAMEX_ACCOUNT_NUMBER"),
    accountPin: str("ARAMEX_ACCOUNT_PIN"),
    accountEntity: str("ARAMEX_ACCOUNT_ENTITY"),
    accountCountryCode: str("ARAMEX_ACCOUNT_COUNTRY_CODE") ?? "SA",
    baseUrl: str("ARAMEX_BASE_URL") ?? "https://ws.aramex.net/ShippingAPI.V2",
    version: str("ARAMEX_API_VERSION") ?? "v1.0",
    source: Number(str("ARAMEX_SOURCE") ?? "24"),
  },
  storage: {
    driver: (str("STORAGE_DRIVER") ?? "local") as "local" | "supabase",
    localDir: str("STORAGE_LOCAL_DIR") ?? "./storage",
    supabaseUrl: str("SUPABASE_URL"),
    supabaseServiceKey: str("SUPABASE_SERVICE_ROLE_KEY"),
    publicBucket: str("SUPABASE_PUBLIC_BUCKET") ?? "public-media",
    privateBucket: str("SUPABASE_PRIVATE_BUCKET") ?? "private-docs",
  },
  email: {
    /** Resend (https://resend.com) API key. Empty = emails are not sent. */
    resendKey: str("RESEND_API_KEY"),
    /** Verified sender, e.g. "STORE 76 <orders@store76.sa>" */
    from: str("EMAIL_FROM"),
    replyTo: str("EMAIL_REPLY_TO"),
  },
  sms: {
    /** Taqnyat (https://taqnyat.sa) bearer token. Empty = no SMS. */
    taqnyatKey: str("TAQNYAT_API_KEY"),
    /** Sender name approved on your Taqnyat account */
    sender: str("SMS_SENDER"),
  },
  telegram: {
    botToken: str("TELEGRAM_BOT_TOKEN"),
    /** Your chat (or group) id; the bot must be allowed to message it. */
    chatId: str("TELEGRAM_CHAT_ID"),
  },
  assistant: {
    /** gemini | anthropic — empty picks whichever key is set (Gemini first) */
    provider: str("AI_PROVIDER") as "gemini" | "anthropic" | undefined,
    geminiKey: str("GEMINI_API_KEY"),
    geminiModel: str("GEMINI_MODEL") ?? "gemini-3.8-flash",
    /** Used when the main model is overloaded (503/429). Empty string disables it. */
    geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL?.trim() ?? "gemini-3.5-flash-lite",
    anthropicKey: str("ANTHROPIC_API_KEY"),
    model: str("ASSISTANT_MODEL") ?? "claude-haiku-5-5",
    dailyLimit: Number(str("ASSISTANT_DAILY_LIMIT") ?? "300"),
  },
} as const;

export const isProductionEnv = () => env.appEnv === "production";

const DEV_SECRET = "store76-dev-only-secret-do-not-use-in-production-0000";

/** Server secret used for HMAC tokens. Required outside development. */
export function serverSecret(): string {
  if (env.sessionSecret && env.sessionSecret.length >= 32) return env.sessionSecret;
  if (env.appEnv === "production") throw new Error("SESSION_SECRET (32+ chars) is required in production");
  return DEV_SECRET;
}
