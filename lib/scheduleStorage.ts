// ================================================================
// lib/scheduleStorage.ts
// ストレージ層 — Supabase
// ================================================================
import type { ScheduleData } from '@/types/schedule'
import { createClient } from '@/lib/supabase/client'

export async function loadScheduleData(): Promise<ScheduleData | null> {
  try {
    const supabase = createClient()
    const [
      { data: schedules },
      { data: workers },
      { data: memos },
    ] = await Promise.all([
      supabase.from('schedule_entries').select('*').order('date'),
      supabase.from('schedule_workers').select('name, sort_order').order('sort_order'),
      supabase.from('schedule_day_memos').select('date, memo'),
    ])

    // 初回（テーブル未作成や空）は null を返してサンプルデータ投入を促す
    const hasAny =
      (schedules && schedules.length > 0) ||
      (workers && workers.length > 0) ||
      (memos && memos.length > 0)
    if (!hasAny) return null

    return {
      schedules: (schedules ?? []).map((r: { id: string; date: string; koujimei: string; shift: string; workers: string[]; vehicle_ids?: string[]; memo: string }) => ({
        id: r.id,
        date: r.date,
        koujimei: r.koujimei ?? '',
        shift: r.shift as 'day' | 'night' | 'off',
        workers: r.workers ?? [],
        vehicleIds: r.vehicle_ids ?? [],
        memo: r.memo ?? '',
      })),
      workers: (workers ?? []).map((w: { name: string }) => w.name),
      dayMemos: Object.fromEntries(
        (memos ?? []).map((m: { date: string; memo: string }) => [m.date, m.memo ?? ''])
      ),
    }
  } catch (e) {
    console.error('[ScheduleStorage] load error:', e)
    return null
  }
}

export async function saveScheduleData(data: ScheduleData): Promise<void> {
  try {
    const supabase = createClient()

    // 1. 予定エントリ
    if (data.schedules.length > 0) {
      await supabase.from('schedule_entries').upsert(
        data.schedules.map((s) => ({
          id: s.id,
          date: s.date,
          koujimei: s.koujimei,
          shift: s.shift,
          workers: s.workers,
          vehicle_ids: s.vehicleIds ?? [],
          memo: s.memo ?? '',
        })),
        { onConflict: 'id' }
      )

      // 削除されたエントリを除去
      const ids = data.schedules.map((s) => s.id)
      const idsStr = ids.map((id) => `"${String(id).replace(/"/g, '""')}"`).join(',')
      await supabase.from('schedule_entries').delete().not('id', 'in', `(${idsStr})`)
    } else {
      await supabase.from('schedule_entries').delete().like('id', '%')
    }

    // 2. 作業員マスター（全置換）
    await supabase.from('schedule_workers').delete().gte('id', 1)
    if (data.workers.length > 0) {
      await supabase.from('schedule_workers').insert(
        data.workers.map((name, i) => ({ name, sort_order: i }))
      )
    }

    // 3. 日次メモ
    const memoRows = Object.entries(data.dayMemos).map(([date, memo]) => ({
      date,
      memo: memo ?? '',
    }))
    if (memoRows.length > 0) {
      await supabase.from('schedule_day_memos').upsert(memoRows, { onConflict: 'date' })
    }

    // 削除されたメモを除去
    const memoDates = Object.keys(data.dayMemos)
    if (memoDates.length > 0) {
      const datesStr = memoDates.map((d) => `"${d}"`).join(',')
      await supabase.from('schedule_day_memos').delete().not('date', 'in', `(${datesStr})`)
    } else {
      await supabase.from('schedule_day_memos').delete().gte('date', '1970-01-01')
    }
  } catch (e) {
    console.error('[ScheduleStorage] save error:', e)
    throw e
  }
}
