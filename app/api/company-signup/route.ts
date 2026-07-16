import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { sendResendMail } from "@/lib/resendMail";
import { normalizeCompanyCode } from "@/lib/tenant";

const OWNER_EMAIL = "hayanari316@gmail.com";

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

    const ownerMail = await sendResendMail({
      to: OWNER_EMAIL,
      replyTo: contactEmail,
      subject: `【案件管理】新規企業申込 ${companyName} (${companyCode})`,
      text:
        `新規企業申込が届きました。\n\n` +
        `企業名: ${companyName}\n` +
        `企業ID: ${companyCode}\n` +
        `オーナー氏名: ${ownerName}\n` +
        `住所: ${address}\n` +
        `電話: ${phone}\n` +
        `連絡先メール: ${contactEmail}\n\n` +
        `このメールに返信すると申込者へ届きます。\n` +
        `管理画面（/admin）で承認してください。`,
    });

    const confirmMail = await sendResendMail({
      to: contactEmail,
      replyTo: OWNER_EMAIL,
      subject: `【案件管理】企業登録申込を受け付けました（${companyName}）`,
      text:
        `${ownerName} 様\n\n` +
        `企業登録の承認依頼を受け付けました。審査完了までお待ちください。\n\n` +
        `企業名: ${companyName}\n` +
        `希望企業ID: ${companyCode}\n` +
        `結果はこのメールアドレス（${contactEmail}）へお送りします。\n\n` +
        `案件管理システム`,
    });

    return NextResponse.json({
      ok: true,
      requestId: created.id,
      ownerEmail: OWNER_EMAIL,
      mailOk: ownerMail.ok && confirmMail.ok,
      ownerMailOk: ownerMail.ok,
      confirmMailOk: confirmMail.ok,
      mailError: [ownerMail.error, confirmMail.error].filter(Boolean).join(" / ") || null,
    });
  } catch (e) {
    console.error("[company-signup]", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
