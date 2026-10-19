import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/*
 * Content-Security-Policy. Only the store itself and the analytics tools the
 * admin can enable are allowed to load scripts; plugins, <base> hijacking,
 * framing by other sites and form posts to foreign hosts are blocked.
 * 'unsafe-inline' stays for scripts because Next.js and the consent-gated
 * analytics snippets use inline bootstraps (a nonce would force every page
 * to render dynamically).
 */
const analyticsScripts = ["https://www.googletagmanager.com", "https://connect.facebook.net", "https://analytics.tiktok.com"];
const analyticsBeacons = [
  "https://www.google-analytics.com",
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
  "https://www.googletagmanager.com",
  "https://www.facebook.com",
  "https://connect.facebook.net",
  "https://analytics.tiktok.com",
  "https://*.tiktok.com",
];
const storage = ["https://*.supabase.co"];
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} ${analyticsScripts.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${[...storage, ...analyticsBeacons].join(" ")}`,
  "font-src 'self' data:",
  `connect-src 'self'${isProd ? "" : " ws: wss:"} ${[...storage, ...analyticsBeacons].join(" ")}`,
  `media-src 'self' blob: ${storage.join(" ")}`,
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  // Payment retry without JavaScript is a form post that redirects to the gateway.
  "form-action 'self' https://*.moyasar.com https://moyasar.com",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  ...(isProd && process.env.APP_URL?.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // `npm run dev` only: let phones/other PCs on the home network open the store
  // by IP (e.g. http://192.168.1.20:3000). Without this Next.js blocks the page's
  // scripts on those addresses and no button responds. Ignored in production.
  allowedDevOrigins: [
    "127.0.0.1",
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
    "*.local",
    ...(process.env.DEV_ALLOWED_ORIGINS ?? "").split(",").map((h) => h.trim()).filter(Boolean),
  ],
  experimental: {
    // Business documents (PDF up to 10MB) are uploaded through a server action
    serverActions: { bodySizeLimit: "11mb" },
    proxyClientMaxBodySize: "11mb",
  },
  // Database drivers run only on the server and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "sharp"],
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // Supabase Storage public bucket (only used when STORAGE_DRIVER=supabase)
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
    localPatterns: [{ pathname: "/products/**" }, { pathname: "/brand/**" }, { pathname: "/api/media/**" }],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
