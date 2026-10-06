// ================================================================
// lib/scheduleLabor.ts
// スケジュール → 案件の人工・車両への日次自動転記
// ・終了した日（今日より前）だけを対象
// ・自動行は note で一意管理し、再同期しても重複しない
// ・手入力行（自動マーカーなし）は触らない
// ・協力業者（partner）は人工に含めない（外注費は請求時に手入力）
// ================================================================
import type { ScheduleEntry, WorkerKind } from "@/types/schedule"
import type { Project, Quantity, Vehicle } from "@/lib/utils"
import { genId } from "@/lib/constants"
import { isPartnerWorker, getBaseKoujimei } from "@/lib/scheduleUtils"

/** 自動転記行を識別する備考プレフィックス */
export const AUTO_NOTE_PREFIX = "スケジュール自動集計"

export function isAutoScheduleQty(q: Quantity): boolean {
  return (q.note ?? "").startsWith(AUTO_NOTE_PREFIX)
}

export function autoNoteLabor(date: string): string {
  return `${AUTO_NOTE_PREFIX}:${date}:labor`
}

export function autoNoteVehicle(date: string, vehicleId: string): string {
  return `${AUTO_NOTE_PREFIX}:${date}:vehicle:${vehicleId}`
}

/** 旧・月次取込の note（YYYY-MM）も自動行として扱う */
export function isLegacyMonthlyAutoNote(note: string): boolean {
  return /^スケジュール自動集計:\d{4}-\d{2}$/.test(note)
}

/**
 * 比較用の正規化。空白と全角/半角の揺れだけを吸収し、文言自体は変えない
 * （括弧内を落とすと「第1期」「第2期」のような区別が消えるのでしない）
 */
