import "server-only";
import path from "node:path";
import fs from "node:fs/promises";
import { env } from "@/config/env";
import { randomToken } from "@/lib/crypto";

/**
 * File storage with two visibility levels:
 *  - public:  product media, served at /api/media/... (local) or the public bucket
 *  - private: business documents — only streamed to authenticated admins
 */
export type Visibility = "public" | "private";

export type StoredFile = { key: string; url: string | null };

const ALLOWED = {
  image: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" } as Record<string, string>,
  document: { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" } as Record<string, string>,
  model: { "model/gltf-binary": "glb" } as Record<string, string>,
};

/** Sniff the real type from magic bytes — never trust the browser's MIME type. */
export function sniffMime(buf: Uint8Array): string | null {
  const b = buf;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  if (b.length >= 12 && String.fromCharCode(...b.slice(4, 8)) === "ftyp" && /avi[fs]/.test(String.fromCharCode(...b.slice(8, 12)))) return "image/avif";
  if (b.length >= 5 && String.fromCharCode(...b.slice(0, 5)) === "%PDF-") return "application/pdf";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "glTF") return "model/gltf-binary";
  return null;
}

export class UploadError extends Error {
  constructor(readonly code: "too_large" | "bad_type" | "storage") {
    super(code);
  }
}

export function validateUpload(buf: Uint8Array, kind: "image" | "document" | "model", maxBytes: number) {
  if (buf.byteLength > maxBytes) throw new UploadError("too_large");
  const mime = sniffMime(buf);
  if (!mime || !ALLOWED[kind][mime]) throw new UploadError("bad_type");
  return { mime, ext: ALLOWED[kind][mime]! };
}

function localPath(visibility: Visibility, key: string) {
  const root = path.resolve(env.storage.localDir, visibility);
  const p = path.resolve(root, key);
  if (!p.startsWith(root + path.sep)) throw new UploadError("storage"); // path traversal guard
  return p;
}

export async function putFile(visibility: Visibility, folder: string, ext: string, data: Uint8Array, mime: string): Promise<StoredFile> {
  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomToken(12)}.${ext}`;
  if (env.storage.driver === "supabase") {
    const { supabaseUrl, supabaseServiceKey, publicBucket, privateBucket } = env.storage;
    if (!supabaseUrl || !supabaseServiceKey) throw new UploadError("storage");
    const bucket = visibility === "public" ? publicBucket : privateBucket;
    const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": mime, "x-upsert": "false" },
      body: Buffer.from(data),
    });
    if (!res.ok) throw new UploadError("storage");
    return { key, url: visibility === "public" ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${key}` : null };
  }
  const p = localPath(visibility, key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data);
  return { key, url: visibility === "public" ? `/api/media/${key}` : null };
}

export async function readFile(visibility: Visibility, key: string): Promise<Buffer | null> {
  if (env.storage.driver === "supabase") {
    const { supabaseUrl, supabaseServiceKey, publicBucket, privateBucket } = env.storage;
    const bucket = visibility === "public" ? publicBucket : privateBucket;
    const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${key}`, { headers: { Authorization: `Bearer ${supabaseServiceKey}` } });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  }
  try {
    return await fs.readFile(localPath(visibility, key));
  } catch {
    return null;
  }
}

export async function deleteFile(visibility: Visibility, key: string) {
  if (env.storage.driver === "supabase") {
    const { supabaseUrl, supabaseServiceKey, publicBucket, privateBucket } = env.storage;
    const bucket = visibility === "public" ? publicBucket : privateBucket;
    await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${key}`, { method: "DELETE", headers: { Authorization: `Bearer ${supabaseServiceKey}` } });
    return;
  }
  await fs.rm(localPath(visibility, key), { force: true });
}

export const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", pdf: "application/pdf", glb: "model/gltf-binary" };
