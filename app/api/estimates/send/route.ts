/**
 * 見積書をメール送信（PDF添付）
 * POST body: { estimateId, to, subject?, message?, pdfBase64, filename? }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendResendMail } from "@/lib/resendMail";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }

    const body = await request.json();
    const estimateId = String(body.estimateId ?? "");
    const to = String(body.to ?? "").trim();
    const subject = String(body.subject ?? "御見積書のご送付").trim();
    const message = String(body.message ?? "").trim();
    let pdfBase64 = String(body.pdfBase64 ?? "");
    const filename = String(body.filename ?? "estimate.pdf");

    if (!estimateId) {
      return NextResponse.json({ error: "見積IDが必要です" }, { status: 400 });
    }
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: "送信先メールアドレスが不正です" }, { status: 400 });
    }
    if (!pdfBase64) {
      return NextResponse.json({ error: "PDFがありません" }, { status: 400 });
    }
    // data URL でも受け付ける
    const comma = pdfBase64.indexOf(",");
    if (pdfBase64.startsWith("data:") && comma >= 0) {
      pdfBase64 = pdfBase64.slice(comma + 1);
    }

    const { data: estimate, error: estErr } = await supabase
      .from("estimates")
      .select("id, work_name, client_name, total_amount, company_id")
      .eq("id", estimateId)
      .maybeSingle();
    if (estErr || !estimate) {
      return NextResponse.json({ error: "見積が見つかりません" }, { status: 404 });
    }

    const workName = estimate.work_name || "工事";
    const clientName = estimate.client_name || "";
    const text =
      message ||
      [
        `${clientName ? clientName + " 様" : "ご担当者様"}`,
        "",
        `「${workName}」の御見積書を送付いたします。`,
        "添付のPDFをご確認ください。",
        "",
        "よろしくお願いいたします。",
      ].join("\n");

    const result = await sendResendMail({
      to,
      subject: subject || `【御見積書】${workName}`,
      text,
      replyTo: user.email ?? undefined,
      attachments: [{ filename, content: pdfBase64 }],
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "メール送信に失敗しました" },
        { status: 502 }
      );
    }

    // 履歴
    const { data: mem } = await supabase
      .from("company_users")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const actorName =
      mem?.display_name ||
      (user.user_metadata?.name as string | undefined) ||
      user.email?.split("@")[0] ||
      "";

    await supabase.from("estimate_events").insert({
      id: crypto.randomUUID().replace(/-/g, "").slice(0, 20),
      company_id: estimate.company_id,
      estimate_id: estimateId,
      action: "emailed",
      actor_email: user.email ?? "",
      actor_name: actorName,
      detail: { to, subject, mailId: result.id },
    });

    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    console.error("[estimates/send]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "送信エラー" },
      { status: 500 }
    );
  }
}
