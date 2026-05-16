import type { NextConfig } from "next";

const r2PublicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.trim() || "";

function r2CoverRemotePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  if (!r2PublicBaseUrl) return [];

  try {
    const url = new URL(r2PublicBaseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return [];

    const pathname = `${url.pathname.replace(/\/+$/, "") || ""}/**`;
    return [
      {
        protocol: url.protocol.replace(":", "") as "http" | "https",
        hostname: url.hostname,
        port: url.port,
        pathname,
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.100"],
  devIndicators: false,
  env: {
    NEXT_PUBLIC_R2_PUBLIC_BASE_URL: r2PublicBaseUrl,
  },
  images: {
    minimumCacheTTL: 31536000,
    localPatterns: [
      {
        pathname: "/api/books/**/cover",
      },
    ],
    remotePatterns: r2CoverRemotePatterns(),
  },
  poweredByHeader: false,
};

export default nextConfig;
