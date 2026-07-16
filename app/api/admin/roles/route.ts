/**
 * 会社内ロール変更
 */
import { NextRequest, NextResponse } from "next/server";
import {
  canManageCompany,
  resolveCallerFromToken,
  type CompanyRole,
} from "@/lib/permissions";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

const ALLOWED: CompanyRole[] = ["viewer", "editor", "admin", "owner"];

export async function PATCH(request: NextRequest) {
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
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "SERVICE_ROLE 未設定" }, { status: 503 });
    }

    const body = await request.json();
    const userId = String(body.userId ?? "");
    const companyCode = String(body.companyCode ?? "").toLowerCase();
    const role = String(body.role ?? "") as CompanyRole;
    if (!userId || !companyCode || !ALLOWED.includes(role)) {
      return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
    }
    if (!canManageCompany(caller, companyCode)) {
      return NextResponse.json({ error: "他社の権限は変更できません" }, { status: 403 });
    }

    // 会社オーナー付与: システムオーナー、または自社の会社オーナー
    if (role === "owner" && !caller.isPlatformOwner) {
      if (caller.companyRole !== "owner" || !canManageCompany(caller, companyCode)) {
        return NextResponse.json(
          { error: "会社オーナーの変更は、システムオーナーまたは自社の会社オーナーのみ可能です" },
          { status: 403 }
        );
      }
    }

    const admin = createAdminClient();
    const { data: company } = await admin
      .from("companies")
      .select("id")
      .eq("company_code", companyCode)
      .maybeSingle();
    if (!company) {
      return NextResponse.json({ error: "会社が見つかりません" }, { status: 404 });
    }

    // システムオーナー自身の会社ロールを下げる操作は許可（アカウント削除は別）
    const { data: targetOwner } = await admin
      .from("platform_owners")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (targetOwner && !caller.isPlatformOwner) {
      return NextResponse.json(
        { error: "システムオーナーの権限は変更できません" },
        { status: 403 }
      );
    }

    const { data: updatedRows, error } = await admin
      .from("company_users")
      .update({ role })
      .eq("user_id", userId)
      .eq("company_id", company.id)
      .select("user_id, role");

    if (error) {
      console.error("[admin/roles]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "対象ユーザーの会社所属が見つかりません。一覧を再読み込みしてください。" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, role: updatedRows[0].role });
  } catch (e) {
    console.error("[admin/roles]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
