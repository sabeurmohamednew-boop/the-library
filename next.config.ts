import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.100"],
  devIndicators: false,
  images: {
    localPatterns: [
      {
        pathname: "/api/books/**/cover",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  poweredByHeader: false,
};

export default nextConfig;
