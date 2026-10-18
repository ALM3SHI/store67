import type { MetadataRoute } from "next";
import { env } from "@/config/env";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  // Staging / development deployments are never indexed.
  if (env.appEnv !== "production") return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/ar/checkout", "/en/checkout", "/ar/orders/", "/en/orders/", "/ar/pay/", "/en/pay/"] }],
    sitemap: `${env.appUrl}/sitemap.xml`,
    host: env.appUrl,
  };
}
