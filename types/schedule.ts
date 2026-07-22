// ================================================================
// types/schedule.ts
// 工事スケジュール管理 — 型定義
// ================================================================

/** 勤務区分 */
export type Shift = 'day' | 'night' | 'off'

/** 作業員区分: 自社=人工転記 / 協力=配置のみ（原価の人工に入れない） */
export type WorkerKind = 'staff' | 'partner'

export const WORKER_KIND_LABELS: Record<WorkerKind, string> = {
  staff: '自社',
  partner: '協力',
}

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
  /** 作業員名 → 退職日(YYYY-MM-DD)。この日以降は空き・新規割当候補に出さない */
  workerLeftAt?: Record<string, string>
  /** 作業員名 → 自社/協力。未設定は自社扱い */
  workerKinds?: Record<string, WorkerKind>
  schedules: ScheduleEntry[]
  dayMemos: DayMemos
}

/** ビュー種別 */
export type ViewType = 'cal' | 'list' | 'worker' | 'master'
