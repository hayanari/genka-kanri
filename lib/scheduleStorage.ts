// ================================================================
// lib/scheduleStorage.ts
// ストレージ層 — Supabase
// ================================================================
import type { ScheduleData } from '@/types/schedule'
import { createClient } from '@/lib/supabase/client'

const PENDING_KEY = 'schedule_pending'
const PENDING_TTL_MS = 15_000 // 15秒以内のバックアップのみ復元

/** スケジュールを同期的に sessionStorage にバックアップ（リロード対策） */
export function saveSchedulePendingSync(data: ScheduleData): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({
      data,
      ts: Date.now(),
    }))
  } catch {}
}

/** 直近で保存された未確定データがあれば返す */
export function loadSchedulePending(): ScheduleData | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw) as { data: ScheduleData; ts: number }
    if (Date.now() - ts > PENDING_TTL_MS) {
      sessionStorage.removeItem(PENDING_KEY)
      return null
    }
    return data
  } catch {
    return null
  }
}

/**
 * サーバー上のスケジュール関連テーブルの「版」を表す文字列。
 * 他端末で保存されると変わる（同時編集の保存前チェック・タブ復帰時の検知用）
 */
export async function fetchScheduleRevision(): Promise<string> {
  try {
    const supabase = createClient()
    const [
      { data: eRow },
      { count: eCount },
      { data: mRow },
      { count: mCount },
      { count: wCount },
    ] = await Promise.all([
      supabase.from('schedule_entries').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('schedule_entries').select('*', { count: 'exact', head: true }),
      supabase.from('schedule_day_memos').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('schedule_day_memos').select('*', { count: 'exact', head: true }),
      supabase.from('schedule_workers').select('*', { count: 'exact', head: true }),
    ])
    const eMax = (eRow as { updated_at?: string } | null)?.updated_at ?? ''
    const mMax = (mRow as { updated_at?: string } | null)?.updated_at ?? ''
    return `e:${eMax}|ec:${eCount ?? 0}|m:${mMax}|mc:${mCount ?? 0}|w:${wCount ?? 0}`
  } catch (e) {
    console.error('[ScheduleStorage] fetchScheduleRevision error:', e)
    return ''
  }
}

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

    // 直近でリロードされた可能性: sessionStorage に未確定データがあれば優先
    const pending = loadSchedulePending()
    if (pending) {
      sessionStorage.removeItem(PENDING_KEY)
      // ロード完了前のリロード等で「予定0件」の pending が残ると、DB の予定を全削除してしまうため破棄する
      const serverScheduleCount = schedules?.length ?? 0
      if (pending.schedules.length === 0 && serverScheduleCount > 0) {
        console.warn(
          '[ScheduleStorage] 空の pending を破棄しました（サーバーに予定が残っているため上書きしません）'
        )
      } else {
        await saveScheduleData(pending)
        return pending
      }
    }

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
    const keepIds = new Set(data.schedules.map((s) => s.id))
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
    }

    // クライアントに無い ID を削除（.not('id','in',...) の文字列形式は PostgREST で誤動作しうるため in で明示）
    const { data: existingRows, error: selErr } = await supabase.from('schedule_entries').select('id')
    if (selErr) {
      console.error('[ScheduleStorage] schedule_entries select id:', selErr)
      throw selErr
    }
    const toDelete = (existingRows ?? [])
      .map((r: { id: string }) => r.id)
      .filter((id) => !keepIds.has(id))
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase.from('schedule_entries').delete().in('id', toDelete)
      if (delErr) {
        console.error('[ScheduleStorage] schedule_entries delete:', delErr)
        throw delErr
      }
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
