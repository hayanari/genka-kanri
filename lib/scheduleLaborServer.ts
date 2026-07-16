// ================================================================
// lib/scheduleLaborServer.ts
// サーバー側: 会社単位でスケジュール→人工・車両を同期して保存
// ================================================================
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Project, Quantity, Vehicle } from "@/lib/utils"
import type { ScheduleEntry } from "@/types/schedule"
import { syncAllProjectsScheduleLabor, jstTodayYmd } from "@/lib/scheduleLabor"
import { DEFAULT_COMPANY_ID } from "@/lib/tenant"

type GenkaPayload = {
  projects?: Project[]
  costs?: unknown[]
  quantities?: Quantity[]
  vehicles?: Vehicle[]
  processMasters?: unknown[]
  bidSchedules?: unknown[]
}

function mapScheduleRows(
  rows: {
    id: string
    date: string
    koujimei: string
    shift: string
    workers: string[] | null
    vehicle_ids: string[] | null
    memo: string | null
  }[]
): ScheduleEntry[] {
  return rows.map((r) => ({
    id: String(r.id),
    date: String(r.date).slice(0, 10),
    koujimei: r.koujimei ?? "",
    shift: (r.shift as ScheduleEntry["shift"]) ?? "day",
    workers: r.workers ?? [],
    vehicleIds: r.vehicle_ids ?? [],
    memo: r.memo ?? "",
  }))
}

export type CompanyLaborSyncResult = {
  companyId: string
  changed: boolean
  added: number
  removed: number
  updated: number
  error?: string
}

/** 1社分の日次自動転記を実行して genka_kanri_data を更新 */
export async function syncScheduleLaborForCompany(
  supabase: SupabaseClient,
  companyId: string
): Promise<CompanyLaborSyncResult> {
  try {
    let dataId = companyId
    let { data: row, error } = await supabase
      .from("genka_kanri_data")
      .select("data")
      .eq("id", dataId)
      .maybeSingle()

    if ((!row || error) && companyId === DEFAULT_COMPANY_ID) {
      dataId = "default"
      const fallback = await supabase
        .from("genka_kanri_data")
        .select("data")
        .eq("id", "default")
        .maybeSingle()
      row = fallback.data
      error = fallback.error
    }

    if (error) throw error
    if (!row?.data) {
      return { companyId, changed: false, added: 0, removed: 0, updated: 0, error: "no data" }
    }

    const stored = row.data as GenkaPayload
    const projects = (stored.projects ?? []) as Project[]
    const vehicles = (stored.vehicles ?? []) as Vehicle[]
    const quantities = (stored.quantities ?? []) as Quantity[]

    const today = jstTodayYmd()
    const { data: schedRows, error: schedErr } = await supabase
      .from("schedule_entries")
      .select("id, date, koujimei, shift, workers, vehicle_ids, memo")
      .eq("company_id", companyId)
      .lt("date", today)

    if (schedErr) throw schedErr
    const schedules = mapScheduleRows(schedRows ?? [])

    const result = syncAllProjectsScheduleLabor(
      projects,
      schedules,
      vehicles,
      quantities,
      today
    )

    if (!result.changed) {
      return {
        companyId,
        changed: false,
        added: 0,
        removed: 0,
        updated: 0,
      }
    }

    const nextPayload: GenkaPayload = {
      ...stored,
      quantities: result.quantities,
    }

    const { error: upErr } = await supabase.from("genka_kanri_data").upsert(
      {
        id: dataId,
        data: nextPayload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    if (upErr) throw upErr

    return {
      companyId,
      changed: true,
      added: result.added,
      removed: result.removed,
      updated: result.updated,
    }
  } catch (e) {
    return {
      companyId,
      changed: false,
      added: 0,
      removed: 0,
      updated: 0,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/** 全会社を同期 */
export async function syncScheduleLaborAllCompanies(
  supabase: SupabaseClient
): Promise<CompanyLaborSyncResult[]> {
  const { data: companyRows } = await supabase.from("companies").select("id")
  const ids =
    companyRows && companyRows.length > 0
      ? companyRows.map((c) => String(c.id))
      : [DEFAULT_COMPANY_ID]

  const results: CompanyLaborSyncResult[] = []
  for (const id of ids) {
    results.push(await syncScheduleLaborForCompany(supabase, id))
  }
  return results
}
