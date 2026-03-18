// ================================================================
// types/schedule.ts
// 工事スケジュール管理 — 型定義
// ================================================================

/** 勤務区分 */
export type Shift = 'day' | 'night' | 'off'

/** 予定エントリ */
export interface ScheduleEntry {
  id: string
  date: string       // 'YYYY-MM-DD'
  koujimei: string   // 工事名
  shift: Shift
  workers: string[]
  vehicleIds?: string[]  // 車両マスターのID（本体の車両マスターと連動）
  memo: string
}

/** 日次メモ  key: 'YYYY-MM-DD' */
export type DayMemos = Record<string, string>

/** ストレージに保存するデータ全体 */
export interface ScheduleData {
  workers: string[]
  schedules: ScheduleEntry[]
  dayMemos: DayMemos
}

/** ビュー種別 */
export type ViewType = 'cal' | 'list' | 'worker' | 'master'
