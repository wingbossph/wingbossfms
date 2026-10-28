import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Receipt photos and CSV imports are sent through server actions.
    serverActions: { bodySizeLimit: "12mb" },
  },
  // exceljs / react-pdf are server-only and large; keep them out of the bundle.
  serverExternalPackages: ["exceljs", "@react-pdf/renderer"],
  // The PDF exports draw the logo from disk.
  outputFileTracingIncludes: { "/**": ["./public/logo-dark.png"] },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
