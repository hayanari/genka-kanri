// ================================================================
// lib/crossScheduleStorage.ts
// 横断工程表（日別ビュー）のストレージ層 — Supabase
// ================================================================
import { createClient } from "@/lib/supabase/client"
import { requireCompanyId } from "@/lib/tenant"
import type {
  CrossScheduleRow,
  CrossScheduleCell,
  CrossScheduleSticky,
  MarkDef,
} from "@/types/crossSchedule"

export const CROSS_VIEWER_FORBIDDEN_MSG =
  "閲覧専用の権限のため保存できません。管理者に変更権限を依頼してください。"

async function assertWritable(): Promise<void> {
  const { canWrite } = await import("@/lib/roles")
  if (!(await canWrite())) throw new Error(CROSS_VIEWER_FORBIDDEN_MSG)
}

export async function loadCrossScheduleRows(): Promise<CrossScheduleRow[]> {
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { data, error } = await supabase
    .from("cross_schedule_rows")
    .select("id, project_id, crew_name, sort_order")
    .eq("company_id", companyId)
    .order("project_id")
    .order("sort_order")
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    crewName: String(r.crew_name ?? ""),
    sortOrder: Number(r.sort_order ?? 0),
  }))
}

/** 表示範囲の日付セルのみ読み込む（startDate〜endDate は YYYY-MM-DD、両端含む） */
export async function loadCrossScheduleCells(
  startDate: string,
  endDate: string
): Promise<CrossScheduleCell[]> {
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { data, error } = await supabase
    .from("cross_schedule_cells")
    .select("row_id, date, mark, span_no, note, color_bg, color_fg")
    .eq("company_id", companyId)
    .gte("date", startDate)
    .lte("date", endDate)
  if (error) throw error
  return (data ?? []).map((c) => ({
    rowId: String(c.row_id),
    date: String(c.date).slice(0, 10),
    mark: String(c.mark ?? ""),
    spanNo: String(c.span_no ?? ""),
    note: String(c.note ?? ""),
    colorBg: String((c as { color_bg?: string }).color_bg ?? ""),
    colorFg: String((c as { color_fg?: string }).color_fg ?? ""),
  }))
}

export async function upsertCrossScheduleRow(row: CrossScheduleRow): Promise<void> {
  await assertWritable()
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { error } = await supabase.from("cross_schedule_rows").upsert(
    {
      id: row.id,
      company_id: companyId,
      project_id: row.projectId,
      crew_name: row.crewName,
      sort_order: row.sortOrder,
    },
    { onConflict: "id" }
  )
  if (error) throw error
}

/** 行を削除（セル・付箋は ON DELETE CASCADE で消える） */
export async function deleteCrossScheduleRow(rowId: string): Promise<void> {
  await assertWritable()
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { error } = await supabase
    .from("cross_schedule_rows")
    .delete()
    .eq("company_id", companyId)
    .eq("id", rowId)
  if (error) throw error
}

/** セルを保存。内容がすべて空なら行×日付のセルを削除する */
export async function saveCrossScheduleCell(cell: CrossScheduleCell): Promise<void> {
  await assertWritable()
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const isEmpty = !cell.mark && !cell.spanNo && !cell.note && !cell.colorBg
  if (isEmpty) {
    const { error } = await supabase
      .from("cross_schedule_cells")
      .delete()
      .eq("company_id", companyId)
      .eq("row_id", cell.rowId)
      .eq("date", cell.date)
    if (error) throw error
    return
  }
  const { error } = await supabase.from("cross_schedule_cells").upsert(
    {
      row_id: cell.rowId,
      date: cell.date,
      company_id: companyId,
      mark: cell.mark,
      span_no: cell.spanNo,
      note: cell.note,
      color_bg: cell.colorBg ?? "",
      color_fg: cell.colorFg ?? "",
    },
    { onConflict: "row_id,date" }
  )
  if (error) throw error
}

// ── カスタムマーク ─────────────────────────────────────────────────

export async function loadCrossScheduleMarks(): Promise<MarkDef[]> {
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { data, error } = await supabase
    .from("cross_schedule_marks")
    .select("id, char, label, bg, fg, sort_order")
    .eq("company_id", companyId)
    .order("sort_order")
  if (error) throw error
  return (data ?? []).map((m) => ({
    id: String(m.id),
    char: String(m.char),
    label: String(m.label ?? ""),
    bg: String(m.bg ?? "#fff9c4"),
    fg: String(m.fg ?? "#5d4037"),
    sortOrder: Number(m.sort_order ?? 0),
    custom: true,
  }))
}

export async function upsertCrossScheduleMark(mark: MarkDef & { id: string }): Promise<void> {
  await assertWritable()
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { error } = await supabase.from("cross_schedule_marks").upsert(
    {
      id: mark.id,
      company_id: companyId,
      char: mark.char,
      label: mark.label,
      bg: mark.bg,
      fg: mark.fg,
      sort_order: mark.sortOrder ?? 0,
    },
    { onConflict: "id" }
  )
  if (error) throw error
}

export async function deleteCrossScheduleMark(markId: string): Promise<void> {
  await assertWritable()
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { error } = await supabase
    .from("cross_schedule_marks")
    .delete()
    .eq("company_id", companyId)
    .eq("id", markId)
  if (error) throw error
}

// ── 付箋 ───────────────────────────────────────────────────────────

export async function loadCrossScheduleStickies(
  startDate: string,
  endDate: string
): Promise<CrossScheduleSticky[]> {
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { data, error } = await supabase
    .from("cross_schedule_stickies")
    .select("id, row_id, date, body, color, offset_x, offset_y, z_index")
    .eq("company_id", companyId)
    .gte("date", startDate)
    .lte("date", endDate)
  if (error) throw error
  return (data ?? []).map((s) => ({
    id: String(s.id),
    rowId: String(s.row_id),
    date: String(s.date).slice(0, 10),
    body: String(s.body ?? ""),
    color: String(s.color ?? "#fff59d"),
    offsetX: Number(s.offset_x ?? 10),
    offsetY: Number(s.offset_y ?? 10),
    zIndex: Number(s.z_index ?? 1),
  }))
}

export async function upsertCrossScheduleSticky(sticky: CrossScheduleSticky): Promise<void> {
  await assertWritable()
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { error } = await supabase.from("cross_schedule_stickies").upsert(
    {
      id: sticky.id,
      company_id: companyId,
      row_id: sticky.rowId,
      date: sticky.date,
      body: sticky.body,
      color: sticky.color,
      offset_x: sticky.offsetX,
      offset_y: sticky.offsetY,
      z_index: sticky.zIndex,
    },
    { onConflict: "id" }
  )
  if (error) throw error
}

export async function deleteCrossScheduleSticky(stickyId: string): Promise<void> {
  await assertWritable()
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { error } = await supabase
    .from("cross_schedule_stickies")
    .delete()
    .eq("company_id", companyId)
    .eq("id", stickyId)
  if (error) throw error
}
