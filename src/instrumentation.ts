import type { Instrumentation } from "next";

/**
 * Called by Next.js for every uncaught error in a page, route handler or server
 * action. Errors are grouped and stored (Admin → سجل الأخطاء) and the team is
 * alerted by email/Telegram at most once an hour per distinct error.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const digest = (err as { digest?: string })?.digest ?? "";
  // Control-flow "errors" thrown by redirect() / notFound() are not failures.
  if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND") return;
  const { reportError } = await import("@/services/monitoring");
  const path = (request.path ?? "").split("?")[0] ?? null;
  await reportError(context.routeType === "action" ? "action" : "request", err, { path: `${request.method} ${path}` });
};
