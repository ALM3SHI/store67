import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { adminFromRequest } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/http/origin";
import { putFile, validateUpload, UploadError } from "@/services/storage";
import { audit } from "@/services/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_IMAGE = 8 * 1024 * 1024;

/** Product image upload: type sniffed from bytes, re-encoded to WebP (strips EXIF/GPS), max 2000px. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = await adminFromRequest("products.manage");
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (file.size > MAX_IMAGE) return NextResponse.json({ error: "too_large" }, { status: 413 });
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    validateUpload(buf, "image", MAX_IMAGE);
    const img = sharp(buf, { failOn: "error" }).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true });
    const out = await img.webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
    const stored = await putFile("public", "products", "webp", out.data, "image/webp");
    await audit({ actorId: admin.userId, actorEmail: admin.email, action: "media.upload", entity: "media", entityId: stored.key });
    return NextResponse.json({ url: stored.url, width: out.info.width, height: out.info.height });
  } catch (e) {
    const code = e instanceof UploadError ? e.code : "invalid_image";
    return NextResponse.json({ error: code }, { status: 400 });
  }
}
