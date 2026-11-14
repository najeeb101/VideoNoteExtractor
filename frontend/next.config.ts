import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to be reached through Cloudflare quick tunnels.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
