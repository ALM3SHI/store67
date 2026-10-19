import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, schema, type Db } from "@/lib/db";
import { errorFingerprint, reportError, unresolvedErrorCount } from "@/services/monitoring";
import { saveSetting } from "@/services/settings";
import { transport } from "@/services/notify/transport";

let db: Db;
beforeAll(async () => {
  db = await getDb();
  await saveSetting("notifications", { customerEmails: true, adminEmails: "ops@example.com", newOrderAlerts: true, errorAlerts: true });
});
afterEach(() => vi.restoreAllMocks());

describe("error monitoring", () => {
  it("groups errors that differ only by ids and numbers", () => {
    const a = errorFingerprint("payment", 'Order 3f1c2d4e-1111-2222-3333-444455556666 failed after 3 tries: "abc"');
    const b = errorFingerprint("payment", 'Order 9a9a9a9a-1111-2222-3333-444455556666 failed after 7 tries: "xyz"');
    expect(a).toBe(b);
    expect(errorFingerprint("shipping", "x")).not.toBe(errorFingerprint("payment", "x"));
  });

  it("stores each error, counts repeats and alerts the team only once per hour", async () => {
    const sent: string[] = [];
    vi.spyOn(transport, "email").mockImplementation(async (m) => {
      sent.push(m.to);
      return { ok: true };
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 3; i++) await reportError("payment", new Error(`gateway timeout #${i}`), { path: "checkout" });
    const rows = (await db.select().from(schema.appErrors)).filter((r) => r.message.includes("gateway timeout"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(3);
    expect(sent).toEqual(["ops@example.com"]);
    expect(await unresolvedErrorCount()).toBeGreaterThanOrEqual(1);
  });

  it("does not alert for failed notifications (avoids alert loops)", async () => {
    const send = vi.spyOn(transport, "email").mockResolvedValue({ ok: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await reportError("notify", new Error("resend 500"));
    expect(send).not.toHaveBeenCalled();
  });
});
