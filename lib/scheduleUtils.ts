// ================================================================
// lib/scheduleUtils.ts
// ビジネスロジック・ユーティリティ
// ================================================================
import type { ScheduleEntry, DayMemos } from '@/types/schedule'
import { DEFAULT_WORKERS, NGSC_WORKERS } from './sampleData'

// ─── カラー ─────────────────────────────────────────────────────
const W_COLORS = [
  '#c62828', '#bf360c', '#e65c00', '#c67c00', '#33691e',
  '#1b5e20', '#006064', '#01579b', '#0d47a1', '#4a148c',
  '#880e4f', '#3e2723', '#37474f', '#004d40', '#1a237e',
]
const _colorMap: Record<string, string> = {}
DEFAULT_WORKERS.forEach((w, i) => { _colorMap[w] = W_COLORS[i % W_COLORS.length] })

export const workerColor = (name: string): string => _colorMap[name] ?? '#546e7a'

export const hexRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ─── 日付ユーティリティ ──────────────────────────────────────────
export const TODAY_STR = (() => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
})()

export const daysInMonth = (year: number, month: number): number =>
  new Date(year, month + 1, 0).getDate()

export const addDays = (dateStr: string, n: number): string => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export const genId = (): string =>
  'sc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

// ─── ロジック ────────────────────────────────────────────────────

/**
 * 同日重複チェック
 * - 昼/夜の同日ダブルアサイン
 * - 有休なのに昼または夜にも登録されている
 */
export function getConflicts(date: string, schedules: ScheduleEntry[]): Set<string> {
  const cnt: Record<string, number> = {}
  schedules
    .filter(s => s.date === date && s.shift !== 'off')
    .forEach(e => e.workers.forEach(w => { cnt[w] = (cnt[w] ?? 0) + 1 }))

  // 有休×仕事
  const offSet = new Set(schedules.filter(s => s.date === date && s.shift === 'off').flatMap(e => e.workers))
  const workSet = new Set(schedules.filter(s => s.date === date && s.shift !== 'off').flatMap(e => e.workers))
  offSet.forEach(w => { if (workSet.has(w)) cnt[w] = (cnt[w] ?? 0) + 2 })

  return new Set(Object.entries(cnt).filter(([, n]) => n > 1).map(([w]) => w))
}

/** 同日に同じ車両が複数登録されている場合の車両IDセット */
export function getVehicleConflicts(date: string, schedules: ScheduleEntry[]): Set<string> {
  const cnt: Record<string, number> = {}
  schedules
    .filter(s => s.date === date && s.shift !== 'off')
    .forEach(e => (e.vehicleIds ?? []).forEach(vid => { cnt[vid] = (cnt[vid] ?? 0) + 1 }))
  return new Set(Object.entries(cnt).filter(([, n]) => n > 1).map(([vid]) => vid))
}

/** その日に有休として登録されているメンバー */
export function getOffWorkers(date: string, schedules: ScheduleEntry[]): Set<string> {
  return new Set(
    schedules.filter(s => s.date === date && s.shift === 'off').flatMap(e => e.workers)
  )
}

/** 前日夜勤メンバー（翌日の空きから除外） */
export function getNightBefore(date: string, schedules: ScheduleEntry[]): Set<string> {
  return new Set(
    schedules.filter(s => s.date === addDays(date, -1) && s.shift === 'night').flatMap(e => e.workers)
  )
}

/** その日に空いているメンバー（有休・夜勤明けを除外） */
export function getAvailableWorkers(
  date: string,
  schedules: ScheduleEntry[],
  workers: string[]
): string[] {
  const assigned = new Set(
    schedules.filter(s => s.date === date && s.shift !== 'off').flatMap(e => e.workers)
  )
  const off = getOffWorkers(date, schedules)
  const nightBefore = getNightBefore(date, schedules)
  return workers.filter(w => !assigned.has(w) && !off.has(w) && !nightBefore.has(w))
}

/** 前日の夜勤エントリ（翌日に「夜勤明け」として表示） */
export function getMorningEntries(date: string, schedules: ScheduleEntry[]): ScheduleEntry[] {
  return schedules.filter(s => s.date === addDays(date, -1) && s.shift === 'night')
}

