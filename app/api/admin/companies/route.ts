/**
 * 会社一覧・新規作成（システムオーナーのみ）
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveCallerFromToken } from "@/lib/permissions";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import {
  buildAuthEmail,
  normalizeCompanyCode,
  normalizeLoginId,
} from "@/lib/tenant";
import { randomBytes } from "crypto";

export type CompanyListItem = {
  id: string;
  companyCode: string;
  name: string;
  isActive: boolean;
  userCount: number;
  createdAt: string | null;
};

function isValidCompanyCode(code: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{1,31}$/.test(code);
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const caller = await resolveCallerFromToken(token);
    if (!caller?.isPlatformOwner) {
      return NextResponse.json(
        { error: "会社一覧の全件取得はシステムオーナーのみ可能です" },
        { status: 403 }
      );
    }
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
    }

    const admin = createAdminClient();
    let companies: {
      id: string;
      company_code: string;
      name: string;
      is_active?: boolean | null;
      created_at?: string | null;
    }[] | null = null;
    {
      const first = await admin
        .from("companies")
        .select("id, company_code, name, is_active, created_at")
        .order("company_code");
      if (first.error && /is_active/i.test(first.error.message)) {
        const retry = await admin
          .from("companies")
          .select("id, company_code, name, created_at")
          .order("company_code");
        if (retry.error) {
          console.error("[admin/companies GET]", retry.error);
          return NextResponse.json({ error: "会社一覧の取得に失敗しました" }, { status: 500 });
        }
        companies = retry.data;
      } else if (first.error) {
        console.error("[admin/companies GET]", first.error);
        return NextResponse.json({ error: "会社一覧の取得に失敗しました" }, { status: 500 });
      } else {
        companies = first.data;
      }
    }

    const { data: members } = await admin.from("company_users").select("company_id");
    const countByCompany = new Map<string, number>();
    for (const m of members ?? []) {
      const id = String(m.company_id);
      countByCompany.set(id, (countByCompany.get(id) ?? 0) + 1);
    }

    const list: CompanyListItem[] = (companies ?? []).map((c) => ({
      id: c.id,
      companyCode: c.company_code,
      name: c.name,
      isActive: c.is_active !== false,
      userCount: countByCompany.get(c.id) ?? 0,
      createdAt: c.created_at ?? null,
    }));

    return NextResponse.json({ companies: list });
  } catch (e) {
    console.error("[admin/companies GET]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}

/**
 * 会社を追加（任意で初期オーナーも作成）
 * body: { companyCode, name, ownerLoginId?, ownerPassword?, ownerDisplayName? }
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const caller = await resolveCallerFromToken(token);
    if (!caller?.isPlatformOwner) {
      return NextResponse.json({ error: "会社の追加はシステムオーナーのみ可能です" }, { status: 403 });
    }
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
    }

    const body = await request.json();
    const companyCode = normalizeCompanyCode(String(body.companyCode ?? ""));
    const name = String(body.name ?? "").trim();
    const createOwner = Boolean(body.createOwner ?? true);
    const ownerLoginId = normalizeLoginId(String(body.ownerLoginId ?? "admin"));
    const ownerDisplayName = String(body.ownerDisplayName ?? "管理者").trim() || "管理者";
    let ownerPassword = String(body.ownerPassword ?? "").trim();

    if (!isValidCompanyCode(companyCode)) {
      return NextResponse.json(
        {
          error:
            "会社IDは半角英小文字・数字・ハイフン・アンダースコア（2〜32文字）で指定してください",
        },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json({ error: "会社名が必要です" }, { status: 400 });
    }
    if (createOwner) {
      if (!ownerLoginId || ownerLoginId.includes("@")) {
        return NextResponse.json(
          { error: "オーナーのログインID（@なし）を指定してください" },
          { status: 400 }
        );
      }
      if (!ownerPassword) {
        ownerPassword = `Tmp-${randomBytes(6).toString("base64url")}`;
      }
      if (ownerPassword.length < 6) {
        return NextResponse.json(
          { error: "初期パスワードは6文字以上にしてください" },
          { status: 400 }
        );
      }
    }

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("companies")
      .select("id")
      .eq("company_code", companyCode)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "この会社IDは既に使われています" }, { status: 409 });
    }

    const { data: created, error: cErr } = await admin
      .from("companies")
      .insert({
        company_code: companyCode,
        name,
        allow_legacy_email_login: false,
        is_active: true,
      })
      .select("id, company_code, name, is_active, created_at")
      .single();
    if (cErr || !created) {
      console.error("[admin/companies POST]", cErr);
      return NextResponse.json(
        { error: cErr?.message ?? "会社の作成に失敗しました" },
        { status: 500 }
      );
    }

    // データ行の器を用意（無くても動くが初回をスムーズに）
    await admin.from("genka_kanri_data").upsert(
      { id: created.id, data: {}, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
    await admin.from("process_meeting_meta").upsert(
      {
        id: created.id,
        hidden_project_ids: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    let owner: { loginId: string; password: string; displayName: string } | null = null;
    if (createOwner) {
      const authEmail = buildAuthEmail(companyCode, ownerLoginId);
      const { data: createdUser, error: uErr } = await admin.auth.admin.createUser({
        email: authEmail,
        password: ownerPassword,
        email_confirm: true,
        user_metadata: {
          company_code: companyCode,
          login_id: ownerLoginId,
          name: ownerDisplayName,
        },
      });
      if (uErr || !createdUser.user) {
        // 会社は作れたがオーナー失敗 → 会社は残す
        console.error("[admin/companies POST] owner", uErr);
        return NextResponse.json(
          {
            ok: true,
            warning: uErr?.message ?? "会社は作成しましたが、オーナーアカウントの作成に失敗しました",
            company: {
              id: created.id,
              companyCode: created.company_code,
              name: created.name,
              isActive: created.is_active !== false,
            },
            owner: null,
          },
          { status: 201 }
        );
      }

      const { error: linkErr } = await admin.from("company_users").upsert(
        {
          company_id: created.id,
          user_id: createdUser.user.id,
          login_id: ownerLoginId,
          auth_email: authEmail,
          display_name: ownerDisplayName,
          role: "owner",
        },
        { onConflict: "user_id" }
      );
      if (linkErr) {
        console.error("[admin/companies POST] link", linkErr);
        return NextResponse.json(
          {
            ok: true,
            warning: "会社と認証ユーザーは作成しましたが、所属の紐付けに失敗しました",
            company: {
              id: created.id,
              companyCode: created.company_code,
              name: created.name,
              isActive: true,
            },
            owner: null,
          },
          { status: 201 }
        );
      }
      owner = {
        loginId: ownerLoginId,
        password: ownerPassword,
        displayName: ownerDisplayName,
      };
    }

    return NextResponse.json(
      {
        ok: true,
        company: {
          id: created.id,
          companyCode: created.company_code,
          name: created.name,
          isActive: created.is_active !== false,
        },
        owner,
      },
      { status: 201 }
    );
  } catch (e) {
    console.error("[admin/companies POST]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
