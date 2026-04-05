import { existsSync } from "fs";
import { join } from "path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const cwd = process.cwd();
// 内側のフォルダで dev したとき、ひとつ上のフォルダの .env.local も拾う（本番と同じ変数を親だけに置いた場合）
const parentDir = join(cwd, "..");
if (
  existsSync(join(parentDir, ".env.local")) ||
  existsSync(join(parentDir, ".env"))
) {
  loadEnvConfig(parentDir);
}
loadEnvConfig(cwd);

const nextConfig: NextConfig = {
  // ネットワーク経由アクセス時のクロスオリジン警告を解消
  allowedDevOrigins: ["http://localhost:3000", "http://192.168.1.24:3000"],
};

export default nextConfig;
