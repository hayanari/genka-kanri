import { createClient } from "@/lib/supabase/client"
import type { ProcessMeetingRow } from "@/types/processMeeting"

function rowFromDb(r: Record<string, unknown>): ProcessMeetingRow {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    processName: String(r.process_name ?? ""),
    plannedStart: r.planned_start ? String(r.planned_start).slice(0, 10) : null,
    plannedEnd: r.planned_end ? String(r.planned_end).slice(0, 10) : null,
    actualStart: r.actual_start ? String(r.actual_start).slice(0, 10) : null,
    actualEnd: r.actual_end ? String(r.actual_end).slice(0, 10) : null,
    sortOrder: Number(r.sort_order ?? 0),
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
  }))
  const { error } = await supabase.from("process_meeting_rows").insert(payload)
  if (error) throw error
}
