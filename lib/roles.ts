"use client";

// ================================================================
// lib/roles.ts
// ユーザー権限（viewer: 閲覧のみ / editor: 入力可 / admin: 管理者）
// user_roles テーブルに行が無いユーザーは editor として扱う
// ================================================================
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isAdminEmail } from "@/lib/supabase/admin";

export type UserRole = "viewer" | "editor" | "admin";

export const ROLE_LABELS: Record<UserRole, string> = {
  viewer: "閲覧のみ",
  editor: "入力可",
  admin: "管理者",
};

let cachedRole: UserRole | null = null;
let cachedEmail: string | null = null;

/** 現在ログイン中ユーザーの権限を取得（モジュール内キャッシュあり） */
export async function fetchCurrentRole(): Promise<{ role: UserRole; email: string | null }> {
  if (cachedRole !== null) return { role: cachedRole, email: cachedEmail };
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email?.toLowerCase() ?? null;
    cachedEmail = email;
    if (!email) {
      cachedRole = "editor";
      return { role: cachedRole, email };
    }
    if (isAdminEmail(email)) {
      cachedRole = "admin";
      return { role: cachedRole, email };
    }
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("email", email)
      .maybeSingle();
    // テーブル未作成や行なしの場合は editor（従来通り全員入力可）
    if (error || !data?.role) {
      cachedRole = "editor";
    } else {
      cachedRole = (["viewer", "editor", "admin"].includes(data.role)
        ? data.role
        : "editor") as UserRole;
    }
    return { role: cachedRole, email };
  } catch {
    cachedRole = "editor";
    return { role: "editor", email: cachedEmail };
  }
}

/** 書き込み操作が許可されているか */
export async function canWrite(): Promise<boolean> {
  const { role } = await fetchCurrentRole();
  return role !== "viewer";
}

export function clearRoleCache() {
  cachedRole = null;
  cachedEmail = null;
}

/** 全ユーザーの権限一覧（管理画面用） */
export async function fetchAllRoles(): Promise<Record<string, UserRole>> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.from("user_roles").select("email, role");
    if (error) return {};
    const map: Record<string, UserRole> = {};
    for (const r of data ?? []) {
      map[(r.email as string).toLowerCase()] = r.role as UserRole;
    }
    return map;
  } catch {
    return {};
  }
}

/** 権限を保存（管理画面用） */
export async function saveUserRole(email: string, role: UserRole): Promise<boolean> {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("user_roles")
      .upsert(
        { email: email.toLowerCase(), role, updated_at: new Date().toISOString() },
        { onConflict: "email" }
      );
    if (error) {
      console.error("[saveUserRole]", error);
      return false;
    }
    if (email.toLowerCase() === cachedEmail) cachedRole = role;
    return true;
  } catch (e) {
    console.error("[saveUserRole]", e);
    return false;
  }
}

/** React フック: 現在のユーザー権限 */
export function useUserRole(): { role: UserRole | null; email: string | null } {
  const [state, setState] = useState<{ role: UserRole | null; email: string | null }>({
    role: null,
    email: null,
  });
  useEffect(() => {
    let mounted = true;
    fetchCurrentRole().then((r) => {
      if (mounted) setState(r);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return state;
}
