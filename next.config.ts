import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.100"],
  devIndicators: false,
  poweredByHeader: false,
};

export default nextConfig;
