import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 音声入力があるためマイクは self を許可
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(self), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // ネットワーク経由アクセス時のクロスオリジン警告を解消
  allowedDevOrigins: ["http://localhost:3000", "http://192.168.1.24:3000"],
  async headers() {
    // CSP は既存の inline style と衝突するため追加しない
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
