// ================================================================
// 横断工程表（日別ビュー）の型定義 — 期間バー中心
// ================================================================

/** 1案件あたりの施工班（レーン）上限 */
export const MAX_CREWS_PER_PROJECT = 5

/** 行 = 案件 × 施工班（レーン） */
export type CrossScheduleRow = {
  id: string
  projectId: string
  /** 施工班・協力会社名（例: トキトA / 藤澤班 / 大阪設備） */
  crewName: string
  /** 業者固定色。空なら名前から自動割当 */
  crewColor: string
  sortOrder: number
}

/** @deprecated 旧セル塗り。互換のため型のみ残す */
export type CrossScheduleCell = {
  rowId: string
  date: string
  mark: string
  spanNo: string
  note: string
  colorBg: string
  colorFg: string
}

/** 工種（調査・処理・管更生など） */
export type CrossWorkKind = {
  id: string
  kindKey: string
  label: string
  color: string
  sortOrder: number
  /** 会社カスタム */
  custom?: boolean
}

/** 期間バー（開始〜終了の帯） */
export type CrossScheduleBar = {
  id: string
  rowId: string
  startDate: string
  endDate: string
  workKindId: string
  /** 帯上の短い表示名（空なら工種名） */
  label: string
  note: string
  /** 表示用の目安日数。未設定なら暦日数 */
  plannedDays: number | null
}

export type MarkDef = {
  id?: string
  char: string
  label: string
  bg: string
  fg: string
  sortOrder?: number
  custom?: boolean
}

export type CrossScheduleSticky = {
  id: string
  rowId: string
  date: string
  body: string
  color: string
  offsetX: number
  offsetY: number
  zIndex: number
}

export const STICKY_COLORS = [
  "#fff59d",
  "#ffcc80",
  "#ef9a9a",
  "#ce93d8",
  "#90caf9",
  "#a5d6a7",
  "#f5f5f5",
] as const

/** 既定の工種（色固定） */
export const DEFAULT_WORK_KINDS: Omit<CrossWorkKind, "id" | "custom">[] = [
  { kindKey: "survey", label: "調査", color: "#00897b", sortOrder: 10 },
  { kindKey: "prep", label: "処理", color: "#9e9d24", sortOrder: 20 },
  { kindKey: "rehab", label: "管更生", color: "#1565c0", sortOrder: 30 },
  { kindKey: "finish", label: "仕上", color: "#ef6c00", sortOrder: 40 },
  { kindKey: "inspect", label: "検査", color: "#c62828", sortOrder: 50 },
  { kindKey: "other", label: "その他", color: "#78909c", sortOrder: 90 },
]

/** 業者色の自動割当パレット */
export const CREW_COLOR_PALETTE = [
  "#1565c0",
  "#6a1b9a",
  "#c62828",
  "#2e7d32",
  "#ef6c00",
  "#00838f",
  "#ad1457",
  "#4527a0",
  "#558b2f",
  "#4e342e",
] as const

export function crewColorForName(name: string, explicit?: string): string {
  if (explicit && /^#[0-9a-fA-F]{6}$/.test(explicit)) return explicit
  const key = name.trim() || "?"
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return CREW_COLOR_PALETTE[h % CREW_COLOR_PALETTE.length]
}

export function mergeWorkKinds(custom: CrossWorkKind[]): CrossWorkKind[] {
  const byLabel = new Map<string, CrossWorkKind>()
  for (const k of DEFAULT_WORK_KINDS) {
    byLabel.set(k.label, {
      id: `default:${k.kindKey}`,
      kindKey: k.kindKey,
      label: k.label,
      color: k.color,
      sortOrder: k.sortOrder,
    })
  }
  for (const k of custom) {
    byLabel.set(k.label, { ...k, custom: true })
  }
  return [...byLabel.values()].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.label.localeCompare(b.label, "ja")
  })
}

export function workKindById(kinds: CrossWorkKind[], id: string): CrossWorkKind | null {
  if (!id) return null
  const direct = kinds.find((k) => k.id === id)
  if (direct) return direct
  // 既定ID（default:survey 等）→ 同名のカスタム上書きを拾う
  if (id.startsWith("default:")) {
    const key = id.slice("default:".length)
    return kinds.find((k) => k.kindKey === key) ?? null
  }
  return null
}

