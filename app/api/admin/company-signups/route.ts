import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveCallerFromToken } from "@/lib/permissions";
import { buildAuthEmail, normalizeCompanyCode } from "@/lib/tenant";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

type SignupRow = {
  id: string;
  company_code: string;
  company_name: string;
  address: string;
  phone: string;
  contact_email: string;
  owner_name: string;
  owner_login_id: string;
  status: "pending" | "approved" | "rejected";
  reviewed_at: string | null;
  reviewed_by_email: string | null;
  review_note: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    const caller = await resolveCallerFromToken(token);
    if (!caller?.isPlatformOwner) {
      return NextResponse.json({ error: "この操作を行う権限がありません" }, { status: 403 });
    }
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
    }

    const status = String(request.nextUrl.searchParams.get("status") ?? "pending");
    const admin = createAdminClient();
    let q = admin
      .from("company_signup_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (status === "pending" || status === "approved" || status === "rejected") {
      q = q.eq("status", status);
    }
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ requests: (data ?? []) as SignupRow[] });
  } catch (e) {
    console.error("[admin/company-signups] GET", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    const caller = await resolveCallerFromToken(token);
    if (!caller?.isPlatformOwner) {
      return NextResponse.json({ error: "この操作を行う権限がありません" }, { status: 403 });
    }
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
    }

    const body = await request.json();
    const requestId = String(body.requestId ?? "");
    const action = String(body.action ?? "");
    const reviewNote = String(body.reviewNote ?? "").trim();
    if (!requestId || (action !== "approve" && action !== "reject")) {
      return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: req, error: reqErr } = await admin
      .from("company_signup_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle<SignupRow>();
    if (reqErr || !req) {
      return NextResponse.json({ error: "申込が見つかりません" }, { status: 404 });
    }
    if (req.status !== "pending") {
      return NextResponse.json({ error: "この申込は既に処理済みです" }, { status: 409 });
    }

    if (action === "reject") {
      const { error } = await admin
        .from("company_signup_requests")
        .update({
          status: "rejected",
          reviewed_at: new Date().toISOString(),
          reviewed_by_email: caller.email,
          review_note: reviewNote || "却下",
        })
        .eq("id", requestId);
      if (error) throw error;
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    const companyCode = normalizeCompanyCode(req.company_code);
    const companyName = req.company_name.trim();
    const ownerLoginId = "admin";
    const ownerPassword = generateTempPassword();
    const authEmail = buildAuthEmail(companyCode, ownerLoginId);

    const { data: existing } = await admin
      .from("companies")
      .select("id")
      .eq("company_code", companyCode)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "企業IDが既に存在します" }, { status: 409 });
    }

    const { data: createdCompany, error: cErr } = await admin
      .from("companies")
      .insert({ company_code: companyCode, name: companyName, allow_legacy_email_login: false })
      .select("id, company_code")
      .single();
    if (cErr || !createdCompany) throw cErr ?? new Error("company create failed");

    const { data: createdUser, error: uErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: {
        company_code: companyCode,
        login_id: ownerLoginId,
        name: req.owner_name,
      },
    });
    if (uErr || !createdUser.user) {
      return NextResponse.json(
        { error: uErr?.message ?? "オーナーアカウントの作成に失敗しました" },
        { status: 400 }
      );
    }

    const { error: linkErr } = await admin.from("company_users").upsert(
      {
        company_id: createdCompany.id,
        user_id: createdUser.user.id,
        login_id: ownerLoginId,
        auth_email: authEmail,
        display_name: req.owner_name,
        role: "owner",
      },
      { onConflict: "user_id" }
    );
    if (linkErr) throw linkErr;

    await Promise.all([
      admin.from("genka_kanri_data").upsert(
        { id: createdCompany.id, data: {}, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      ),
      admin.from("process_meeting_meta").upsert(
        { id: createdCompany.id, hidden_project_ids: {}, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      ),
      admin
        .from("company_signup_requests")
        .update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
          reviewed_by_email: caller.email,
          review_note: reviewNote || null,
          approved_company_id: createdCompany.id,
          approved_user_id: createdUser.user.id,
        })
        .eq("id", requestId),
    ]);

    void sendApprovedMail(req.contact_email, companyCode, ownerLoginId, ownerPassword);
    return NextResponse.json({
      ok: true,
      status: "approved",
      companyCode,
      ownerLoginId,
    });
  } catch (e) {
    console.error("[admin/company-signups] POST", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}

function generateTempPassword(): string {
  return `Tmp-${randomBytes(6).toString("base64url")}`;
}

async function sendApprovedMail(
  to: string,
  companyCode: string,
  ownerLoginId: string,
  ownerPassword: string
) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "onboarding@resend.dev",
        to,
        subject: "【案件管理】企業登録 承認のお知らせ",
        text:
          `企業登録が承認されました。\n\n` +
          `会社ID: ${companyCode}\n` +
          `会社オーナーログインID: ${ownerLoginId}\n` +
          `初期パスワード: ${ownerPassword}\n\n` +
          `ログイン後、必ずパスワード変更してください。`,
      }),
    });
  } catch (e) {
    console.error("[admin/company-signups] mail", e);
  }
}
