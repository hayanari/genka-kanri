/** マルチテナント（会社単位）ヘルパー */

export const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_COMPANY_CODE = "tokito";

export class TenantRequiredError extends Error {
  constructor(message = "会社に所属していないため操作できません") {
    super(message);
    this.name = "TenantRequiredError";
  }
}

/** 新規ユーザー用の内部メール（画面には出さない） */
export function buildAuthEmail(companyCode: string, loginId: string): string {
  const code = companyCode.trim().toLowerCase();
  const login = loginId.trim().toLowerCase();
  return `${login}@${code}.genka.local`;
}

export function normalizeCompanyCode(code: string): string {
  return code.trim().toLowerCase();
}

export function normalizeLoginId(loginId: string): string {
  return loginId.trim().toLowerCase();
}

export type TenantCache = {
  companyId: string;
  companyCode: string;
  companyName: string;
  loginId: string;
};

let cachedTenant: TenantCache | null = null;
let cachedUserId: string | null = null;

export function clearTenantCache(): void {
  cachedTenant = null;
  cachedUserId = null;
}

/**
 * ログイン中ユーザーの所属会社を返す。
 * 未所属は null（他社フォールバックはしない）。
 */
export async function fetchCurrentTenant(): Promise<TenantCache | null> {
  const { createClient } = await import("./supabase/client");
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    clearTenantCache();
    return null;
  }
  if (cachedTenant && cachedUserId === user.id) return cachedTenant;

  const { data, error } = await supabase
    .from("company_users")
    .select("login_id, company_id, companies(id, company_code, name)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data?.company_id) {
    console.warn("[tenant] company_users 未紐付け", user.id, error?.message);
    clearTenantCache();
    return null;
  }

  const company = Array.isArray(data.companies) ? data.companies[0] : data.companies;
  const code = String(company?.company_code ?? "").trim();
  if (!code) {
    console.warn("[tenant] companies 行がありません", data.company_id);
    clearTenantCache();
    return null;
  }
  const name = String(company?.name ?? "").trim() || code;
  cachedUserId = user.id;
  cachedTenant = {
    companyId: String(data.company_id),
    companyCode: code,
    companyName: name,
    loginId: String(data.login_id),
  };
  return cachedTenant;
}

/** 自社データ行ID。未所属は null */
export async function getCompanyDataId(): Promise<string | null> {
  const tenant = await fetchCurrentTenant();
  return tenant?.companyId ?? null;
}

/** 自社 company_id。未所属は throw */
export async function requireCompanyId(): Promise<string> {
  const id = await getCompanyDataId();
  if (!id) throw new TenantRequiredError();
  return id;
}
