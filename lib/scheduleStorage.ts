// ================================================================
// lib/scheduleStorage.ts
// ストレージ層 — Supabase
// ================================================================
import type { ScheduleData, ScheduleEntry, DayMemos } from '@/types/schedule'
import { createClient } from '@/lib/supabase/client'
import { effectiveWorkerList } from '@/lib/scheduleUtils'
import { mergeCollection } from '@/lib/mergeData'
import { requireCompanyId } from '@/lib/tenant'

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
    const companyId = await requireCompanyId()
    const [
      { data: eRow },
      { count: eCount },
      { data: mRow },
      { count: mCount },
      { count: wCount },
    ] = await Promise.all([
      supabase.from('schedule_entries').select('updated_at').eq('company_id', companyId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('schedule_entries').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
      supabase.from('schedule_day_memos').select('updated_at').eq('company_id', companyId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('schedule_day_memos').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
      supabase.from('schedule_workers').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
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
    const companyId = await requireCompanyId()
    const [
      { data: schedules },
      { data: workers },
      { data: memos },
    ] = await Promise.all([
      supabase.from('schedule_entries').select('*').eq('company_id', companyId).order('date'),
      supabase.from('schedule_workers').select('name, sort_order, left_at').eq('company_id', companyId).order('sort_order'),
      supabase.from('schedule_day_memos').select('date, memo').eq('company_id', companyId),
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
        const merged: ScheduleData = {
          ...pending,
          workers: effectiveWorkerList(pending.workers ?? [], pending.schedules ?? []),
        }
        try {
          await saveScheduleData(merged)
          return merged
        } catch {
          // 閲覧専用などで保存できない場合はサーバーのデータをそのまま使う
        }
      }
    }

    // 初回（テーブル未作成や空）は null を返してサンプルデータ投入を促す
    const hasAny =
      (schedules && schedules.length > 0) ||
      (workers && workers.length > 0) ||
      (memos && memos.length > 0)
    if (!hasAny) return null

    const scheduleRows = (schedules ?? []).map((r: { id: string; date: string; koujimei: string; shift: string; workers: string[]; vehicle_ids?: string[]; memo: string }) => ({
      id: r.id,
      date: r.date,
      koujimei: r.koujimei ?? '',
      shift: r.shift as 'day' | 'night' | 'off',
      workers: r.workers ?? [],
      vehicleIds: r.vehicle_ids ?? [],
      memo: r.memo ?? '',
    }))
    const workerNames = (workers ?? []).map((w: { name: string }) => w.name)
    const workerLeftAt: Record<string, string> = {}
    for (const w of workers ?? []) {
      const row = w as { name: string; left_at?: string | null }
      if (row.left_at) workerLeftAt[row.name] = String(row.left_at).slice(0, 10)
    }
    return {
      schedules: scheduleRows,
      workers: effectiveWorkerList(workerNames, scheduleRows),
      workerLeftAt,
      dayMemos: Object.fromEntries(
        (memos ?? []).map((m: { date: string; memo: string }) => [m.date, m.memo ?? ''])
      ),
    }
  } catch (e) {
    console.error('[ScheduleStorage] load error:', e)
    return null
  }
}

export const VIEWER_FORBIDDEN_MSG = '閲覧専用の権限のため保存できません。管理者に変更権限を依頼してください。'

/**
 * 同時編集対策のための「自分が最後に同期した状態」。
 * 削除はこのベースラインに存在した分にだけ適用し、
 * 他の端末が後から追加した予定・作業員・メモを誤って消さないようにする。
 */
export type ScheduleBaseline = ScheduleData

/** スケジュールの三方マージ（base=最後に同期した状態 / local=自分 / server=サーバー最新） */
export function mergeScheduleData(
  base: ScheduleData,
  local: ScheduleData,
  server: ScheduleData
): ScheduleData {
  // 予定エントリ: ID単位で統合
  const schedules = mergeCollection<ScheduleEntry>(
    base.schedules ?? [],
    local.schedules ?? [],
    server.schedules ?? []
  )

  // 作業員: 追加はどちらの分も残し、削除は「相手が触っていない場合」だけ適用
  const baseW = new Set(base.workers ?? [])
  const localW = new Set(local.workers ?? [])
  const serverW = new Set(server.workers ?? [])
  const workers: string[] = []
  for (const w of [...(local.workers ?? []), ...(server.workers ?? [])]) {
    if (workers.includes(w)) continue
    const inL = localW.has(w)
    const inS = serverW.has(w)
    const inB = baseW.has(w)
    if (inL && inS) workers.push(w)
    else if (inL && !inS) {
      if (!inB) workers.push(w) // 自分が追加
      // inB: サーバー側で削除済み → 適用
    } else if (!inL && inS) {
      if (!inB) workers.push(w) // 相手が追加
      // inB: 自分が削除 → 適用
    }
  }

  // 日次メモ: 日付単位で統合（自分が変更した日は自分優先）
  const dayMemos: DayMemos = {}
  const dates = new Set([
    ...Object.keys(base.dayMemos ?? {}),
    ...Object.keys(local.dayMemos ?? {}),
    ...Object.keys(server.dayMemos ?? {}),
  ])
  for (const d of dates) {
    const b = (base.dayMemos ?? {})[d]
    const l = (local.dayMemos ?? {})[d]
    const s = (server.dayMemos ?? {})[d]
    const v = l !== b ? l : s // 自分が変更（削除含む）していれば自分、そうでなければサーバー
    if (v !== undefined && v !== '') dayMemos[d] = v
  }

  // 退職日: 自分またはサーバーが設定した値を統合（空＝クリア）
  const workerLeftAt: Record<string, string> = {}
  const leftNames = new Set([
    ...Object.keys(base.workerLeftAt ?? {}),
    ...Object.keys(local.workerLeftAt ?? {}),
    ...Object.keys(server.workerLeftAt ?? {}),
  ])
  for (const name of leftNames) {
    if (!workers.includes(name)) continue
    const b = (base.workerLeftAt ?? {})[name]
    const l = (local.workerLeftAt ?? {})[name]
    const s = (server.workerLeftAt ?? {})[name]
    const v = l !== b ? l : s
    if (v) workerLeftAt[name] = v.slice(0, 10)
  }

  return {
    schedules,
    workers: effectiveWorkerList(workers, schedules),
    workerLeftAt,
    dayMemos,
  }
}

export async function saveScheduleData(
  data: ScheduleData,
  baseline?: ScheduleBaseline
): Promise<void> {
  {
    const { canWrite } = await import('@/lib/roles')
    if (!(await canWrite())) throw new Error(VIEWER_FORBIDDEN_MSG)
  }
  try {
    const supabase = createClient()
    const companyId = await requireCompanyId()
    const workersToStore = effectiveWorkerList(data.workers ?? [], data.schedules ?? [])

    // 1. 予定エントリ
    const keepIds = new Set(data.schedules.map((s) => s.id))
    if (data.schedules.length > 0) {
      await supabase.from('schedule_entries').upsert(
        data.schedules.map((s) => ({
          id: s.id,
          company_id: companyId,
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

    // 削除: 自分が知っていた（ベースラインにあった）IDのうち、現在残っていないものだけを消す。
    // 他端末が後から追加した予定は削除対象にしない（同時編集でのデータ消失防止）
    if (baseline) {
      const toDelete = (baseline.schedules ?? [])
        .map((s) => s.id)
        .filter((id) => !keepIds.has(id))
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from('schedule_entries')
          .delete()
          .eq('company_id', companyId)
          .in('id', toDelete)
        if (delErr) {
          console.error('[ScheduleStorage] schedule_entries delete:', delErr)
          throw delErr
        }
      }
    }

    // 2. 作業員マスター: サーバー側の名前と統合してから置換
    //    （他端末が追加した作業員を消さない。削除はベースラインにあった分のみ適用）
    const { data: serverWorkerRows } = await supabase
      .from('schedule_workers')
      .select('name, sort_order, left_at')
      .eq('company_id', companyId)
      .order('sort_order')
    const serverWorkers = (serverWorkerRows ?? []).map((w: { name: string }) => w.name)
    const serverLeftAt: Record<string, string> = {}
    for (const w of serverWorkerRows ?? []) {
      const row = w as { name: string; left_at?: string | null }
      if (row.left_at) serverLeftAt[row.name] = String(row.left_at).slice(0, 10)
    }
    const removedByMe = new Set(
      baseline ? (baseline.workers ?? []).filter((w) => !workersToStore.includes(w)) : []
    )
    const finalWorkers = [...workersToStore]
    for (const w of serverWorkers) {
      if (!finalWorkers.includes(w) && !removedByMe.has(w)) finalWorkers.push(w)
    }
    const leftAtMap: Record<string, string> = {}
    const localNames = new Set(workersToStore)
    for (const name of finalWorkers) {
      if (localNames.has(name)) {
        const v = (data.workerLeftAt ?? {})[name]
        if (v) leftAtMap[name] = v.slice(0, 10)
      } else if (serverLeftAt[name]) {
        leftAtMap[name] = serverLeftAt[name]
      }
    }
    await supabase.from('schedule_workers').delete().eq('company_id', companyId)
    if (finalWorkers.length > 0) {
      await supabase.from('schedule_workers').insert(
        finalWorkers.map((name, i) => ({
          name,
          sort_order: i,
          company_id: companyId,
          left_at: leftAtMap[name] ?? null,
        }))
      )
    }

    // 3. 日次メモ
    const memoRows = Object.entries(data.dayMemos).map(([date, memo]) => ({
      date,
      memo: memo ?? '',
      company_id: companyId,
    }))
    if (memoRows.length > 0) {
      await supabase.from('schedule_day_memos').upsert(memoRows, { onConflict: 'company_id,date' })
    }

    // 削除されたメモ: ベースラインにあった日付のうち現在無いものだけを消す
    if (baseline) {
      const currentDates = new Set(Object.keys(data.dayMemos))
      const memoDatesToDelete = Object.keys(baseline.dayMemos ?? {}).filter(
        (d) => !currentDates.has(d)
      )
      if (memoDatesToDelete.length > 0) {
        await supabase
          .from('schedule_day_memos')
          .delete()
          .eq('company_id', companyId)
          .in('date', memoDatesToDelete)
      }
    }

    // 終了済み日の予定を案件の人工・車両へ自動転記（非同期・失敗しても保存は成功扱い）
    void triggerScheduleLaborSync()
  } catch (e) {
    console.error('[ScheduleStorage] save error:', e)
    throw e
  }
}

async function triggerScheduleLaborSync(): Promise<void> {
  try {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) return
    await fetch('/api/schedule/sync-labor', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
  } catch (e) {
    console.warn('[ScheduleStorage] labor sync skipped:', e)
  }
}
