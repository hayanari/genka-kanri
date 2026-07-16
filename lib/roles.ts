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

export type CurrentAccess = {
  role: UserRole;
  email: string | null;
  canAccessAdmin: boolean;
  isPlatformOwner: boolean;
  companyCode: string | null;
  companyName: string | null;
};

export async function fetchCurrentAccess(): Promise<CurrentAccess> {
  if (cachedRole !== null && cachedCanAccessAdmin !== null) {
    return {
      role: cachedRole,
      email: cachedEmail,
      canAccessAdmin: cachedCanAccessAdmin,
      isPlatformOwner: cachedIsPlatformOwner ?? false,
      companyCode: null,
      companyName: null,
    };
  }

  const empty: CurrentAccess = {
    role: "editor",
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
      cachedRole = "editor";
      cachedCanAccessAdmin = false;
      cachedIsPlatformOwner = false;
      return empty;
    }

    const res = await fetch("/api/admin/me", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      // フォールバック: company_users から読む（未所属は viewer）
      const email = session.user.email?.toLowerCase() ?? null;
      cachedEmail = email;
      const { data: mem } = await supabase
        .from("company_users")
        .select("role, companies(company_code, name)")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!mem) {
        cachedRole = "viewer";
        cachedCanAccessAdmin = false;
        cachedIsPlatformOwner = false;
        return {
          role: "viewer",
          email,
          canAccessAdmin: false,
          isPlatformOwner: false,
          companyCode: null,
          companyName: null,
        };
      }
      const role = (mem?.role as UserRole) || "viewer";
      cachedRole = ["viewer", "editor", "admin", "owner"].includes(role) ? role : "viewer";
      cachedCanAccessAdmin = cachedRole === "admin" || cachedRole === "owner";
      cachedIsPlatformOwner = false;
      const company = Array.isArray(mem.companies) ? mem.companies[0] : mem.companies;
      return {
        role: cachedRole,
        email,
        canAccessAdmin: cachedCanAccessAdmin,
        isPlatformOwner: false,
        companyCode: company?.company_code ?? null,
        companyName: company?.name ?? null,
      };
    }

    const data = await res.json();
    cachedEmail = data.email ?? null;
    cachedRole = (data.companyRole as UserRole) || (data.isPlatformOwner ? "owner" : "editor");
    if (data.isPlatformOwner) cachedRole = "owner";
    cachedCanAccessAdmin = Boolean(data.canAccessAdmin);
    cachedIsPlatformOwner = Boolean(data.isPlatformOwner);
    return {
      role: cachedRole!,
      email: cachedEmail,
      canAccessAdmin: cachedCanAccessAdmin!,
      isPlatformOwner: cachedIsPlatformOwner!,
      companyCode: data.companyCode ?? null,
      companyName: data.companyName ?? null,
    };
  } catch {
    cachedRole = "viewer";
    cachedCanAccessAdmin = false;
    cachedIsPlatformOwner = false;
    return empty;
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
  if (!a.companyCode && !a.isPlatformOwner) return false;
  return a.role !== "viewer";
}

export function clearRoleCache() {
  cachedRole = null;
  cachedEmail = null;
  cachedCanAccessAdmin = null;
  cachedIsPlatformOwner = null;
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

/** 権限を保存（管理API経由） */
export async function saveUserRole(
  userId: string,
  role: UserRole,
  companyCode: string
): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return false;
    const res = await fetch("/api/admin/roles", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId, role, companyCode }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("[saveUserRole]", data);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[saveUserRole]", e);
    return false;
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
