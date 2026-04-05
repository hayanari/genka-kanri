/**
 * ユーザー削除 API
 * tokito@tokito-co.jp のみアクセス可
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/client";
import {
  createAdminClient,
  isAdminEmail,
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
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

    const { userId } = await params;
    if (!userId) {
      return NextResponse.json({ error: "ユーザーIDが必要です" }, { status: 400 });
    }

    // 自分自身は削除不可
    if (userId === user.id) {
      return NextResponse.json({ error: "自分自身のアカウントは削除できません" }, { status: 400 });
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
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("[admin/users delete]", error);
      return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/users delete]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
