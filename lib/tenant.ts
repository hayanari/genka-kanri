/** マルチテナント（会社単位）ヘルパー */

export const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_COMPANY_CODE = "tokito";

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

type TenantCache = {
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

  if (error || !data) {
    // 未紐付けの既存ユーザー向けフォールバック（SQL適用直後）
    cachedUserId = user.id;
    cachedTenant = {
      companyId: DEFAULT_COMPANY_ID,
      companyCode: DEFAULT_COMPANY_CODE,
      companyName: "未設定の会社",
      loginId: user.email?.split("@")[0] ?? "user",
    };
    return cachedTenant;
  }

  const company = Array.isArray(data.companies) ? data.companies[0] : data.companies;
  const code = String(company?.company_code ?? DEFAULT_COMPANY_CODE);
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

export async function getCompanyDataId(): Promise<string> {
  const tenant = await fetchCurrentTenant();
  return tenant?.companyId ?? DEFAULT_COMPANY_ID;
}

export async function requireCompanyId(): Promise<string> {
  return getCompanyDataId();
}
