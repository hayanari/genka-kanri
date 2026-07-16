/**
 * 会社ID + ログインID + パスワードでログイン
 * メールアドレスはサーバー内で解決し、クライアントには出さない
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildAuthEmail,
  normalizeCompanyCode,
  normalizeLoginId,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase設定がありません");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const companyCode = normalizeCompanyCode(String(body.companyCode ?? ""));
    const loginId = normalizeLoginId(String(body.loginId ?? ""));
    const password = String(body.password ?? "");

    if (!companyCode || !loginId || !password) {
      return NextResponse.json(
        { error: "会社ID・ログインID・パスワードを入力してください" },
        { status: 400 }
      );
    }

    const admin = adminClient();
    if (!admin) {
      return NextResponse.json(
        {
          error:
            "サーバーに SUPABASE_SERVICE_ROLE_KEY が設定されていません。Vercel / .env.local を確認してください。",
        },
        { status: 503 }
      );
    }

    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id, company_code, name, allow_legacy_email_login")
      .eq("company_code", companyCode)
      .maybeSingle();

    if (companyError) {
      console.error("[auth/login] company", companyError);
      return NextResponse.json({ error: "認証処理に失敗しました" }, { status: 500 });
    }
    if (!company) {
      return NextResponse.json(
        { error: "会社IDまたはログイン情報が正しくありません" },
        { status: 401 }
      );
    }

    let authEmail: string | null = null;

    const { data: member } = await admin
      .from("company_users")
      .select("auth_email, user_id, login_id")
      .eq("company_id", company.id)
      .eq("login_id", loginId)
      .maybeSingle();

    if (member?.auth_email) {
      authEmail = String(member.auth_email);
    } else if (company.allow_legacy_email_login) {
      // 移行用: 会社が許可している場合、ログインIDをメールとしても試す
      if (loginId.includes("@")) {
        authEmail = loginId;
      } else {
        authEmail = buildAuthEmail(companyCode, loginId);
      }
    } else {
      authEmail = buildAuthEmail(companyCode, loginId);
    }

    const supabase = anonClient();
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });

    if (signInError || !signInData.session || !signInData.user) {
      // レガシー: login_id がメールでない場合、メールドメイン付きで再試行はしない。
      // tokito 移行時は「ログインIDにメール全体」も許可（allow_legacy_email_login）
      if (
        company.allow_legacy_email_login &&
        !loginId.includes("@") &&
        authEmail === buildAuthEmail(companyCode, loginId)
      ) {
        // 見つからない場合は一律エラー
      }
      return NextResponse.json(
        { error: "会社ID・ログインIDまたはパスワードが正しくありません" },
        { status: 401 }
      );
    }

    // レガシー初回のみ: まだどの会社にも所属していない場合だけ紐付け
    // 既存所属の付け替えは禁止（他社データへの横断を防ぐ）
    if (!member && company.allow_legacy_email_login) {
      const { data: existingMembership } = await admin
        .from("company_users")
        .select("company_id, companies(company_code)")
        .eq("user_id", signInData.user.id)
        .maybeSingle();

      if (existingMembership?.company_id && existingMembership.company_id !== company.id) {
        const existingCompany = Array.isArray(existingMembership.companies)
          ? existingMembership.companies[0]
          : existingMembership.companies;
        return NextResponse.json(
          {
            error:
              `このアカウントは既に別の会社（${existingCompany?.company_code ?? "不明"}）に所属しています。` +
              `所属変更はシステムオーナーへ依頼してください。`,
          },
          { status: 403 }
        );
      }

      if (!existingMembership) {
        const { error: linkError } = await admin.from("company_users").insert({
          company_id: company.id,
          user_id: signInData.user.id,
          login_id: loginId.includes("@") ? loginId.split("@")[0] : loginId,
          auth_email: signInData.user.email ?? authEmail,
          display_name:
            signInData.user.user_metadata?.name ??
            (signInData.user.email ?? loginId).split("@")[0],
        });
        if (linkError) {
          console.error("[auth/login] link", linkError);
        }
      }
    }

    // 最終確認: ログイン先会社に所属していること
    const { data: confirmed } = await admin
      .from("company_users")
      .select("id")
      .eq("user_id", signInData.user.id)
      .eq("company_id", company.id)
      .maybeSingle();
    if (!confirmed) {
      return NextResponse.json(
        { error: "この会社へのログイン権限がありません" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      expires_in: signInData.session.expires_in,
      company: {
        id: company.id,
        code: company.company_code,
        name: company.name,
      },
    });
  } catch (e) {
    console.error("[auth/login]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
