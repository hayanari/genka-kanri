/**
 * アカウント一覧取得 API
 * tokito@tokito-co.jp のみアクセス可
 * company_users を正とし、会社・ログインID付きで返す
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/client";
import {
  createAdminClient,
  isAdminEmail,
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "この操作を行う権限がありません" }, { status: 403 });
    }

    if (!isServiceRoleConfigured()) {
      return NextResponse.json(
        {
          error:
            "サーバーに SUPABASE_SERVICE_ROLE_KEY（Supabase の service_role）が設定されていません。Vercel の Environment Variables に追加し、再デプロイしてください。",
        },
        { status: 503 }
      );
    }

    const admin = createAdminClient();
    const companyFilter = (request.nextUrl.searchParams.get("company") || "").toLowerCase();

    const { data: memberships, error: memErr } = await admin
      .from("company_users")
      .select("user_id, login_id, auth_email, display_name, company_id, companies(company_code, name)");
    if (memErr) {
      console.error("[admin/users] company_users", memErr);
      return NextResponse.json({ error: "所属一覧の取得に失敗しました" }, { status: 500 });
    }

    const { data: { users }, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) {
      console.error("[admin/users]", error);
      return NextResponse.json({ error: "ユーザー一覧の取得に失敗しました" }, { status: 500 });
    }

    const authById = new Map((users ?? []).map((u) => [u.id, u]));

    let list = (memberships ?? []).map((m) => {
      const company = Array.isArray(m.companies) ? m.companies[0] : m.companies;
      const u = authById.get(m.user_id);
      return {
        id: m.user_id,
        email: m.auth_email || u?.email || "",
        loginId: m.login_id || "",
        displayName: m.display_name || "",
        companyCode: company?.company_code ?? "",
        companyName: company?.name ?? "",
        createdAt: u?.created_at ?? null,
        lastSignInAt: u?.last_sign_in_at ?? null,
      };
    });

    if (companyFilter && companyFilter !== "all") {
      list = list.filter((u) => u.companyCode === companyFilter);
    }

    list.sort((a, b) => {
      const c = a.companyCode.localeCompare(b.companyCode);
      if (c !== 0) return c;
      return (a.email || "").localeCompare(b.email || "");
    });

    const { data: companies } = await admin
      .from("companies")
      .select("company_code, name")
      .order("company_code");

    return NextResponse.json({
      users: list,
      companies: companies ?? [],
    });
  } catch (e) {
    console.error("[admin/users]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
