import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/* RFC 6238 time-based one-time passwords (Google Authenticator, Microsoft
   Authenticator, 1Password…): SHA-1, 6 digits, 30-second steps. */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export function hotp(secret: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1]! & 15;
  const code = ((h[off]! & 127) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(code % 1_000_000).padStart(6, "0");
}

export const totpStep = (now = Date.now()) => Math.floor(now / 30_000);

/**
 * Returns the matched time step (to block replays) or null. Accepts one step of
 * clock drift either side.
 */
export function verifyTotp(secret: string, code: string, opts: { now?: number; lastStep?: number | null } = {}): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const step = totpStep(opts.now);
  for (const s of [step - 1, step, step + 1]) {
    if (opts.lastStep !== undefined && opts.lastStep !== null && s <= opts.lastStep) continue;
    const expected = Buffer.from(hotp(secret, s));
    if (timingSafeEqual(expected, Buffer.from(c))) return s;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer: string) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/* The secret is stored encrypted (AES-256-GCM) with a key derived from SESSION_SECRET,
   so a database leak alone doesn't hand out second factors. */
const keyFrom = (serverSecret: string) => createHash("sha256").update(`totp-key:${serverSecret}`).digest();

export function encryptSecret(plain: string, serverSecret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFrom(serverSecret), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${enc.toString("base64url")}.${c.getAuthTag().toString("base64url")}`;
}

export function decryptSecret(stored: string, serverSecret: string): string | null {
  try {
    const [v, iv, enc, tag] = stored.split(".");
    if (v !== "v1" || !iv || !enc || !tag) return null;
    const d = createDecipheriv("aes-256-gcm", keyFrom(serverSecret), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** 10 one-time recovery codes like "k7m2-9xq4". */
export function newRecoveryCodes(n = 10): string[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: n }, () => {
    const b = randomBytes(8);
    const s = Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}
export const normalizeRecovery = (c: string) => c.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