/** 暦日数（両端含む） */
export function calendarDaysInclusive(startDate: string, endDate: string): number {
  const a = new Date(startDate + "T12:00:00")
  const b = new Date(endDate + "T12:00:00")
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000)
  return Math.max(0, diff) + 1
}

export function barDisplayDays(bar: Pick<CrossScheduleBar, "startDate" | "endDate" | "plannedDays">): number {
  if (bar.plannedDays != null && bar.plannedDays > 0) return bar.plannedDays
  return calendarDaysInclusive(bar.startDate, bar.endDate)
}

export function addCalendarDays(startDate: string, days: number): string {
  const d = new Date(startDate + "T12:00:00")
  d.setDate(d.getDate() + Math.max(0, days - 1))
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** 旧マーク定義（互換） */
export const DEFAULT_MARK_DEFS: MarkDef[] = [
  { char: "完", label: "完了", bg: "#c8e6c9", fg: "#1b5e20" },
  { char: "予", label: "予定", bg: "#bbdefb", fg: "#0d47a1" },
  { char: "仕", label: "仕上", bg: "#ffe0b2", fg: "#e65100" },
  { char: "雨", label: "雨天", bg: "#b3e5fc", fg: "#01579b" },
  { char: "休", label: "休工", bg: "#eceff1", fg: "#546e7a" },
  { char: "夜", label: "夜間", bg: "#d1c4e9", fg: "#4527a0" },
  { char: "処", label: "前処理", bg: "#f0f4c3", fg: "#827717" },
  { char: "調", label: "調査", bg: "#b2dfdb", fg: "#00695c" },
  { char: "測", label: "測量", bg: "#f8bbd0", fg: "#880e4f" },
  { char: "検", label: "検査", bg: "#ffcdd2", fg: "#b71c1c" },
]

export const MARK_DEFS = DEFAULT_MARK_DEFS

export function mergeMarkDefs(custom: MarkDef[]): MarkDef[] {
  const byChar = new Map<string, MarkDef>()
  for (const m of DEFAULT_MARK_DEFS) byChar.set(m.char, { ...m })
  for (const m of custom) byChar.set(m.char, { ...m, custom: true })
  return [...byChar.values()].sort((a, b) => {
    const ao = a.sortOrder ?? 999
    const bo = b.sortOrder ?? 999
    if (ao !== bo) return ao - bo
    return a.char.localeCompare(b.char, "ja")
  })
}

export function markDefFromList(mark: string, marks: MarkDef[]): MarkDef | null {
  if (!mark) return null
  return marks.find((m) => m.char === mark) ?? null
}

export function markDef(mark: string): MarkDef | null {
  return markDefFromList(mark, DEFAULT_MARK_DEFS)
}

export const FREE_MARK_STYLE = { bg: "#fff9c4", fg: "#5d4037" }

export const CELL_COLOR_PRESETS: { bg: string; fg: string; label: string }[] = [
  { bg: "#c8e6c9", fg: "#1b5e20", label: "緑" },
  { bg: "#bbdefb", fg: "#0d47a1", label: "青" },
  { bg: "#ffe0b2", fg: "#e65100", label: "橙" },
  { bg: "#b3e5fc", fg: "#01579b", label: "水色" },
  { bg: "#eceff1", fg: "#546e7a", label: "灰" },
  { bg: "#d1c4e9", fg: "#4527a0", label: "紫" },
  { bg: "#f0f4c3", fg: "#827717", label: "黄緑" },
  { bg: "#b2dfdb", fg: "#00695c", label: "青緑" },
  { bg: "#f8bbd0", fg: "#880e4f", label: "桃" },
  { bg: "#ffcdd2", fg: "#b71c1c", label: "赤" },
  { bg: "#fff9c4", fg: "#5d4037", label: "黄" },
  { bg: "#d7ccc8", fg: "#4e342e", label: "茶" },
]

export function resolveCellColors(
  cell: Pick<CrossScheduleCell, "mark" | "colorBg" | "colorFg"> | null | undefined,
  marks: MarkDef[]
): { bg: string; fg: string } | null {
  if (!cell?.mark && !cell?.colorBg) return null
  if (cell.colorBg) return { bg: cell.colorBg, fg: cell.colorFg || FREE_MARK_STYLE.fg }
  if (cell.mark) {
    const def = markDefFromList(cell.mark, marks)
    return def ? { bg: def.bg, fg: def.fg } : FREE_MARK_STYLE
  }
  return null
}
