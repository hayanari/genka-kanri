// ================================================================
// 横断工程表（日別ビュー）の型定義
// ================================================================

/** 行 = 案件 × 施工班 */
export type CrossScheduleRow = {
  id: string
  projectId: string
  /** 施工班・協力会社名（例: トキトA / 藤澤班 / 大阪設備） */
  crewName: string
  sortOrder: number
}

/** セル = 行 × 日付 */
export type CrossScheduleCell = {
  rowId: string
  /** YYYY-MM-DD */
  date: string
  /** マーク種別（完 / 予 / 仕 / 雨 / 休 / 夜 など） */
  mark: string
  /** スパン番号などの表示テキスト（例: "12"） */
  spanNo: string
  /** 注記（ツールチップ表示） */
  note: string
  /** セル個別の背景色（空ならフォールバック） */
  colorBg: string
  /** セル個別の文字色 */
  colorFg: string
}

export type MarkDef = {
  /** DB id。既定マークは undefined */
  id?: string
  /** セルに表示する文字（DB上のキーでもある） */
  char: string
  label: string
  /** セル背景色 */
  bg: string
  /** 文字色 */
  fg: string
  sortOrder?: number
  /** 会社が追加・編集したマーク */
  custom?: boolean
}

/** セル上の付箋メモ */
export type CrossScheduleSticky = {
  id: string
  rowId: string
  date: string
  body: string
  /** 付箋の紙色 */
  color: string
  /** セル左上からの相対位置(px) */
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

/** エクセル運用で使われていた既定マーク */
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

/** @deprecated 互換用。DEFAULT_MARK_DEFS と同じ */
export const MARK_DEFS = DEFAULT_MARK_DEFS

/** 既定 + 会社カスタムをマージ（同じ char はカスタム優先） */
export function mergeMarkDefs(custom: MarkDef[]): MarkDef[] {
  const byChar = new Map<string, MarkDef>()
  for (const m of DEFAULT_MARK_DEFS) byChar.set(m.char, { ...m })
  for (const m of custom) {
    byChar.set(m.char, { ...m, custom: true })
  }
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

/** マーク未登録・色未指定のときのフォールバック */
export const FREE_MARK_STYLE = { bg: "#fff9c4", fg: "#5d4037" }

/** セルに塗るときの色プリセット（マーク名とは独立） */
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

/** セル表示色を解決（セル個別色 > マーク既定 > フォールバック） */
export function resolveCellColors(
  cell: Pick<CrossScheduleCell, "mark" | "colorBg" | "colorFg"> | null | undefined,
  marks: MarkDef[]
): { bg: string; fg: string } | null {
  if (!cell?.mark && !cell?.colorBg) return null
  if (cell.colorBg) {
    return { bg: cell.colorBg, fg: cell.colorFg || FREE_MARK_STYLE.fg }
  }
  if (cell.mark) {
    const def = markDefFromList(cell.mark, marks)
    return def ? { bg: def.bg, fg: def.fg } : FREE_MARK_STYLE
  }
  return null
}
