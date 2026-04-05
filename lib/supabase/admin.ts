/**
 * Supabase 管理用クライアント（サーバー専用・service_role）
 * 環境変数 SUPABASE_SERVICE_ROLE_KEY が必要です。
 */
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "tokito@tokito-co.jp";

export function isAdminEmail(email: string | null | undefined): boolean {
  return email?.toLowerCase() === ADMIN_EMAIL;
}

/** アカウント管理 API 用。未設定のときは createAdminClient が例外になるため、先に判定する。 */
export function isServiceRoleConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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
