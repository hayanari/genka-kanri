/**
 * 会社削除 API（システムオーナーのみ）
 * 関連ユーザー・データもまとめて削除。tokito は削除不可。
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveCallerFromToken } from "@/lib/permissions";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { DEFAULT_COMPANY_CODE, normalizeCompanyCode } from "@/lib/tenant";

const TABLES_WITH_COMPANY_ID = [
  "cross_schedule_stickies",
  "cross_schedule_marks",
  "cross_schedule_cells",
  "cross_schedule_rows",
  "schedule_entries",
  "schedule_workers",
  "schedule_day_memos",
  "worker_contacts",
  "process_meeting_rows",
  "process_meeting_project_notes",
  "audit_logs",
  "genka_kanri_backups",
] as const;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ companyCode: string }> }
) {
  try {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const caller = await resolveCallerFromToken(token);
    if (!caller?.isPlatformOwner) {
      return NextResponse.json({ error: "会社削除はシステムオーナーのみ可能です" }, { status: 403 });
    }
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
    }

    const { companyCode: raw } = await params;
    const companyCode = normalizeCompanyCode(decodeURIComponent(raw || ""));
    if (!companyCode) {
      return NextResponse.json({ error: "会社IDが必要です" }, { status: 400 });
    }
    if (companyCode === DEFAULT_COMPANY_CODE) {
      return NextResponse.json(
        { error: `基幹会社（${DEFAULT_COMPANY_CODE}）は削除できません` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: company, error: cErr } = await admin
      .from("companies")
      .select("id, company_code, name")
      .eq("company_code", companyCode)
      .maybeSingle();
    if (cErr || !company) {
      return NextResponse.json({ error: "会社が見つかりません" }, { status: 404 });
    }

    const { data: members } = await admin
      .from("company_users")
      .select("user_id")
      .eq("company_id", company.id);

    const userIds = (members ?? []).map((m) => m.user_id).filter(Boolean) as string[];

    // プラットフォームオーナーがこの会社にだけ所属している場合は削除しない
    if (userIds.length > 0) {
      const { data: owners } = await admin
        .from("platform_owners")
        .select("user_id")
        .in("user_id", userIds);
      if ((owners ?? []).length > 0) {
        return NextResponse.json(
          { error: "システムオーナーが所属する会社は削除できません" },
          { status: 400 }
        );
      }
    }

    // 関連テーブル掃除（FK が CASCADE でないもの）
    for (const table of TABLES_WITH_COMPANY_ID) {
      const { error } = await admin.from(table).delete().eq("company_id", company.id);
      if (error && !/does not exist|relation/i.test(error.message)) {
        console.warn(`[admin/companies delete] ${table}:`, error.message);
      }
    }

    await admin.from("genka_kanri_data").delete().eq("id", company.id);
    await admin.from("process_meeting_meta").delete().eq("id", company.id);
    await admin
      .from("company_signup_requests")
      .update({ approved_company_id: null, approved_user_id: null })
      .eq("approved_company_id", company.id);

    // Auth ユーザー削除（company_users は CASCADE）
    for (const userId of userIds) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        console.warn("[admin/companies delete] auth user", userId, error.message);
      }
    }

    // 残った company_users があれば削除
    await admin.from("company_users").delete().eq("company_id", company.id);

    const { error: delErr } = await admin.from("companies").delete().eq("id", company.id);
    if (delErr) {
      console.error("[admin/companies delete]", delErr);
      return NextResponse.json(
        { error: `会社の削除に失敗しました: ${delErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      companyCode: company.company_code,
      companyName: company.name,
      deletedUsers: userIds.length,
    });
  } catch (e) {
    console.error("[admin/companies DELETE]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
