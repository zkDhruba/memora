import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@memora/shared", "@memora/db"],
};

export default nextConfig;
