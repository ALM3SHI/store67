import "server-only";
import { after } from "next/server";

/**
 * Runs slow side effects (emails, alerts) after the response is sent when we
 * are inside a request; outside one (scripts, tests) it simply awaits them.
 * Errors are logged, never thrown.
 */
export async function runAfterResponse(task: () => Promise<unknown>): Promise<void> {
  const safe = () =>
    task().catch(async (e) => {
      const { reportError } = await import("@/services/monitoring");
      await reportError("request", e, { path: "background task" });
    });
  try {
    after(safe);
  } catch {
    await safe();
  }
}
