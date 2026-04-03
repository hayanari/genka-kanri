export type ProcessMeetingRow = {
  id: string
  projectId: string
  processName: string
  plannedStart: string | null
  plannedEnd: string | null
  actualStart: string | null
  actualEnd: string | null
  sortOrder: number
}
