import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the root: a stray lockfile higher up (e.g. in the home folder) otherwise confuses detection.
  turbopack: { root: __dirname },
};

export default nextConfig;
