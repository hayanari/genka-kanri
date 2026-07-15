import { createClient } from "./client";
import { clearTenantCache } from "../tenant";

/** @deprecated メール直接ログインは廃止。/api/auth/login を使う */
export async function signIn(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  clearTenantCache();
  return data;
}

/** 新規登録は管理者発行に移行。互換のため残置 */
export async function signUp(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  clearTenantCache();
}

export async function updatePassword(newPassword: string) {
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function getSession() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return { user: session?.user ?? null };
}
