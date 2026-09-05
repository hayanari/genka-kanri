/**
 * ユーザー削除 / 役員フラグ更新
 * システムオーナー or 自社会社管理者のみ。
 */
import { NextRequest, NextResponse } from "next/server";
import {
  createAdminClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";
import {
  canManageCompany,
  resolveCallerFromToken,
  type CallerContext,
} from "@/lib/permissions";
import type { SupabaseClient } from "@supabase/supabase-js";

async function requireAdminCaller(
  request: NextRequest
): Promise<
  | { caller: CallerContext; admin: SupabaseClient; error?: undefined }
  | { error: NextResponse; caller?: undefined; admin?: undefined }
> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  const caller = await resolveCallerFromToken(token);
  if (!caller) {
    return { error: NextResponse.json({ error: "認証に失敗しました" }, { status: 401 }) };
  }
  if (!caller.canAccessAdmin) {
    return {
      error: NextResponse.json({ error: "この操作を行う権限がありません" }, { status: 403 }),
    };
  }
  if (!isServiceRoleConfigured()) {
    return {
      error: NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY が設定されていません。" },
        { status: 503 }
      ),
    };
  }
  return { caller, admin: createAdminClient() };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const gate = await requireAdminCaller(request);
    if (gate.error) return gate.error;
    const { caller, admin } = gate;

    const { userId } = await params;
    const body = await request.json();
    if (typeof body.isExecutive !== "boolean") {
      return NextResponse.json({ error: "isExecutive が必要です" }, { status: 400 });
    }

    // 自分で自分を役員昇格させない
    if (userId === caller.userId && body.isExecutive === true && !caller.isPlatformOwner) {
      const { data: me } = await admin
        .from("company_users")
        .select("is_executive, role")
        .eq("user_id", caller.userId)
        .maybeSingle();
      const already =
        Boolean(me?.is_executive) || me?.role === "admin" || me?.role === "owner";
      if (!already) {
        return NextResponse.json(
          { error: "自分で自分を役員に昇格することはできません" },
          { status: 403 }
        );
      }
    }

    const { data: membership } = await admin
      .from("company_users")
      .select("company_id, companies(company_code)")
      .eq("user_id", userId)
      .maybeSingle();
    const company = Array.isArray(membership?.companies)
      ? membership?.companies[0]
      : membership?.companies;
    const code = (company as { company_code?: string } | null)?.company_code;
    if (!code || !canManageCompany(caller, code)) {
      return NextResponse.json({ error: "他社のユーザーは変更できません" }, { status: 403 });
    }

    const { error } = await admin
      .from("company_users")
      .update({ is_executive: body.isExecutive })
      .eq("user_id", userId);
    if (error) {
      console.error("[admin/users patch]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, isExecutive: body.isExecutive });
  } catch (e) {
    console.error("[admin/users patch]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const gate = await requireAdminCaller(request);
    if (gate.error) return gate.error;
    const { caller, admin } = gate;

    const { userId } = await params;
    if (!userId) {
      return NextResponse.json({ error: "ユーザーIDが必要です" }, { status: 400 });
    }
    if (userId === caller.userId) {
      return NextResponse.json({ error: "自分自身のアカウントは削除できません" }, { status: 400 });
    }

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
    const code = (company as { company_code?: string } | null)?.company_code;
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
