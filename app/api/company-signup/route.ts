import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { normalizeCompanyCode } from "@/lib/tenant";

const OWNER_EMAIL = "tokito@tokito-co.jp";

export async function POST(request: NextRequest) {
  try {
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
    }
    const body = await request.json();
    const companyCode = normalizeCompanyCode(String(body.companyCode ?? ""));
    const companyName = String(body.companyName ?? "").trim();
    const address = String(body.address ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const contactEmail = String(body.contactEmail ?? "").trim().toLowerCase();
    const ownerName = String(body.ownerName ?? "").trim();

    if (!companyCode || !/^[a-z0-9][a-z0-9-_]{1,31}$/.test(companyCode)) {
      return NextResponse.json(
        { error: "企業IDは半角英数字で2〜32文字（- と _ 可）で入力してください" },
        { status: 400 }
      );
    }
    if (!companyName || !address || !phone || !ownerName) {
      return NextResponse.json({ error: "必須項目を入力してください" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return NextResponse.json({ error: "メールアドレスの形式が不正です" }, { status: 400 });
    }

    const admin = createAdminClient();
    const [{ data: company }, { data: pending }] = await Promise.all([
      admin.from("companies").select("id").eq("company_code", companyCode).maybeSingle(),
      admin
        .from("company_signup_requests")
        .select("id")
        .eq("company_code", companyCode)
        .eq("status", "pending")
        .maybeSingle(),
    ]);
    if (company) {
      return NextResponse.json({ error: "その企業IDは既に使用されています" }, { status: 409 });
    }
    if (pending) {
      return NextResponse.json({ error: "同じ企業IDの承認待ち申込があります" }, { status: 409 });
    }

    const { data: created, error } = await admin
      .from("company_signup_requests")
      .insert({
        company_code: companyCode,
        company_name: companyName,
        address,
        phone,
        contact_email: contactEmail,
        owner_name: ownerName,
        owner_login_id: "admin",
        status: "pending",
      })
      .select("id")
      .single();
    if (error) {
      console.error("[company-signup]", error);
      return NextResponse.json({ error: "申込の保存に失敗しました" }, { status: 500 });
    }

    void notifyOwner(companyCode, companyName, contactEmail);
    return NextResponse.json({ ok: true, requestId: created.id, ownerEmail: OWNER_EMAIL });
  } catch (e) {
    console.error("[company-signup]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}

async function notifyOwner(companyCode: string, companyName: string, contactEmail: string) {
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
        to: OWNER_EMAIL,
        subject: `【案件管理】新規企業申込 ${companyName} (${companyCode})`,
        text: `新規企業申込が届きました。\n企業名: ${companyName}\n企業ID: ${companyCode}\n連絡先: ${contactEmail}\n\n管理画面で承認してください。`,
      }),
    });
  } catch (e) {
    console.error("[company-signup] notify", e);
  }
}
