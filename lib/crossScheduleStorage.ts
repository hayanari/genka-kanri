// ================================================================
// lib/crossScheduleStorage.ts
// 横断工程表 — 期間バー・工種・行（Supabase）
// ================================================================
import { createClient } from "@/lib/supabase/client"
import { requireCompanyId } from "@/lib/tenant"
import type {
  CrossScheduleRow,
  CrossScheduleCell,
  CrossScheduleSticky,
  CrossScheduleBar,
  CrossWorkKind,
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
    .select("id, project_id, crew_name, crew_color, sort_order")
    .eq("company_id", companyId)
    .order("project_id")
    .order("sort_order")
  if (error) {
    // crew_color 未適用の互換
    if (/crew_color/i.test(error.message)) {
      const retry = await supabase
        .from("cross_schedule_rows")
        .select("id, project_id, crew_name, sort_order")
        .eq("company_id", companyId)
        .order("project_id")
        .order("sort_order")
      if (retry.error) throw retry.error
      return (retry.data ?? []).map((r) => ({
        id: String(r.id),
        projectId: String(r.project_id),
        crewName: String(r.crew_name ?? ""),
        crewColor: "",
        sortOrder: Number(r.sort_order ?? 0),
      }))
    }
    throw error
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    crewName: String(r.crew_name ?? ""),
    crewColor: String((r as { crew_color?: string }).crew_color ?? ""),
    sortOrder: Number(r.sort_order ?? 0),
  }))
}

/** @deprecated 旧セル。互換のため残す */
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
  const payload: Record<string, unknown> = {
    id: row.id,
    company_id: companyId,
    project_id: row.projectId,
    crew_name: row.crewName,
    sort_order: row.sortOrder,
    crew_color: row.crewColor ?? "",
  }
  const { error } = await supabase.from("cross_schedule_rows").upsert(payload, { onConflict: "id" })
  if (error) {
    if (/crew_color/i.test(error.message)) {
      delete payload.crew_color
      const retry = await supabase.from("cross_schedule_rows").upsert(payload, { onConflict: "id" })
      if (retry.error) throw retry.error
      return
    }
    throw error
  }
}

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

export async function saveCrossScheduleCell(cell: CrossScheduleCell): Promise<void> {
  await saveCrossScheduleCells([cell])
}

export async function saveCrossScheduleCells(cells: CrossScheduleCell[]): Promise<void> {
  if (cells.length === 0) return
  await assertWritable()
  const supabase = createClient()
  const companyId = await requireCompanyId()

  const toDelete = cells.filter((c) => !c.mark && !c.spanNo && !c.note && !c.colorBg)
  const toUpsert = cells.filter((c) => c.mark || c.spanNo || c.note || c.colorBg)

  if (toDelete.length > 0) {
    await Promise.all(
      toDelete.map((c) =>
        supabase
          .from("cross_schedule_cells")
          .delete()
          .eq("company_id", companyId)
          .eq("row_id", c.rowId)
          .eq("date", c.date)
      )
    )
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase.from("cross_schedule_cells").upsert(
      toUpsert.map((c) => ({
        row_id: c.rowId,
        date: c.date,
        company_id: companyId,
        mark: c.mark,
        span_no: c.spanNo,
        note: c.note,
        color_bg: c.colorBg ?? "",
        color_fg: c.colorFg ?? "",
      })),
      { onConflict: "row_id,date" }
    )
    if (error) throw error
  }
}

// ── 工種マスタ ─────────────────────────────────────────────────────

export async function loadCrossWorkKinds(): Promise<CrossWorkKind[]> {
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { data, error } = await supabase
    .from("cross_schedule_work_kinds")
    .select("id, kind_key, label, color, sort_order")
    .eq("company_id", companyId)
    .order("sort_order")
  if (error) {
    if (/cross_schedule_work_kinds|schema cache|does not exist/i.test(error.message)) return []
    throw error
  }
  return (data ?? []).map((k) => ({
    id: String(k.id),
    kindKey: String(k.kind_key ?? ""),
    label: String(k.label ?? ""),
    color: String(k.color ?? "#90caf9"),
    sortOrder: Number(k.sort_order ?? 0),
    custom: true,
  }))
}

export async function upsertCrossWorkKind(kind: CrossWorkKind & { id: string }): Promise<void> {
  await assertWritable()
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { error } = await supabase.from("cross_schedule_work_kinds").upsert(
    {
      id: kind.id,
      company_id: companyId,
      kind_key: kind.kindKey || "",
      label: kind.label,
      color: kind.color,
      sort_order: kind.sortOrder ?? 0,
    },
    { onConflict: "id" }
  )
  if (error) throw error
}

export async function deleteCrossWorkKind(kindId: string): Promise<void> {
  await assertWritable()
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { error } = await supabase
    .from("cross_schedule_work_kinds")
    .delete()
    .eq("company_id", companyId)
    .eq("id", kindId)
  if (error) throw error
}

// ── 期間バー ───────────────────────────────────────────────────────

export async function loadCrossScheduleBars(
  startDate: string,
  endDate: string
): Promise<CrossScheduleBar[]> {
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { data, error } = await supabase
    .from("cross_schedule_bars")
    .select("id, row_id, start_date, end_date, work_kind_id, label, note, planned_days")
    .eq("company_id", companyId)
    .lte("start_date", endDate)
    .gte("end_date", startDate)
  if (error) {
    if (/cross_schedule_bars|schema cache|does not exist/i.test(error.message)) return []
    throw error
  }
  return (data ?? []).map((b) => ({
    id: String(b.id),
    rowId: String(b.row_id),
    startDate: String(b.start_date).slice(0, 10),
    endDate: String(b.end_date).slice(0, 10),
    workKindId: String(b.work_kind_id ?? ""),
    label: String(b.label ?? ""),
    note: String(b.note ?? ""),
    plannedDays: b.planned_days == null ? null : Number(b.planned_days),
  }))
}

export async function upsertCrossScheduleBar(bar: CrossScheduleBar): Promise<void> {
  await assertWritable()
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { error } = await supabase.from("cross_schedule_bars").upsert(
    {
      id: bar.id,
      company_id: companyId,
      row_id: bar.rowId,
      start_date: bar.startDate,
      end_date: bar.endDate,
      work_kind_id: bar.workKindId,
      label: bar.label,
      note: bar.note,
      planned_days: bar.plannedDays,
    },
    { onConflict: "id" }
  )
  if (error) throw error
}

export async function deleteCrossScheduleBar(barId: string): Promise<void> {
  await assertWritable()
  const supabase = createClient()
  const companyId = await requireCompanyId()
  const { error } = await supabase
    .from("cross_schedule_bars")
    .delete()
    .eq("company_id", companyId)
    .eq("id", barId)
  if (error) throw error
}

// ── カスタムマーク（互換）──────────────────────────────────────────

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

// ── 付箋（互換）───────────────────────────────────────────────────

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
