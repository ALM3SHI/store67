import { eq } from "drizzle-orm";
import { adminFromRequest } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { readFile, MIME_BY_EXT } from "@/services/storage";
import { audit } from "@/services/audit";

export const dynamic = "force-dynamic";

/** Streams a private business document to an authorised admin only. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminFromRequest("documents.manage");
  if (!admin) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const [d] = await db.select().from(schema.businessDocuments).where(eq(schema.businessDocuments.id, id));
  if (!d?.fileKey) return new Response("Not found", { status: 404 });
  const data = await readFile("private", d.fileKey);
  if (!data) return new Response("Not found", { status: 404 });
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "document.download", entity: "document", entityId: id });
  const ext = d.fileKey.split(".").pop() ?? "";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="document.${ext}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