/** 平日かどうか（土日以外） */
function isWeekday(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()
  return dow >= 1 && dow <= 5
}

/** 指定月の平日NGSCエントリを生成（既存と重複しない分のみ） */
export function getNGSCEntriesForMonth(
  year: number,
  month: number,
  existingSchedules: ScheduleEntry[],
  workersList: string[]
): ScheduleEntry[] {
  const existingDates = new Set(
    existingSchedules.filter(s => getBaseKoujimei(s.koujimei) === 'NGSC').map(s => s.date)
  )
  const entries: ScheduleEntry[] = []
  const days = daysInMonth(year, month)
  for (let d = 1; d <= days; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (isWeekday(dateStr) && !existingDates.has(dateStr)) {
      entries.push({
        id: genId(),
        date: dateStr,
        koujimei: 'NGSC',
        shift: 'day',
        workers: NGSC_WORKERS.filter(w => workersList.includes(w)),
        memo: '',
      })
    }
  }
  return entries
}

/** NGSCメンバーが作業員マスターにいなければ追加 */
function ensureNGSCWorkers(workers: string[]): string[] {
  const set = new Set(workers)
  for (const w of NGSC_WORKERS) {
    if (!set.has(w)) {
      set.add(w)
      workers = [...workers, w]
    }
  }
  return workers
}

/** 指定月の平日にNGSCがなければ追加して返す */
export function ensureNGSCInData(
  workers: string[],
  schedules: ScheduleEntry[],
  dayMemos: DayMemos,
  year: number,
  month: number
): { workers: string[]; schedules: ScheduleEntry[]; dayMemos: DayMemos; added: boolean } {
  const w = ensureNGSCWorkers(workers)
  const toAdd = getNGSCEntriesForMonth(year, month, schedules, w)
  if (toAdd.length === 0 && w.length === workers.length) {
    return { workers, schedules, dayMemos, added: false }
  }
  const workersAdded = w.length > workers.length
  return {
    workers: w,
    schedules: toAdd.length > 0 ? [...schedules, ...toAdd].sort((a, b) => a.date.localeCompare(b.date)) : schedules,
    dayMemos,
    added: toAdd.length > 0 || workersAdded,
  }
}

/** 月のスケジュールだけ抽出 */
export function getMonthSchedules(
  year: number,
  month: number,
  schedules: ScheduleEntry[]
): ScheduleEntry[] {
  return schedules.filter(s => {
    const [sy, sm] = s.date.split('-')
    return +sy === year && +sm - 1 === month
  })
}

/** 工事名から班区切りサフィックス（ A, B, C...）を除去したベース名 */
export function getBaseKoujimei(koujimei: string): string {
  const m = koujimei.match(/^(.+?)( [A-Z])$/)
  return m ? m[1].trim() : koujimei.trim()
}

/**
 * 同日に同じ工事名が複数ある場合、A/B/C... を付与して区別する
 * @param entry 保存対象エントリ
 * @param allSchedules 全スケジュール（entry を含む想定）
 * @returns 同日同工事のエントリ群を更新した新しい schedules 配列
 */
export function applySameDayKoujimeiSuffix(
  entry: ScheduleEntry,
  allSchedules: ScheduleEntry[]
): ScheduleEntry[] {
  const base = getBaseKoujimei(entry.koujimei)
  const sameDateSameBase = allSchedules.filter(
    s => s.date === entry.date && getBaseKoujimei(s.koujimei) === base && s.shift !== 'off'
  )
  const isEdit = !!entry.id && sameDateSameBase.some(s => s.id === entry.id)
  const withNew = isEdit
    ? sameDateSameBase.map(s => (s.id === entry.id ? entry : s))
    : [...sameDateSameBase, entry]
  const suffixes = [' A', ' B', ' C', ' D', ' E', ' F', ' G', ' H']
  const updated = withNew.length <= 1
    ? withNew.map((s, i) => ({ ...s, koujimei: base }))
    : withNew.map((s, i) => ({ ...s, koujimei: base + (suffixes[i] ?? ` ${String.fromCharCode(65 + i)}`) }))
  const idsToReplace = new Set(updated.map(u => u.id))
  const others = allSchedules.filter(s => !idsToReplace.has(s.id))
  return [...others, ...updated]
}
