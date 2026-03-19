/**
 * スケジュール変更の検知と通知トリガー
 */
import type { ScheduleEntry } from '@/types/schedule'

export type ChangeItem = {
  workerName: string
  date: string
  message: string
}

/**
 * prev と next の差分から、影響を受ける作業員と変更内容を算出
 */
export function computeScheduleChanges(
  prev: ScheduleEntry[],
  next: ScheduleEntry[]
): ChangeItem[] {
  const prevMap = new Map(prev.map((e) => [e.id, e]))
  const nextMap = new Map(next.map((e) => [e.id, e]))
  const changes: ChangeItem[] = []

  const allIds = new Set([...prevMap.keys(), ...nextMap.keys()])
  for (const id of allIds) {
    const oldE = prevMap.get(id)
    const newE = nextMap.get(id)

    if (!oldE && newE) {
      // 追加
      const workers = newE.shift !== 'off' ? newE.workers : []
      const msg = `${newE.koujimei} にアサインされました`
      for (const w of workers) {
        changes.push({ workerName: w, date: newE.date, message: msg })
      }
    } else if (oldE && !newE) {
      // 削除
      const workers = oldE.shift !== 'off' ? oldE.workers : []
      const msg = `${oldE.koujimei} の予定が削除されました`
      for (const w of workers) {
        changes.push({ workerName: w, date: oldE.date, message: msg })
      }
    } else if (oldE && newE) {
      // 変更
      const workersOld = new Set(oldE.shift !== 'off' ? oldE.workers : [])
      const workersNew = new Set(newE.shift !== 'off' ? newE.workers : [])
      const affected = new Set([...workersOld, ...workersNew])

      const kChanged = oldE.koujimei !== newE.koujimei
      const dChanged = oldE.date !== newE.date
      const wChanged =
        [...workersOld].sort().join(',') !== [...workersNew].sort().join(',')

      if (!kChanged && !dChanged && !wChanged) continue

      let msg = ''
      if (kChanged && dChanged) {
        msg = `${oldE.koujimei}（${oldE.date}）→ ${newE.koujimei}（${newE.date}）に変更`
      } else if (kChanged) {
        msg = `${oldE.koujimei} → ${newE.koujimei} に変更`
      } else if (dChanged) {
        msg = `${newE.koujimei} の日付が ${oldE.date} → ${newE.date} に変更`
      } else if (wChanged) {
        msg = `${newE.koujimei}（${newE.date}）の作業員が変更されました`
      }

      for (const w of affected) {
        changes.push({ workerName: w, date: newE.date, message: msg })
      }
    }
  }
  return changes
}

/**
 * 変更を同一作業員ごとにまとめる
 */
export function groupChangesByWorker(items: ChangeItem[]): Map<string, ChangeItem[]> {
  const byWorker = new Map<string, ChangeItem[]>()
  for (const c of items) {
    const list = byWorker.get(c.workerName) ?? []
    list.push(c)
    byWorker.set(c.workerName, list)
  }
  return byWorker
}
