import { createClient } from "@/lib/supabase/client"
import type { ProcessMeetingRow } from "@/types/processMeeting"

function rowFromDb(r: Record<string, unknown>): ProcessMeetingRow {
  const pc = r.planned_bar_color != null && String(r.planned_bar_color).trim() !== "" ? String(r.planned_bar_color).trim() : null
  const ac = r.actual_bar_color != null && String(r.actual_bar_color).trim() !== "" ? String(r.actual_bar_color).trim() : null
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    processName: String(r.process_name ?? ""),
    plannedStart: r.planned_start ? String(r.planned_start).slice(0, 10) : null,
    plannedEnd: r.planned_end ? String(r.planned_end).slice(0, 10) : null,
    actualStart: r.actual_start ? String(r.actual_start).slice(0, 10) : null,
    actualEnd: r.actual_end ? String(r.actual_end).slice(0, 10) : null,
    sortOrder: Number(r.sort_order ?? 0),
    plannedBarColor: pc,
    actualBarColor: ac,
  }
}

export async function loadProcessMeetingRows(): Promise<ProcessMeetingRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("process_meeting_rows")
    .select("*")
    .order("project_id")
    .order("sort_order")
  if (error) {
    console.error("[processMeeting] load rows", error)
    throw error
  }
  return (data ?? []).map((r) => rowFromDb(r as Record<string, unknown>))
}

export async function loadProcessMeetingMeta(): Promise<{ hiddenProjectIds: string[] }> {
  const supabase = createClient()
  const { data, error } = await supabase.from("process_meeting_meta").select("hidden_project_ids").eq("id", "default").maybeSingle()
  if (error) {
    console.error("[processMeeting] load meta", error)
    return { hiddenProjectIds: [] }
  }
  const ids = (data as { hidden_project_ids?: string[] } | null)?.hidden_project_ids
  return { hiddenProjectIds: Array.isArray(ids) ? ids : [] }
}

export async function saveProcessMeetingMeta(hiddenProjectIds: string[]): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from("process_meeting_meta").upsert(
    {
      id: "default",
      hidden_project_ids: hiddenProjectIds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  )
  if (error) throw error
}

export async function upsertProcessMeetingRows(rows: ProcessMeetingRow[]): Promise<void> {
  const supabase = createClient()
  const payload = rows.map((r) => ({
    id: r.id,
    project_id: r.projectId,
    process_name: r.processName,
    planned_start: r.plannedStart,
    planned_end: r.plannedEnd,
    actual_start: r.actualStart,
    actual_end: r.actualEnd,
    sort_order: r.sortOrder,
    planned_bar_color: r.plannedBarColor ?? null,
    actual_bar_color: r.actualBarColor ?? null,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from("process_meeting_rows").upsert(payload, { onConflict: "id" })
  if (error) throw error
}

export async function deleteProcessMeetingRow(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from("process_meeting_rows").delete().eq("id", id)
  if (error) throw error
}

export async function insertProcessMeetingRows(rows: ProcessMeetingRow[]): Promise<void> {
  if (rows.length === 0) return
  const supabase = createClient()
  const payload = rows.map((r) => ({
    id: r.id,
    project_id: r.projectId,
    process_name: r.processName,
    planned_start: r.plannedStart,
    planned_end: r.plannedEnd,
    actual_start: r.actualStart,
    actual_end: r.actualEnd,
    sort_order: r.sortOrder,
    planned_bar_color: r.plannedBarColor ?? null,
    actual_bar_color: r.actualBarColor ?? null,
  }))
  const { error } = await supabase.from("process_meeting_rows").insert(payload)
  if (error) throw error
}

export type ProcessMeetingWeeklyNoteRow = {
  projectId: string
  /** その週の月曜日 YYYY-MM-DD */
  weekStart: string
  noteText: string
}

/** 案件×週の朝会メモをすべて読み込み（週ごとの履歴） */
export async function loadProcessMeetingWeeklyNotes(): Promise<ProcessMeetingWeeklyNoteRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("process_meeting_project_notes")
    .select("project_id, week_start, note_text")
    .order("week_start", { ascending: false })
  if (error) {
    console.error("[processMeeting] load weekly notes", error)
    throw error
  }
  return (data ?? []).map((r) => {
    const row = r as { project_id: string; week_start: string; note_text: string | null }
    const ws = String(row.week_start).slice(0, 10)
    return {
      projectId: String(row.project_id),
      weekStart: ws,
      noteText: row.note_text != null ? String(row.note_text) : "",
    }
  })
}

export async function upsertProcessMeetingProjectNote(
  projectId: string,
  weekStart: string,
  noteText: string
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from("process_meeting_project_notes").upsert(
    {
      project_id: projectId,
      week_start: weekStart,
      note_text: noteText,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,week_start" }
  )
  if (error) throw error
}
