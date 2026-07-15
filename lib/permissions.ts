/**
 * 権限モデル
 * - システムオーナー (platform_owners): 全会社を横断して管理
 * - 会社 owner/admin: 自社のユーザー・権限のみ管理
 * - editor/viewer: 自社データ操作（viewer は閲覧のみ）
 */
import { createClient } from "@supabase/supabase-js";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

export type CompanyRole = "viewer" | "editor" | "admin" | "owner";

export type CallerContext = {
  userId: string;
  email: string;
  isPlatformOwner: boolean;
  /** 所属会社（1ユーザー1社） */
  companyId: string | null;
  companyCode: string | null;
  companyName: string | null;
  companyRole: CompanyRole | null;
  /** アカウント管理画面に入れるか */
  canAccessAdmin: boolean;
};

export const COMPANY_ROLE_LABELS: Record<CompanyRole, string> = {
  viewer: "閲覧のみ",
  editor: "入力可",
  admin: "会社管理者",
  owner: "会社オーナー",
};

function anonAuthedClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function resolveCallerFromToken(token: string): Promise<CallerContext | null> {
  const supabase = anonAuthedClient(token);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return resolveCaller(user.id, user.email ?? "");
}

export async function resolveCaller(userId: string, email: string): Promise<CallerContext> {
  if (!isServiceRoleConfigured()) {
    return {
      userId,
      email: email.toLowerCase(),
      isPlatformOwner: email.toLowerCase() === "tokito@tokito-co.jp",
      companyId: null,
      companyCode: null,
      companyName: null,
      companyRole: null,
      canAccessAdmin: email.toLowerCase() === "tokito@tokito-co.jp",
    };
  }

  const admin = createAdminClient();
  const emailLower = email.toLowerCase();

  const [{ data: ownerRow }, { data: membership }] = await Promise.all([
    admin.from("platform_owners").select("user_id").eq("user_id", userId).maybeSingle(),
    admin
      .from("company_users")
      .select("company_id, role, companies(company_code, name)")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const isPlatformOwner = Boolean(ownerRow);
  const company = Array.isArray(membership?.companies)
    ? membership?.companies[0]
    : membership?.companies;
  const companyRole = (membership?.role as CompanyRole | undefined) ?? null;
  const canAccessAdmin =
    isPlatformOwner || companyRole === "admin" || companyRole === "owner";

  return {
    userId,
    email: emailLower,
    isPlatformOwner,
    companyId: membership?.company_id ?? null,
    companyCode: company?.company_code ?? null,
    companyName: company?.name ?? null,
    companyRole,
    canAccessAdmin,
  };
}

/** 対象会社を管理できるか */
export function canManageCompany(caller: CallerContext, companyCode: string): boolean {
  if (caller.isPlatformOwner) return true;
  if (!caller.canAccessAdmin) return false;
  return (caller.companyCode || "").toLowerCase() === companyCode.toLowerCase();
}

/** @deprecated 互換用。システムオーナー判定は platform_owners を使う */
export function isAdminEmail(email: string | null | undefined): boolean {
  return email?.toLowerCase() === "tokito@tokito-co.jp";
}
