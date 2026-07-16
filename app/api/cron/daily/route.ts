/**
 * 毎朝の自動チェック（Vercel Cron から呼び出し）
 * - スケジュール→人工・車両の日次自動転記（終了した日分）
 * - 入力漏れリマインド / 予算アラート / 入金遅延 / 月次サマリー（Teams）
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_COMPANY_ID } from "@/lib/tenant";
import { syncScheduleLaborAllCompanies } from "@/lib/scheduleLaborServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  budget: number;
  originalAmount: number;
  mode: string;
  marginRate?: number;
  subcontractAmount?: number;
  archived?: boolean;
  deleted?: boolean;
  paidAmount: number;
  billedAmount: number;
  expectedPaymentDate?: string;
  expectedPaymentAmount?: number;
  personInCharge?: string;
  changes?: { type: string; amount: number }[];
}
interface CostRow {
  projectId: string;
  amount: number;
  date: string;
}
interface QtyRow {
  projectId: string;
  date: string;
}

function jstNow(): Date {
  return new Date(Date.now() + 9 * 3600 * 1000);
}

function fmtYen(n: number): string {
  return "¥" + new Intl.NumberFormat("ja-JP").format(Math.round(n || 0));
}

function effectiveContract(p: ProjectRow): number {
  const changeTotal = (p.changes || []).reduce(
    (s, c) => s + (c.type === "increase" ? c.amount : -c.amount),
    0
  );
  return (p.originalAmount || 0) + changeTotal;
}

function isInProgress(status: string): boolean {
  return status === "in_progress" || status === "施工中";
}

async function postTeams(webhook: string, title: string, bodyText: string): Promise<boolean> {
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
          body: [
            { type: "TextBlock", text: title, wrap: true, weight: "Bolder", size: "Medium" },
            { type: "TextBlock", text: bodyText, wrap: true },
          ],
        },
      },
    ],
  };
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teamsBody),
    });
    return res.ok;
  } catch (e) {
    console.error("[cron/daily] Teams error:", e);
    return false;
  }
}

async function runDailyChecksForCompany(
  raw: unknown,
  webhook: string,
  companyLabel: string
): Promise<{ company: string; ok: boolean; posted: number; error?: string }> {
  const stored = raw as {
    projects?: ProjectRow[];
    costs?: CostRow[];
    quantities?: QtyRow[];
  };
  const projects = (stored.projects ?? []).filter((p) => !p.archived && !p.deleted);
  const costs = stored.costs ?? [];
  const quantities = stored.quantities ?? [];

  const now = jstNow();
  const todayStr = now.toISOString().slice(0, 10);
  const since14 = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const sections: string[] = [];

  const stale = projects.filter((p) => {
    if (!isInProgress(p.status)) return false;
    const hasRecentCost = costs.some((c) => c.projectId === p.id && c.date >= since14);
    const hasRecentQty = quantities.some((q) => q.projectId === p.id && q.date >= since14);
    return !hasRecentCost && !hasRecentQty;
  });
  if (stale.length > 0) {
    const lines = stale
      .slice(0, 10)
      .map((p) => `• ${p.name}${p.personInCharge ? `（担当: ${p.personInCharge}）` : ""}`);
    sections.push(
      `**📝 入力漏れの可能性（施工中なのに14日間 原価・人工の入力なし: ${stale.length}件）**\n` +
        lines.join("\n") +
        (stale.length > 10 ? `\n…ほか${stale.length - 10}件` : "")
    );
  }

  const budgetAlerts = projects
    .filter((p) => p.mode !== "subcontract" && (p.budget ?? 0) > 0)
    .map((p) => {
      const total = costs
        .filter((c) => c.projectId === p.id)
        .reduce((s, c) => s + (c.amount || 0), 0);
      return { p, total, ratio: Math.round((total / p.budget) * 100) };
    })
    .filter((x) => x.ratio >= 90)
    .sort((a, b) => b.ratio - a.ratio);
  if (budgetAlerts.length > 0) {
    const lines = budgetAlerts
      .slice(0, 10)
      .map(
        (x) =>
          `• ${x.p.name}: 原価 ${fmtYen(x.total)} / 予算 ${fmtYen(x.p.budget)}（**${x.ratio}%**${x.ratio > 100 ? " 🔴超過" : ""}）`
      );
    sections.push(`**⚠️ 予算アラート（実行予算の90%超: ${budgetAlerts.length}件）**\n` + lines.join("\n"));
  }

  const overdue = projects.filter((p) => {
    if (!p.expectedPaymentDate || p.expectedPaymentDate >= todayStr) return false;
    if (p.status === "paid" || p.status === "入金済") return false;
    const amt = p.expectedPaymentAmount ?? p.billedAmount - p.paidAmount;
    return amt > 0;
  });
  if (overdue.length > 0) {
    const lines = overdue
      .slice(0, 10)
      .map((p) => `• ${p.name}: 予定日 ${p.expectedPaymentDate}`);
    sections.push(`**🔔 入金予定日超過（${overdue.length}件）**\n` + lines.join("\n"));
  }

  let posted = 0;
  if (sections.length > 0) {
    const ok = await postTeams(
      webhook,
      `📊 案件管理 朝のチェック（${todayStr}）／${companyLabel}`,
      sections.join("\n\n")
    );
    if (ok) posted++;
  }

  if (now.getDate() === 1) {
    const totalContract = projects.reduce((s, p) => s + effectiveContract(p), 0);
    const totalCost = projects.reduce((s, p) => {
      const direct = costs
        .filter((c) => c.projectId === p.id)
        .reduce((x, c) => x + (c.amount || 0), 0);
      if (p.mode === "subcontract") {
        const sub =
          p.marginRate && p.marginRate > 0
            ? Math.round(effectiveContract(p) * (1 - p.marginRate / 100))
            : p.subcontractAmount || 0;
        return s + sub + direct;
      }
      return s + direct;
    }, 0);
    const profit = totalContract - totalCost;
    const profitRate = totalContract > 0 ? Math.round((profit / totalContract) * 100) : 0;
    const thisMonth = todayStr.slice(0, 7);
    const expectedThisMonth = projects
      .filter((p) => p.expectedPaymentDate?.startsWith(thisMonth) && p.status !== "paid")
      .reduce((s, p) => {
        const amt = p.expectedPaymentAmount ?? p.billedAmount - p.paidAmount;
        return s + (amt > 0 ? amt : 0);
      }, 0);
    const inProgress = projects.filter((p) => isInProgress(p.status)).length;
    const summary =
      `• 進行中案件: ${projects.length}件（うち施工中 ${inProgress}件）\n` +
      `• 総受注額（増減後）: ${fmtYen(totalContract)}\n` +
      `• 総原価: ${fmtYen(totalCost)}\n` +
      `• 粗利: ${fmtYen(profit)}（利益率 ${profitRate}%）\n` +
      `• 今月の入金予定: ${fmtYen(expectedThisMonth)}`;
    const ok = await postTeams(
      webhook,
      `📅 月次サマリー（${now.getFullYear()}年${now.getMonth() + 1}月初）／${companyLabel}`,
      summary
    );
    if (ok) posted++;
  }

  return { company: companyLabel, ok: true, posted };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/daily] CRON_SECRET 未設定のため拒否しました");
    return NextResponse.json({ error: "CRON_SECRET が未設定です" }, { status: 503 });
  }
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const webhook = process.env.TEAMS_WEBHOOK_URL;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase設定がありません" }, { status: 500 });
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) スケジュール→人工・車両（Webhook有無に関わらず実行）
  const laborSync = await syncScheduleLaborAllCompanies(supabase);

  if (!webhook) {
    return NextResponse.json({
      ok: true,
      laborSync,
      skipped: "TEAMS_WEBHOOK_URL未設定（人工転記のみ実行）",
    });
  }

  const { data: companyRows } = await supabase.from("companies").select("id, company_code, name");
  const targets =
    companyRows && companyRows.length > 0
      ? companyRows.map((c) => ({ id: String(c.id), label: String(c.name || c.company_code) }))
      : [{ id: "default", label: "default" }];

  const results: { company: string; ok: boolean; posted?: number; error?: string }[] = [];
  let postedTotal = 0;

  for (const target of targets) {
    let payload = (
      await supabase.from("genka_kanri_data").select("data").eq("id", target.id).maybeSingle()
    ).data?.data;

    if (!payload && target.id === DEFAULT_COMPANY_ID) {
      payload = (
        await supabase.from("genka_kanri_data").select("data").eq("id", "default").maybeSingle()
      ).data?.data;
    }

    if (!payload) {
      results.push({ company: target.label, ok: false, error: "no data" });
      continue;
    }

    const result = await runDailyChecksForCompany(payload, webhook, target.label);
    postedTotal += result.posted;
    results.push(result);
  }

  return NextResponse.json({ ok: true, posted: postedTotal, results, laborSync });
}
