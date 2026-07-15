/**
 * アカウント一覧取得 API
 * システムオーナー: 全社 / 会社管理者: 自社のみ
 */
import { NextRequest, NextResponse } from "next/server";
import {
  canManageCompany,
  resolveCallerFromToken,
} from "@/lib/permissions";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const caller = await resolveCallerFromToken(token);
    if (!caller) {
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }
    if (!caller.canAccessAdmin) {
      return NextResponse.json({ error: "この操作を行う権限がありません" }, { status: 403 });
    }

    if (!isServiceRoleConfigured()) {
      return NextResponse.json(
        {
          error:
            "サーバーに SUPABASE_SERVICE_ROLE_KEY が設定されていません。",
        },
        { status: 503 }
      );
    }

    const admin = createAdminClient();
    let companyFilter = (request.nextUrl.searchParams.get("company") || "").toLowerCase();

    // 会社管理者は自社固定
    if (!caller.isPlatformOwner) {
      companyFilter = (caller.companyCode || "").toLowerCase();
      if (!companyFilter) {
        return NextResponse.json({ error: "会社所属がありません" }, { status: 403 });
      }
    }

    const { data: memberships, error: memErr } = await admin
      .from("company_users")
      .select(
        "user_id, login_id, auth_email, display_name, role, company_id, companies(company_code, name)"
      );
    if (memErr) {
      console.error("[admin/users] company_users", memErr);
      return NextResponse.json({ error: "所属一覧の取得に失敗しました" }, { status: 500 });
    }

    const {
      data: { users },
      error,
    } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) {
      console.error("[admin/users]", error);
      return NextResponse.json({ error: "ユーザー一覧の取得に失敗しました" }, { status: 500 });
    }

    const authById = new Map((users ?? []).map((u) => [u.id, u]));
    const { data: platformOwners } = await admin.from("platform_owners").select("user_id, email");
    const platformOwnerIds = new Set((platformOwners ?? []).map((p) => p.user_id));

    let list = (memberships ?? []).map((m) => {
      const company = Array.isArray(m.companies) ? m.companies[0] : m.companies;
      const u = authById.get(m.user_id);
      return {
        id: m.user_id,
        email: m.auth_email || u?.email || "",
        loginId: m.login_id || "",
        displayName: m.display_name || "",
        role: m.role || "editor",
        companyCode: company?.company_code ?? "",
        companyName: company?.name ?? "",
        isPlatformOwner: platformOwnerIds.has(m.user_id),
        createdAt: u?.created_at ?? null,
        lastSignInAt: u?.last_sign_in_at ?? null,
      };
    });

    if (companyFilter && companyFilter !== "all") {
      if (!canManageCompany(caller, companyFilter)) {
        return NextResponse.json({ error: "他社は閲覧できません" }, { status: 403 });
      }
      list = list.filter((u) => u.companyCode === companyFilter);
    } else if (!caller.isPlatformOwner) {
      list = list.filter((u) => u.companyCode === caller.companyCode);
    }

    list.sort((a, b) => {
      const c = a.companyCode.localeCompare(b.companyCode);
      if (c !== 0) return c;
      return (a.email || "").localeCompare(b.email || "");
    });

    let companiesQuery = admin.from("companies").select("company_code, name").order("company_code");
    const { data: allCompanies } = await companiesQuery;
    const companies = caller.isPlatformOwner
      ? allCompanies ?? []
      : (allCompanies ?? []).filter((c) => c.company_code === caller.companyCode);

    return NextResponse.json({
      users: list,
      companies,
      caller: {
        isPlatformOwner: caller.isPlatformOwner,
        companyCode: caller.companyCode,
        canAccessAdmin: caller.canAccessAdmin,
      },
    });
  } catch (e) {
    console.error("[admin/users]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
