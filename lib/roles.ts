"use client";

// ================================================================
// 会社スコープの権限（viewer / editor / admin / owner）
// システムオーナーは常に admin 相当として扱う
// ================================================================
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearTenantCache } from "@/lib/tenant";
import type { CompanyRole } from "@/lib/permissions";
import { COMPANY_ROLE_LABELS } from "@/lib/permissions";

export type UserRole = CompanyRole;

export const ROLE_LABELS = COMPANY_ROLE_LABELS;

let cachedRole: UserRole | null = null;
let cachedEmail: string | null = null;
let cachedCanAccessAdmin: boolean | null = null;
let cachedIsPlatformOwner: boolean | null = null;
let cachedCompanyCode: string | null = null;
let cachedCompanyName: string | null = null;
let cachedAt = 0;

export type CurrentAccess = {
  role: UserRole;
  email: string | null;
  canAccessAdmin: boolean;
  isPlatformOwner: boolean;
  companyCode: string | null;
  companyName: string | null;
};

function rememberAccess(access: CurrentAccess): CurrentAccess {
  cachedRole = access.role;
  cachedEmail = access.email;
  cachedCanAccessAdmin = access.canAccessAdmin;
  cachedIsPlatformOwner = access.isPlatformOwner;
  cachedCompanyCode = access.companyCode;
  cachedCompanyName = access.companyName;
  cachedAt = Date.now();
  return access;
}

export async function fetchCurrentAccess(): Promise<CurrentAccess> {
  // 権限は変更されうるため、短いメモリキャッシュのみ
  const now = Date.now();
  if (
    cachedRole !== null &&
    cachedCanAccessAdmin !== null &&
    cachedAt > 0 &&
    now - cachedAt < 5_000
  ) {
    return {
      role: cachedRole,
      email: cachedEmail,
      canAccessAdmin: cachedCanAccessAdmin,
      isPlatformOwner: cachedIsPlatformOwner ?? false,
      companyCode: cachedCompanyCode,
      companyName: cachedCompanyName,
    };
  }

  const empty: CurrentAccess = {
    role: "viewer",
    email: null,
    canAccessAdmin: false,
    isPlatformOwner: false,
    companyCode: null,
    companyName: null,
  };

  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return rememberAccess(empty);
    }

    const res = await fetch("/api/admin/me", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      // フォールバック: company_users から読む（未所属は viewer）
      const email = session.user.email?.toLowerCase() ?? null;
      const { data: mem } = await supabase
        .from("company_users")
        .select("role, companies(company_code, name)")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!mem) {
        return rememberAccess({
          role: "viewer",
          email,
          canAccessAdmin: false,
          isPlatformOwner: false,
          companyCode: null,
          companyName: null,
        });
      }
      const role = (mem?.role as UserRole) || "viewer";
      const normalized = ["viewer", "editor", "admin", "owner"].includes(role)
        ? role
        : "viewer";
      const company = Array.isArray(mem.companies) ? mem.companies[0] : mem.companies;
      return rememberAccess({
        role: normalized,
        email,
        canAccessAdmin: normalized === "admin" || normalized === "owner",
        isPlatformOwner: false,
        companyCode: company?.company_code ?? null,
        companyName: company?.name ?? null,
      });
    }

    const data = await res.json();
    const companyRole = (data.companyRole as UserRole) || null;
    let role: UserRole =
      (companyRole && ["viewer", "editor", "admin", "owner"].includes(companyRole)
        ? companyRole
        : null) || (data.isPlatformOwner ? "owner" : "viewer");
    if (data.isPlatformOwner && role === "viewer") role = "owner";
    return rememberAccess({
      role,
      email: data.email ?? null,
      canAccessAdmin: Boolean(data.canAccessAdmin),
      isPlatformOwner: Boolean(data.isPlatformOwner),
      companyCode: data.companyCode ?? null,
      companyName: data.companyName ?? null,
    });
  } catch {
    return rememberAccess(empty);
  }
}

/** 現在ログイン中ユーザーの権限を取得（モジュール内キャッシュあり） */
export async function fetchCurrentRole(): Promise<{ role: UserRole; email: string | null }> {
  const a = await fetchCurrentAccess();
  return { role: a.role, email: a.email };
}

/** 書き込み操作が許可されているか */
export async function canWrite(): Promise<boolean> {
  const a = await fetchCurrentAccess();
  if (a.role === "viewer") return false;
  if (a.isPlatformOwner) return true;
  // 会社所属がある入力可以上のみ保存可
  return Boolean(a.companyCode);
}

export function clearRoleCache() {
  cachedRole = null;
  cachedEmail = null;
  cachedCanAccessAdmin = null;
  cachedIsPlatformOwner = null;
  cachedCompanyCode = null;
  cachedCompanyName = null;
  cachedAt = 0;
  clearTenantCache();
}

/** 指定会社の権限一覧（管理画面用） */
export async function fetchCompanyRoles(
  companyCode: string
): Promise<Record<string, UserRole>> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    const res = await fetch(
      `/api/admin/users?company=${encodeURIComponent(companyCode)}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const map: Record<string, UserRole> = {};
    for (const u of data.users ?? []) {
      if (u.email && u.role) map[String(u.email).toLowerCase()] = u.role as UserRole;
    }
    return map;
  } catch {
    return {};
  }
}

/** @deprecated fetchCompanyRoles を使用 */
export async function fetchAllRoles(): Promise<Record<string, UserRole>> {
  return fetchCompanyRoles("all");
}

/** 権限を保存（管理API経由）。失敗時は理由を返す */
export async function saveUserRole(
  userId: string,
  role: UserRole,
  companyCode: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, error: "ログインが必要です" };
    const res = await fetch("/api/admin/roles", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId, role, companyCode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[saveUserRole]", data);
      return { ok: false, error: data.error || "権限の保存に失敗しました" };
    }
    clearRoleCache();
    return { ok: true };
  } catch (e) {
    console.error("[saveUserRole]", e);
    return { ok: false, error: e instanceof Error ? e.message : "通信エラー" };
  }
}

/** React フック: 現在のユーザー権限 */
export function useUserRole(): {
  role: UserRole | null;
  email: string | null;
  canAccessAdmin: boolean;
  isPlatformOwner: boolean;
} {
  const [state, setState] = useState<{
    role: UserRole | null;
    email: string | null;
    canAccessAdmin: boolean;
    isPlatformOwner: boolean;
  }>({
    role: null,
    email: null,
    canAccessAdmin: false,
    isPlatformOwner: false,
  });
  useEffect(() => {
    let mounted = true;
    fetchCurrentAccess().then((r) => {
      if (mounted) {
        setState({
          role: r.role,
          email: r.email,
          canAccessAdmin: r.canAccessAdmin,
          isPlatformOwner: r.isPlatformOwner,
        });
      }
    });
    return () => {
      mounted = false;
    };
  }, []);
  return state;
}
