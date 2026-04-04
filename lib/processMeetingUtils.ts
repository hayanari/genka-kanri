/** 工程会議ボード：1か月を3区間（10日単位）に分割 */

export type MonthPeriod = {
  label: string
  start: string
  end: string
}

export function monthPeriods(year: number, monthIndex: number): MonthPeriod[] {
  const last = new Date(year, monthIndex + 1, 0).getDate()
  const ym = `${year}-${String(monthIndex + 1).padStart(2, "0")}`
  return [
    { label: "1〜10日", start: `${ym}-01`, end: `${ym}-10` },
    { label: "11〜20日", start: `${ym}-11`, end: `${ym}-20` },
    {
      label: `21〜${last}日`,
      start: `${ym}-21`,
      end: `${ym}-${String(last).padStart(2, "0")}`,
    },
  ]
}

/** 開始月から連続する年月（年またぎ可） */
export function monthSequence(
  startYear: number,
  startMonthIndex: number,
  monthCount: number
): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = []
  let y = startYear
  let m = startMonthIndex
  for (let i = 0; i < monthCount; i++) {
    out.push({ year: y, month: m })
    m += 1
    if (m > 11) {
      m = 0
      y += 1
    }
  }
  return out
}

/**
 * 複数月分の10日区間を横軸用に結合（1か月なら従来と同じ3列）
 * 複数月時はラベルに「n月」を付与して識別しやすくする
 */
export function periodsForMonthRange(
  startYear: number,
  startMonthIndex: number,
  monthCount: number
): MonthPeriod[] {
  const seq = monthSequence(startYear, startMonthIndex, monthCount)
  const multi = monthCount > 1
  return seq.flatMap(({ year, month }) => {
    const base = monthPeriods(year, month)
    if (!multi) return base
    const mn = month + 1
    return base.map((p) => ({
      ...p,
      label: `${mn}月 ${p.label}`,
    }))
  })
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function daysInclusive(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1
}

/** 各区間に占める割合 0〜1（帯グラフ用） */
export function fillRatesForRange(
  periods: MonthPeriod[],
  rangeStart: string | null,
  rangeEnd: string | null
): number[] {
  if (!rangeStart || !rangeEnd) return periods.map(() => 0)
  const rs = parseYmd(rangeStart)
  const re = parseYmd(rangeEnd)
  if (rs > re) return periods.map(() => 0)
  return periods.map((p) => {
    const ps = parseYmd(p.start)
    const pe = parseYmd(p.end)
    const os = rs > ps ? rs : ps
    const oe = re < pe ? re : pe
    if (os > oe) return 0
    const overlap = daysInclusive(os, oe)
    const total = daysInclusive(ps, pe)
    return total > 0 ? Math.min(1, overlap / total) : 0
  })
}

export function isConstructionProject(p: { category: string; archived?: boolean; deleted?: boolean }): boolean {
  return p.category === "工事" && !p.archived && !p.deleted
}

/** 予定終了と実施終了の比較（会議向けハイライト用） */
export type ProcessVarianceKind = "delay" | "early" | "ok" | "overdue" | "unknown"

export function getProcessRowVariance(row: {
  plannedEnd: string | null
  actualEnd: string | null
}): { kind: ProcessVarianceKind; label: string } {
  const { plannedEnd, actualEnd } = row
  if (!plannedEnd && !actualEnd) return { kind: "unknown", label: "" }

  const parse = (s: string) => {
    const [y, m, d] = s.split("-").map(Number)
    return new Date(y, m - 1, d)
  }
  const dayDiff = (a: Date, b: Date) =>
    Math.round((b.getTime() - a.getTime()) / 86400000)

  if (plannedEnd && actualEnd) {
    const p = parse(plannedEnd)
    const a = parse(actualEnd)
    if (a > p) return { kind: "delay", label: `遅れ ${dayDiff(p, a)}日` }
    if (a < p) return { kind: "early", label: `前倒し ${dayDiff(a, p)}日` }
    return { kind: "ok", label: "順調" }
  }
  if (plannedEnd && !actualEnd) {
    const p = parse(plannedEnd)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (today > p) return { kind: "overdue", label: "実施終了未入力（予定超過）" }
  }
  return { kind: "unknown", label: "" }
}
