import type { NextConfig } from "next";

const includeVercelDemoFiles = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.100"],
  devIndicators: false,
  outputFileTracingIncludes: includeVercelDemoFiles
    ? {
        "/*": ["./prisma/dev.db", "./storage/books/**", "./storage/covers/**"],
      }
    : undefined,
  poweredByHeader: false,
};

export default nextConfig;
