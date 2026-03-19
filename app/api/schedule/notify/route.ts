/**
 * スケジュール変更通知 API
 * 影響を受ける作業員ごとにメール / Teams で通知
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { ChangeItem } from "@/lib/scheduleNotify";
import { groupChangesByWorker } from "@/lib/scheduleNotify";

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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }

    const body = await request.json();
    const items = (body.changes ?? []) as ChangeItem[];
    if (items.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const byWorker = groupChangesByWorker(items);
    const workerNames = [...byWorker.keys()];

    const { data: contacts } = await supabase
      .from("worker_contacts")
      .select("worker_name, email")
      .in("worker_name", workerNames);

    const emailMap = new Map<string, string>();
    for (const r of contacts ?? []) {
      const em = (r.email ?? "").trim();
      if (em) emailMap.set(r.worker_name ?? "", em);
    }

    let sentCount = 0;
    const resendKey = process.env.RESEND_API_KEY;
    const teamsWebhook = process.env.TEAMS_WEBHOOK_URL;

    if (!teamsWebhook) {
      console.warn("[notify] TEAMS_WEBHOOK_URL 未設定のため Teams 通知はスキップ");
    }

    for (const [workerName, changeList] of byWorker) {
      const lines = changeList.map((c) => `・${c.date}: ${c.message}`);
      const text = `【${workerName}様】スケジュール変更\n\n${lines.join("\n")}`;

      if (resendKey && emailMap.has(workerName)) {
        const to = emailMap.get(workerName)!;
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: process.env.RESEND_FROM ?? "onboarding@resend.dev",
              to,
              subject: "【工事スケジュール】変更がありました",
              text,
            }),
          });
          if (res.ok) sentCount++;
        } catch (e) {
          console.error("[notify] Resend error:", e);
        }
      }
    }

    // Teams: Power Automate ワークフロー用の最小構成（確実に届く形式）
    if (teamsWebhook && workerNames.length > 0) {
      const sections = [...byWorker.entries()].map(([wn, list]) => {
        const lines = list.map((c) => `  • ${c.date}: ${c.message}`);
        return `**【${wn}】**\n${lines.join("\n")}`;
      });
      const bodyText = `工事スケジュールに変更がありました\n\n${sections.join("\n\n")}`;

      const teamsBody = {
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            contentUrl: null,
            content: {
              $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
              type: "AdaptiveCard",
              version: "1.2",
              body: [{ type: "TextBlock", text: bodyText, wrap: true }],
            },
          },
        ],
      };
      try {
        const tr = await fetch(teamsWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(teamsBody),
        });
        if (!tr.ok) {
          console.error("[notify] Teams 失敗:", tr.status, await tr.text());
        } else {
          console.log("[notify] Teams 投稿OK");
        }
      } catch (e) {
        console.error("[notify] Teams error:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      sent: sentCount,
      debug: {
        changesCount: items.length,
        workerCount: workerNames.length,
        workerNames,
        teamsPosted: !!(teamsWebhook && workerNames.length > 0),
      },
    });
  } catch (e) {
    console.error("[schedule/notify]", e);
    return NextResponse.json({ error: "通知処理でエラーが発生しました" }, { status: 500 });
  }
}
