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
}

export type MarkDef = {
  /** セルに表示する文字（DB上のキーでもある） */
  char: string
  label: string
  /** セル背景色 */
  bg: string
  /** 文字色 */
  fg: string
}

/** エクセル運用で使われていたマーク一覧（第1弾は固定セット） */
export const MARK_DEFS: MarkDef[] = [
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

export function markDef(mark: string): MarkDef | null {
  if (!mark) return null
  return MARK_DEFS.find((m) => m.char === mark) ?? null
}

/** マーク未登録の自由文字用の色 */
export const FREE_MARK_STYLE = { bg: "#fff9c4", fg: "#5d4037" }
