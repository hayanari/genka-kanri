// ================================================================
// lib/scheduleUtils.ts
// ビジネスロジック・ユーティリティ
// ================================================================
import type { ScheduleEntry, DayMemos, WorkerKind } from '@/types/schedule'
import { DEFAULT_WORKERS } from './sampleData'

// ─── カラー ───────────────────────────────────────────────────────
const W_COLORS = [
    '#c62828', '#bf360c', '#e65c00', '#c67c00', '#33691e',
    '#1b5e20', '#006064', '#01579b', '#0d47a1', '#4a148c',
    '#880e4f', '#3e2723', '#37474f', '#004d40', '#1a237e',
  ]
const _colorMap: Record<string, string> = {}
DEFAULT_WORKERS.forEach((w, i) => { _colorMap[w] = W_COLORS[i % W_COLORS.length] })

export const workerColor = (name: string): string => _colorMap[name] ?? '#546e7a'

/** 協力業者チップ用の固定色（自社カラーと区別） */
export const PARTNER_WORKER_COLOR = '#e65100'

export function getWorkerKind(
  name: string,
  workerKinds?: Record<string, WorkerKind> | null
): WorkerKind {
  return workerKinds?.[name] === 'partner' ? 'partner' : 'staff'
}

export function isPartnerWorker(
  name: string,
  workerKinds?: Record<string, WorkerKind> | null
): boolean {
  return getWorkerKind(name, workerKinds) === 'partner'
}

/** 表示色: 協力は固定オレンジ、自社は従来カラー */
export function displayWorkerColor(
  name: string,
  workerKinds?: Record<string, WorkerKind> | null
): string {
  return isPartnerWorker(name, workerKinds) ? PARTNER_WORKER_COLOR : workerColor(name)
}

export const hexRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
}

// ─── 日付ユーティリティ ────────────────────────────────────────────
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

// ─── ロジック ──────────────────────────────────────────────────────
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

/** その日に退職済みか（退職日当日以降は true） */
export function isWorkerLeftOnDate(
  name: string,
  date: string,
  workerLeftAt?: Record<string, string> | null
): boolean {
  const left = workerLeftAt?.[name]
  if (!left) return false
  return date >= left.slice(0, 10)
}

/** その日に空いているメンバー（有休・夜勤明け・退職済みを除外） */
export function getAvailableWorkers(
  date: string,
  schedules: ScheduleEntry[],
  workers: string[],
  workerLeftAt?: Record<string, string> | null
): string[] {
  const assigned = new Set(
    schedules.filter(s => s.date === date && s.shift !== 'off').flatMap(e => e.workers)
  )
  const off = getOffWorkers(date, schedules)
  const nightBefore = getNightBefore(date, schedules)
  return workers.filter(
    w =>
      !assigned.has(w) &&
      !off.has(w) &&
      !nightBefore.has(w) &&
      !isWorkerLeftOnDate(w, date, workerLeftAt)
  )
}

/** 予定モーダル等で選べる作業員（退職済みは、既に選択中の場合のみ残す） */
export function getSelectableWorkers(
  date: string,
  workers: string[],
  selected: Iterable<string>,
  workerLeftAt?: Record<string, string> | null
): string[] {
  const sel = new Set(selected)
  return workers.filter(w => sel.has(w) || !isWorkerLeftOnDate(w, date, workerLeftAt))
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

const scheduleSortKey = (s: ScheduleEntry) => `${s.date}\0${s.id}`

/**
 * 作業員マスタと各予定の workers を統合した一覧。
 * - マスタが空だが予定に名前が残っている場合は、予定から復元（日付・id 順の初出順）
 * - マスタに無いが予定だけにいる名前は、マスタの末尾に追加
 * （DB が空マスタで壊れたケースや、マスタ削除後に予定だけ残っているケースの救済）
 */
export function effectiveWorkerList(master: string[], schedules: ScheduleEntry[]): string[] {
    const masterClean = master.map((x) => x.trim()).filter(Boolean)
    const orderedSchedules = [...schedules].sort((a, b) =>
      scheduleSortKey(a).localeCompare(scheduleSortKey(b))
    )
    if (masterClean.length > 0) {
      const set = new Set(masterClean)
      const appended: string[] = []
      for (const s of orderedSchedules) {
        for (const w of s.workers ?? []) {
          const t = w.trim()
          if (t && !set.has(t)) {
            set.add(t)
            appended.push(t)
          }
        }
      }
      return [...masterClean, ...appended]
    }
    const seen = new Set<string>()
    const out: string[] = []
    for (const s of orderedSchedules) {
      for (const w of s.workers ?? []) {
        const t = w.trim()
        if (t && !seen.has(t)) {
          seen.add(t)
          out.push(t)
        }
      }
    }
    return out
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
