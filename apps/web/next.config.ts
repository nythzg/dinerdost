import type { NextConfig } from "next";
import { resolve } from "node:path";
import { isIP } from "node:net";

const config: NextConfig = {
  distDir: process.env.DD_NEXT_DIST_DIR ?? ".next",
  devIndicators: false,
  // Explicit local network access for development; no wildcard origins.
  allowedDevOrigins: isIP(process.env.DD_LAN_HOST ?? '') === 4 ? [process.env.DD_LAN_HOST!] : [],
  transpilePackages: [
    "@dinerdost/core",
    "@dinerdost/database",
    "@dinerdost/services",
  ],
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
  outputFileTracingIncludes: {
    "/*": ["../../packages/database/migrations/*.sql"],
  },
  poweredByHeader: false,
  async rewrites() {
    return {
      fallback: [
        "workspace",
        "commands",
        "auth",
        "invites",
        "orders",
        "invoices",
        "records",
        "tables",
        "notifications",
        "reports",
        "prep",
        "push",
      ].map((resource) => ({
        source: `/v2/${resource}/:path*`,
        destination: `/api/${resource}/:path*`,
      })),
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(self)",
          },
        ],
      },
      {
        source: "/kot/:orderId/:roundId",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};
export default config;
