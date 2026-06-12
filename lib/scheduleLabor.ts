// ================================================================
// lib/scheduleLabor.ts
// スケジュール（工事予定）→ 案件の人工・車両実績への自動集計
// schedule_entries は工事名（自由入力）で記録されるため、
// 案件名・管理番号との正規化マッチングで紐付ける
// ================================================================
import type { ScheduleEntry } from "@/types/schedule";
import type { Project, Quantity } from "@/lib/utils";
import { genId } from "@/lib/constants";

/** 自動集計行を識別するための備考マーカー */
export const AUTO_NOTE_PREFIX = "スケジュール自動集計";

function norm(s: string | undefined): string {
  return (s ?? "")
    .replace(/\s+/g, "")
    .replace(/[（(].*?[)）]/g, "") // 「（中区）」等の括弧は緩く無視
    .toLowerCase();
}

/** スケジュールの工事名が案件と一致するか（部分一致・管理番号一致） */
export function entryMatchesProject(entry: ScheduleEntry, project: Project): boolean {
  const k = norm(entry.koujimei);
  if (!k) return false;
  const name = norm(project.name);
  const mgmt = (project.managementNumber ?? "").toLowerCase();
  if (mgmt && entry.koujimei.toLowerCase().includes(mgmt)) return true;
  if (k.length >= 4 && name.includes(k)) return true;
  if (name.length >= 4 && k.includes(name)) return true;
  return k === name;
}

export interface MonthlyLaborAggregate {
  month: string; // 'YYYY-MM'
  laborDays: number;
  vehicleDays: number;
  entryCount: number;
  koujimeiSamples: string[];
}

/** 案件に一致するスケジュール実績を月別に集計（対象: 今日まで。shift=off は除外） */
export function aggregateScheduleForProject(
  project: Project,
  schedules: ScheduleEntry[],
  untilDate?: string
): MonthlyLaborAggregate[] {
  const until = untilDate ?? new Date().toISOString().slice(0, 10);
  const byMonth = new Map<string, MonthlyLaborAggregate>();
  for (const e of schedules) {
    if (e.shift === "off") continue;
    if (!e.date || e.date > until) continue;
    if (!entryMatchesProject(e, project)) continue;
    const month = e.date.slice(0, 7);
    let agg = byMonth.get(month);
    if (!agg) {
      agg = { month, laborDays: 0, vehicleDays: 0, entryCount: 0, koujimeiSamples: [] };
      byMonth.set(month, agg);
    }
    agg.laborDays += (e.workers ?? []).length;
    agg.vehicleDays += (e.vehicleIds ?? []).length;
    agg.entryCount += 1;
    if (!agg.koujimeiSamples.includes(e.koujimei) && agg.koujimeiSamples.length < 5) {
      agg.koujimeiSamples.push(e.koujimei);
    }
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** 月次集計を Quantity 行に変換（labor / vehicle 各1行、0は出力しない） */
export function aggregatesToQuantities(
  projectId: string,
  aggs: MonthlyLaborAggregate[]
): Quantity[] {
  const rows: Quantity[] = [];
  for (const a of aggs) {
    const [y, m] = a.month.split("-");
    const label = `${y}年${Number(m)}月`;
    // 月末日（その月の実績として登録）
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    const date = `${a.month}-${String(lastDay).padStart(2, "0")}`;
    if (a.laborDays > 0) {
      rows.push({
        id: genId(),
        projectId,
        category: "labor",
        description: `スケジュール実績（${label}）`,
        quantity: a.laborDays,
        date,
        note: `${AUTO_NOTE_PREFIX}:${a.month}`,
      });
    }
    if (a.vehicleDays > 0) {
      rows.push({
        id: genId(),
        projectId,
        category: "vehicle",
        description: `スケジュール実績（${label}）`,
        quantity: a.vehicleDays,
        date,
        note: `${AUTO_NOTE_PREFIX}:${a.month}`,
      });
    }
  }
  return rows;
}

/** 既存の自動集計行（同案件）を抽出 */
export function findExistingAutoRows(projectId: string, quantities: Quantity[]): Quantity[] {
  return quantities.filter(
    (q) => q.projectId === projectId && (q.note ?? "").startsWith(AUTO_NOTE_PREFIX)
  );
}
