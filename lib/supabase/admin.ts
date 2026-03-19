/**
 * Supabase 管理用クライアント（サーバー専用・service_role）
 * 環境変数 SUPABASE_SERVICE_ROLE_KEY が必要です。
 */
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "tokito@tokito-co.jp";

export function isAdminEmail(email: string | undefined): boolean {
  return email?.toLowerCase() === ADMIN_EMAIL;
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません。.env.local に追加してください。");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
