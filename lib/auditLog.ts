"use client";

// ================================================================
// lib/auditLog.ts
// 変更履歴（監査ログ）— audit_logs テーブルへの記録と差分要約
// テーブル未作成でもアプリ動作には影響しない（失敗は握りつぶす）
// ================================================================
import { createClient } from "@/lib/supabase/client";
import type { Project, Cost, Quantity, BidSchedule } from "@/lib/utils";
import { fmt } from "@/lib/constants";
import { requireCompanyId } from "@/lib/tenant";

export interface AuditLogRow {
  id: string;
  created_at: string;
  user_email: string;
  action: string;
  detail: string;
}

/** ログを記録（fire-and-forget。失敗してもアプリは止めない） */
export async function logAudit(action: string, detail: string): Promise<void> {
  try {
    const supabase = createClient();
    const companyId = await requireCompanyId();
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email ?? "";
    await supabase.from("audit_logs").insert({
      company_id: companyId,
      user_email: email,
      action,
      detail: detail.slice(0, 2000),
    });
  } catch {
    // テーブル未作成・ネットワークエラー時は無視
  }
}

export async function fetchAuditLogs(limit = 200): Promise<AuditLogRow[] | null> {
  try {
    const supabase = createClient();
    const companyId = await requireCompanyId();
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return null;
    return (data ?? []) as AuditLogRow[];
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------
// 案件データの差分要約
// ----------------------------------------------------------------
export interface GenkaSnapshot {
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
  bidSchedules?: BidSchedule[];
  vehicles?: { id: string; registration: string }[];
  processMasters?: { id: string; name: string }[];
}

function byId<T extends { id: string }>(arr: T[] | undefined): Map<string, T> {
  return new Map((arr ?? []).map((x) => [x.id, x]));
}

/** 保存前後のデータを比較し、人が読める変更要約（最大10行）を返す */
export function summarizeGenkaChanges(prev: GenkaSnapshot, next: GenkaSnapshot): string[] {
  const lines: string[] = [];
  const projName = (pid: string) =>
    next.projects.find((p) => p.id === pid)?.name ??
    prev.projects.find((p) => p.id === pid)?.name ??
    "不明な案件";

  // 案件
  const pPrev = byId(prev.projects);
  const pNext = byId(next.projects);
  for (const [id, p] of pNext) {
    const old = pPrev.get(id);
    if (!old) {
      lines.push(`案件「${p.name}」を追加`);
    } else if (old !== p && JSON.stringify(old) !== JSON.stringify(p)) {
      if (!old.deleted && p.deleted) lines.push(`案件「${p.name}」を削除（ごみ箱へ）`);
      else if (old.deleted && !p.deleted) lines.push(`案件「${p.name}」を復元`);
      else if (!old.archived && p.archived) lines.push(`案件「${p.name}」をアーカイブ`);
      else if (old.archived && !p.archived) lines.push(`案件「${p.name}」をアーカイブ解除`);
      else if ((old.payments?.length ?? 0) < (p.payments?.length ?? 0))
        lines.push(`案件「${p.name}」に入金を登録`);
      else if ((old.payments?.length ?? 0) > (p.payments?.length ?? 0))
        lines.push(`案件「${p.name}」の入金を削除`);
      else if ((old.changes?.length ?? 0) !== (p.changes?.length ?? 0))
        lines.push(`案件「${p.name}」の増減額を変更`);
      else lines.push(`案件「${p.name}」を更新`);
    }
  }
  for (const [id, p] of pPrev) {
    if (!pNext.has(id)) lines.push(`案件「${p.name}」を完全削除`);
  }

  // 原価
  const cPrev = byId(prev.costs);
  const cNext = byId(next.costs);
  for (const [id, c] of cNext) {
    const old = cPrev.get(id);
    if (!old) lines.push(`原価追加: ${projName(c.projectId)} ¥${fmt(c.amount)}（${c.description || "内容なし"}）`);
    else if (JSON.stringify(old) !== JSON.stringify(c))
      lines.push(`原価変更: ${projName(c.projectId)} ¥${fmt(c.amount)}（${c.description || "内容なし"}）`);
  }
  for (const [id, c] of cPrev) {
    if (!cNext.has(id)) lines.push(`原価削除: ${projName(c.projectId)} ¥${fmt(c.amount)}`);
  }

  // 人工・車両
  const qPrev = byId(prev.quantities);
  const qNext = byId(next.quantities);
  for (const [id, q] of qNext) {
    if (!qPrev.has(id)) lines.push(`人工・車両記録追加: ${projName(q.projectId)} ${q.quantity}（${q.description || q.category}）`);
  }
  for (const [id, q] of qPrev) {
    if (!qNext.has(id)) lines.push(`人工・車両記録削除: ${projName(q.projectId)} ${q.quantity}`);
  }

  // 入札
  const bPrev = byId(prev.bidSchedules ?? []);
  const bNext = byId(next.bidSchedules ?? []);
  for (const [id, b] of bNext) {
    const old = bPrev.get(id);
    if (!old) lines.push(`入札スケジュール追加: ${b.name}`);
    else if (JSON.stringify(old) !== JSON.stringify(b)) lines.push(`入札スケジュール更新: ${b.name}`);
  }
  for (const [id, b] of bPrev) {
    if (!bNext.has(id)) lines.push(`入札スケジュール削除: ${b.name}`);
  }

  // マスタ
  if (JSON.stringify(prev.vehicles ?? []) !== JSON.stringify(next.vehicles ?? []))
    lines.push("車両マスタを変更");
  if (JSON.stringify(prev.processMasters ?? []) !== JSON.stringify(next.processMasters ?? []))
    lines.push("工程マスタを変更");

  if (lines.length > 10) {
    const extra = lines.length - 10;
    return [...lines.slice(0, 10), `…ほか${extra}件の変更`];
  }
  return lines;
}
