/** Resend 経由のメール送信（失敗時は理由を返す） */
export type MailResult = { ok: boolean; error?: string; id?: string };

export async function sendResendMail(params: {
  to: string | string[];
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<MailResult> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("[resendMail] RESEND_API_KEY 未設定");
    return { ok: false, error: "RESEND_API_KEY 未設定" };
  }
  const from = process.env.RESEND_FROM ?? "onboarding@resend.dev";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: params.subject,
        text: params.text,
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      }),
    });
    const bodyText = await res.text();
    let parsed: { id?: string; message?: string; name?: string } = {};
    try {
      parsed = JSON.parse(bodyText) as typeof parsed;
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      const msg = parsed.message || bodyText.slice(0, 300);
      console.error("[resendMail] error:", res.status, msg);
      return { ok: false, error: `Resend ${res.status}: ${msg}` };
    }
    return { ok: true, id: parsed.id };
  } catch (e) {
    console.error("[resendMail]", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
