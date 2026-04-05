export type ProcessMeetingRow = {
  id: string
  projectId: string
  processName: string
  plannedStart: string | null
  plannedEnd: string | null
  actualStart: string | null
  actualEnd: string | null
  sortOrder: number
  /** 予定帯の塗り色（#RRGGBB）。未設定時は既定の青 */
  plannedBarColor?: string | null
  /** 実施帯の塗り色（#RRGGBB）。未設定時は遅れ・前倒し等の自動色 */
  actualBarColor?: string | null
}
