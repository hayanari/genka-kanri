/**
 * 会社の無効化・再有効化・名称変更 / 削除
 * システムオーナーのみ
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

async function requirePlatformOwner(request: NextRequest) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) } as const;
  }
  const caller = await resolveCallerFromToken(token);
  if (!caller?.isPlatformOwner) {
    return {
      error: NextResponse.json(
        { error: "この操作はシステムオーナーのみ可能です" },
        { status: 403 }
      ),
    } as const;
  }
  if (!isServiceRoleConfigured()) {
    return {
      error: NextResponse.json({ error: "server misconfigured" }, { status: 500 }),
    } as const;
  }
  return { admin: createAdminClient() } as const;
}

/** 会社の有効/無効・名称変更 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ companyCode: string }> }
) {
  try {
    const gate = await requirePlatformOwner(request);
    if ("error" in gate) return gate.error;
    const { admin } = gate;

    const { companyCode: raw } = await params;
    const companyCode = normalizeCompanyCode(decodeURIComponent(raw || ""));
    if (!companyCode) {
      return NextResponse.json({ error: "会社IDが必要です" }, { status: 400 });
    }

    const body = await request.json();
    const patch: { is_active?: boolean; name?: string } = {};
    if (typeof body.isActive === "boolean") {
      if (body.isActive === false && companyCode === DEFAULT_COMPANY_CODE) {
        return NextResponse.json(
          { error: `基幹会社（${DEFAULT_COMPANY_CODE}）は無効化できません` },
          { status: 400 }
        );
      }
      patch.is_active = body.isActive;
    }
    if (typeof body.name === "string" && body.name.trim()) {
      patch.name = body.name.trim();
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "isActive または name を指定してください" },
        { status: 400 }
      );
    }

    const { data: updated, error } = await admin
      .from("companies")
      .update(patch)
      .eq("company_code", companyCode)
      .select("id, company_code, name, is_active")
      .maybeSingle();
    if (error) {
      console.error("[admin/companies PATCH]", error);
      return NextResponse.json(
        {
          error: /is_active/i.test(error.message)
            ? "is_active 列がありません。supabase/companies_is_active.sql を実行してください"
            : error.message,
        },
        { status: 500 }
      );
    }
    if (!updated) {
      return NextResponse.json({ error: "会社が見つかりません" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      company: {
        id: updated.id,
        companyCode: updated.company_code,
        name: updated.name,
        isActive: updated.is_active !== false,
      },
    });
  } catch (e) {
    console.error("[admin/companies PATCH]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ companyCode: string }> }
) {
  try {
    const gate = await requirePlatformOwner(request);
    if ("error" in gate) return gate.error;
    const { admin } = gate;

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

    for (const userId of userIds) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        console.warn("[admin/companies delete] auth user", userId, error.message);
      }
    }

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
