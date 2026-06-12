import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ネットワーク経由アクセス時のクロスオリジン警告を解消
  allowedDevOrigins: ["http://localhost:3000", "http://192.168.1.24:3000"],
};

export default nextConfig;
