/**
 * アカウント一覧取得 API
 * tokito@tokito-co.jp のみアクセス可
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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
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
    const { data: { users }, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) {
      console.error("[admin/users]", error);
      return NextResponse.json({ error: "ユーザー一覧の取得に失敗しました" }, { status: 500 });
    }

    const list = (users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? "",
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
    }));
    return NextResponse.json({ users: list });
  } catch (e) {
    console.error("[admin/users]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
