// next.config.ts
import type { NextConfig } from "next";
import withPWA from "next-pwa";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "192.168.0.121",
        port: "3000",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "192.168.0.121",
        port: "3000",
        pathname: "/**",
      },
    ],
  },
  allowedDevOrigins: ['192.168.0.121'],
};

// ✅ Only apply PWA in production
const config = process.env.NODE_ENV === "production" 
  ? withPWA({
      dest: "public",
      register: true,
      skipWaiting: true,
    })(nextConfig)
  : nextConfig;

export default config;