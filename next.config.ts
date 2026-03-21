import type { NextConfig } from "next";
import withPWA from "next-pwa";

const pwaConfig = withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // 👇 THIS IS THE KEY LINE
  turbopack: {},

  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
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
};

export default pwaConfig(nextConfig);