function norm(s: string | undefined): string {
  return (s ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase()
}

/** JST の今日 YYYY-MM-DD */
export function jstTodayYmd(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

/**
 * スケジュールの工事名が案件と一致するか（完全一致のみ）
 * - 同日同名の連番サフィックス（「○○工事 A」「○○工事 B」）は外して比較
 * - 案件名または管理番号と一致したときだけ転記する
 *   （以前は部分一致だったため「路面清掃」等の共通語で別案件に転記されていた）
 */
export function entryMatchesProject(entry: ScheduleEntry, project: Project): boolean {
  const k = norm(getBaseKoujimei(entry.koujimei ?? ""))
  if (!k) return false
  const name = norm(project.name)
  if (name && k === name) return true
  const mgmt = norm(project.managementNumber)
  return !!mgmt && k === mgmt
}

type DayAgg = {
  date: string
  workers: Set<string>
  vehicleIds: Set<string>
}

function aggregateDaysForProject(
  project: Project,
  schedules: ScheduleEntry[],
  untilExclusive: string,
  workerKinds?: Record<string, WorkerKind> | null
): DayAgg[] {
  const byDate = new Map<string, DayAgg>()
  for (const e of schedules) {
    if (e.shift === "off") continue
    if (!e.date || e.date >= untilExclusive) continue
    if (!entryMatchesProject(e, project)) continue
    let agg = byDate.get(e.date)
    if (!agg) {
      agg = { date: e.date, workers: new Set(), vehicleIds: new Set() }
      byDate.set(e.date, agg)
    }
    for (const w of e.workers ?? []) {
      const name = w.trim()
      if (!name) continue
      // 協力業者は人工（自社人日）に入れない
      if (isPartnerWorker(name, workerKinds)) continue
      agg.workers.add(name)
    }
    for (const vid of e.vehicleIds ?? []) {
      if (vid) agg.vehicleIds.add(vid)
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** 終了日分の自動転記行を生成（自社人数・使用車両） */
export function buildDailyAutoQuantities(
  project: Project,
  schedules: ScheduleEntry[],
  vehicles: Vehicle[],
  untilExclusive?: string,
  workerKinds?: Record<string, WorkerKind> | null
): Quantity[] {
  const until = untilExclusive ?? jstTodayYmd()
  const days = aggregateDaysForProject(project, schedules, until, workerKinds)
  const vehicleName = (id: string) =>
    vehicles.find((v) => v.id === id)?.registration ?? id
  const rows: Quantity[] = []

  for (const d of days) {
    const laborN = d.workers.size
    if (laborN > 0) {
      const names = [...d.workers].slice(0, 8).join("、")
      rows.push({
        id: genId(),
        projectId: project.id,
        category: "labor",
        description: `スケジュール実績（${d.date}）${names ? ` ${names}` : ""}`,
        quantity: laborN,
        date: d.date,
        note: autoNoteLabor(d.date),
      })
    }
    for (const vid of d.vehicleIds) {
      rows.push({
        id: genId(),
        projectId: project.id,
        category: "vehicle",
        description: vehicleName(vid),
        quantity: 1,
        date: d.date,
        note: autoNoteVehicle(d.date, vid),
        vehicleId: vid,
      })
    }
  }
  return rows
}

export type SyncLaborResult = {
  quantities: Quantity[]
  changed: boolean
  added: number
  removed: number
  updated: number
}

/**
 * 1案件分: 自動転記行を日次内容で置き換え（手入力は残す）
 * existing は全案件の quantities 配列
 */
export function syncProjectScheduleLabor(
  project: Project,
  schedules: ScheduleEntry[],
  vehicles: Vehicle[],
  existing: Quantity[],
  untilExclusive?: string,
  workerKinds?: Record<string, WorkerKind> | null
): SyncLaborResult {
  const desired = buildDailyAutoQuantities(
    project,
    schedules,
    vehicles,
    untilExclusive,
    workerKinds
  )
  const desiredByNote = new Map(desired.map((q) => [q.note, q]))

  const others = existing.filter((q) => q.projectId !== project.id)
  const manual = existing.filter(
    (q) => q.projectId === project.id && !isAutoScheduleQty(q)
  )
  const oldAuto = existing.filter(
    (q) => q.projectId === project.id && isAutoScheduleQty(q)
  )
  const oldByNote = new Map(oldAuto.map((q) => [q.note, q]))

  let added = 0
  let updated = 0
  let removed = 0

  const nextAuto: Quantity[] = []
  for (const [note, row] of desiredByNote) {
    const prev = oldByNote.get(note)
    if (!prev) {
      nextAuto.push(row)
      added += 1
    } else {
      const same =
        prev.quantity === row.quantity &&
        prev.description === row.description &&
        prev.date === row.date &&
        prev.category === row.category &&
        (prev.vehicleId ?? "") === (row.vehicleId ?? "")
      if (same) {
        nextAuto.push(prev)
      } else {
        nextAuto.push({ ...row, id: prev.id })
        updated += 1
      }
    }
  }
  for (const old of oldAuto) {
    if (!desiredByNote.has(old.note)) removed += 1
  }

  const quantities = [...others, ...manual, ...nextAuto]
  const changed = added > 0 || updated > 0 || removed > 0
  return { quantities, changed, added, removed, updated }
}

export type UnmatchedKoujimei = { koujimei: string; days: number }

/**
 * 終了日の予定のうち、どの案件にも一致せず転記先が無い工事名（有休除く）
 * 完全一致に変えたことで転記されなくなった名前をユーザーが確認するために使う
 */
export function findUnmatchedKoujimei(
  projects: Project[],
  schedules: ScheduleEntry[],
  untilExclusive?: string
): UnmatchedKoujimei[] {
  const until = untilExclusive ?? jstTodayYmd()
  const live = projects.filter((p) => !p.deleted)
  const days = new Map<string, Set<string>>()
  for (const e of schedules) {
    if (e.shift === "off") continue
    if (!e.date || e.date >= until) continue
    const base = getBaseKoujimei(e.koujimei ?? "").trim()
    if (!base || base === "有休") continue
    if (live.some((p) => entryMatchesProject(e, p))) continue
    let set = days.get(base)
    if (!set) {
      set = new Set()
      days.set(base, set)
    }
    set.add(e.date)
  }
  return [...days.entries()]
    .map(([koujimei, s]) => ({ koujimei, days: s.size }))
    .sort((a, b) => b.days - a.days || a.koujimei.localeCompare(b.koujimei, "ja"))
}

/**
 * 全案件を同期
 * アーカイブ済み案件も対象（過去の誤転記を残さないため）。削除済みのみ除外
 */
export function syncAllProjectsScheduleLabor(
  projects: Project[],
  schedules: ScheduleEntry[],
  vehicles: Vehicle[],
  existing: Quantity[],
  untilExclusive?: string,
  workerKinds?: Record<string, WorkerKind> | null
): SyncLaborResult {
  let quantities = existing
  let added = 0
  let removed = 0
  let updated = 0
  let changed = false

  for (const p of projects) {
    if (p.deleted) continue
    const r = syncProjectScheduleLabor(
      p,
      schedules,
      vehicles,
      quantities,
      untilExclusive,
      workerKinds
    )
    quantities = r.quantities
    added += r.added
    removed += r.removed
    updated += r.updated
    if (r.changed) changed = true
  }

  return { quantities, changed, added, removed, updated }
}

// ── 互換: 旧月次API（未使用になっても型エラー回避のため残さない）──
// ProjectDetail から月次UIを削除するため、月次関数は削除する
