/**
 * ユーザー削除 API
 * システムオーナー or 自社会社管理者のみ。システムオーナー本人は削除不可。
 */
import { NextRequest, NextResponse } from "next/server";
import {
  createAdminClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";
import {
  canManageCompany,
  resolveCallerFromToken,
} from "@/lib/permissions";

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

    const caller = await resolveCallerFromToken(token);
    if (!caller) {
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }
    if (!caller.canAccessAdmin) {
      return NextResponse.json({ error: "この操作を行う権限がありません" }, { status: 403 });
    }

    const { userId } = await params;
    if (!userId) {
      return NextResponse.json({ error: "ユーザーIDが必要です" }, { status: 400 });
    }
    if (userId === caller.userId) {
      return NextResponse.json({ error: "自分自身のアカウントは削除できません" }, { status: 400 });
    }

    if (!isServiceRoleConfigured()) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY が設定されていません。" },
        { status: 503 }
      );
    }

    const admin = createAdminClient();

    const { data: targetOwner } = await admin
      .from("platform_owners")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (targetOwner) {
      return NextResponse.json(
        { error: "システムオーナーは削除できません" },
        { status: 403 }
      );
    }

    const { data: membership } = await admin
      .from("company_users")
      .select("company_id, companies(company_code)")
      .eq("user_id", userId)
      .maybeSingle();
    const company = Array.isArray(membership?.companies)
      ? membership?.companies[0]
      : membership?.companies;
    const code = company?.company_code;
    if (!code || !canManageCompany(caller, code)) {
      return NextResponse.json({ error: "他社のユーザーは削除できません" }, { status: 403 });
    }

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
