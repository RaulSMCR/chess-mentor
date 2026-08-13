import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 protects development-only assets from cross-site requests. The
  // LAN command intentionally exposes the dev server to a private network,
  // so allow private IPv4 clients to load the JavaScript bundles as well as
  // the initial HTML document. Production builds are unaffected.
  allowedDevOrigins: ["10.*.*.*", "172.*.*.*", "192.168.*.*"],
};

export default nextConfig;
