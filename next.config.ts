
import type { NextConfig } from "next";
import withPWA from "next-pwa";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  devIndicators: false,

  turbopack: {},

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

  allowedDevOrigins: [
    "192.168.0.121",
  ],
};

const pwaConfig = withPWA({
  dest: "public",

  disable: process.env.NODE_ENV === "development",

  register: true,

  skipWaiting: true,
});

export default pwaConfig(nextConfig);