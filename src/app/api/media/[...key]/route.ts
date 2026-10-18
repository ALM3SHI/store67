import { readFile, MIME_BY_EXT } from "@/services/storage";

export const dynamic = "force-dynamic";

/** Serves PUBLIC uploaded media from local storage (product images). Private documents are never served here. */
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const path = key.join("/");
  if (!/^[a-z0-9/_\-.]+$/i.test(path) || path.includes("..")) return new Response("Not found", { status: 404 });
  const data = await readFile("public", path);
  if (!data) return new Response("Not found", { status: 404 });
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
