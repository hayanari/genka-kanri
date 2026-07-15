/**
 * 会社管理者 / システムオーナー向け: ログインID付きユーザーを発行
 */
import { NextRequest, NextResponse } from "next/server";
import {
  createAdminClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";
import {
  buildAuthEmail,
  normalizeCompanyCode,
  normalizeLoginId,
} from "@/lib/tenant";
import {
  canManageCompany,
  resolveCallerFromToken,
  type CompanyRole,
} from "@/lib/permissions";

export async function POST(request: NextRequest) {
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
        { error: "SUPABASE_SERVICE_ROLE_KEY が設定されていません" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const companyCode = normalizeCompanyCode(
      String(body.companyCode ?? caller.companyCode ?? "")
    );
    const loginId = normalizeLoginId(String(body.loginId ?? ""));
    const password = String(body.password ?? "");
    const displayName = String(body.displayName ?? loginId).trim();
    const role = (String(body.role ?? "editor") as CompanyRole) || "editor";

    if (!companyCode) {
      return NextResponse.json({ error: "会社IDが必要です" }, { status: 400 });
    }
    if (!canManageCompany(caller, companyCode)) {
      return NextResponse.json({ error: "他社のユーザーは作成できません" }, { status: 403 });
    }
    if (!loginId || loginId.includes("@") || password.length < 6) {
      return NextResponse.json(
        {
          error: "ログインID（@なし）と6文字以上のパスワードを指定してください",
        },
        { status: 400 }
      );
    }
    if (role === "owner" && !caller.isPlatformOwner) {
      return NextResponse.json(
        { error: "会社オーナーの作成はシステムオーナーのみ可能です" },
        { status: 403 }
      );
    }

    const admin = createAdminClient();
    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id, company_code")
      .eq("company_code", companyCode)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json({ error: "会社が見つかりません" }, { status: 404 });
    }

    const authEmail = buildAuthEmail(company.company_code, loginId);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: {
        company_code: company.company_code,
        login_id: loginId,
        name: displayName,
      },
    });

    if (createError || !created.user) {
      console.error("[admin/company-users]", createError);
      return NextResponse.json(
        { error: createError?.message ?? "ユーザー作成に失敗しました" },
        { status: 400 }
      );
    }

    const { error: linkError } = await admin.from("company_users").upsert(
      {
        company_id: company.id,
        user_id: created.user.id,
        login_id: loginId,
        auth_email: authEmail,
        display_name: displayName,
        role: ["viewer", "editor", "admin", "owner"].includes(role) ? role : "editor",
      },
      { onConflict: "user_id" }
    );

    if (linkError) {
      console.error("[admin/company-users] link", linkError);
      return NextResponse.json(
        { error: "ユーザーは作成されましたが会社への紐付けに失敗しました" },
        { status: 500 }
      );
    }

    await admin.from("genka_kanri_data").upsert(
      {
        id: company.id,
        data: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    return NextResponse.json({
      ok: true,
      user: {
        id: created.user.id,
        loginId,
        companyCode: company.company_code,
        role,
      },
    });
  } catch (e) {
    console.error("[admin/company-users]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
