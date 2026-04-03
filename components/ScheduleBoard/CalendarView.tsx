'use client'
// ================================================================
// components/ScheduleBoard/CalendarView.tsx
// 前半/後半 2列カレンダー
// ================================================================
import React from 'react'
import type { ScheduleEntry, DayMemos } from '@/types/schedule'
import type { Vehicle, Project } from '@/lib/utils'
import {
  daysInMonth, DOW_LABELS, TODAY_STR, addDays,
  getConflicts, getVehicleConflicts, getAvailableWorkers, getOffWorkers, getMorningEntries,
  getBaseKoujimei,
  workerColor, hexRgba,
} from '@/lib/scheduleUtils'
import { ShiftBadge, WorkerRow, OffWorkerRow, VehicleRow, Pip } from './Chips'
import { DayMemoField } from './DayMemoField'

interface Props {
  year: number
  month: number
  schedules: ScheduleEntry[]
  workers: string[]
  vehicles: Vehicle[]
  /** 案件管理から連携する案件（未アーカイブ）。その日に予定が無い案件を「未配置」に出す */
  projects: Project[]
  dayMemos: DayMemos
  filterWorker: string | null
  onFilterWorker: (w: string) => void
  onClickEntry: (entry: ScheduleEntry) => void
  onAddEntry: (date: string) => void
  onDayMemoChange: (date: string, value: string) => void
}

// 1つの日付行
interface DayRowProps extends Omit<Props, 'year'|'month'> {
  dateStr: string
}
const DayRow: React.FC<DayRowProps> = ({
  dateStr, schedules, workers, vehicles, projects, dayMemos,
  filterWorker, onFilterWorker, onClickEntry, onAddEntry, onDayMemoChange,
}) => {
  const vehicleMap = React.useMemo(() => new Map(vehicles.map(v => [v.id, v.registration])), [vehicles])
  const vcf        = getVehicleConflicts(dateStr, schedules)
  const dow        = new Date(dateStr).getDay()
  const isSun       = dow === 0
  const isSat       = dow === 6
  const isToday     = dateStr === TODAY_STR
  const d           = parseInt(dateStr.split('-')[2], 10)
  const cf          = getConflicts(dateStr, schedules)
  const avail       = getAvailableWorkers(dateStr, schedules, workers)
  const offWs       = [...getOffWorkers(dateStr, schedules)]
  const morningEs   = getMorningEntries(dateStr, schedules)
  const dayMemo     = dayMemos[dateStr] ?? ''

  const filter = (e: ScheduleEntry) => !filterWorker || e.workers.includes(filterWorker)
  const dayE   = schedules.filter(s => s.date === dateStr && s.shift === 'day').filter(filter)
  const nightE = schedules.filter(s => s.date === dateStr && s.shift === 'night').filter(filter)
  const offE   = schedules.filter(s => s.date === dateStr && s.shift === 'off').filter(filter)

  // 作業員フィルタとは別：その日に工事名が一度でも載っているか（未配置リスト用・全員分）
  const scheduledProjectBases = React.useMemo(() => {
    const bases = new Set<string>()
    const dayAll = schedules.filter(s => s.date === dateStr && s.shift === 'day')
    const nightAll = schedules.filter(s => s.date === dateStr && s.shift === 'night')
    const morningAll = getMorningEntries(dateStr, schedules)
    for (const e of [...dayAll, ...nightAll, ...morningAll]) {
      const b = getBaseKoujimei(e.koujimei)
      if (b && b !== '有休') bases.add(b)
    }
    return bases
  }, [dateStr, schedules])

  const unscheduledProjects = React.useMemo(() => {
    const candidates = projects.filter(p => !p.archived && !p.deleted)
    const missing = candidates.filter(p => !scheduledProjectBases.has(p.name))
    return missing.sort((a, b) => {
      const ma = a.managementNumber ?? ''
      const mb = b.managementNumber ?? ''
      if (ma !== mb) return ma.localeCompare(mb, 'ja')
      return a.name.localeCompare(b.name, 'ja')
    })
  }, [projects, scheduledProjectBases])

  const hasContent      = dayE.length || nightE.length || morningEs.length || offE.length
  const hasOffConflict  = offWs.some(w => cf.has(w))

  // 行背景
  const rowBg  = isToday ? '#fffcf5' : isSun ? '#fffafa' : isSat ? '#f8faff' : '#fff'
  const dateBg = isToday ? '#fff5e0' : isSun ? '#fff0f0' : isSat ? '#eef3ff' : '#fff'

  return (
    <tr style={{ background: rowBg }}>
      {/* 日付セル */}
      <td style={{
        background: dateBg, padding: '5px 6px', width: 72, minWidth: 72,
        borderBottom: '1px solid #d0d8e4', borderRight: '1px solid #d0d8e4',
        verticalAlign: 'top',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'IBM Plex Mono,monospace', color: '#1a2535' }}>{d}</span>
        <span style={{ fontSize: 10, marginLeft: 2, fontWeight: 600, color: isSun ? '#c62828' : isSat ? '#1565c0' : '#4a6280' }}>
          ({DOW_LABELS[dow]})
        </span>
        {isToday && <><br /><span style={{ display:'inline-block', background:'#e65c00', color:'#fff', fontSize:8, padding:'1px 4px', borderRadius:2, fontWeight:700, marginTop:2 }}>TODAY</span></>}
        {cf.size > 0 && <><br /><Pip bg="#fff5f5" color="#c62828" border="#ffcdd2">! 重複</Pip></>}
        {morningEs.length > 0 && <><br /><Pip bg="#f3e5f5" color="#4a148c" border="#ce93d8">☀ 明け</Pip></>}
        {offE.length > 0 && (
          <><br /><Pip bg={hasOffConflict ? '#fff5f5' : '#eceff1'} color={hasOffConflict ? '#c62828' : '#546e7a'} border={hasOffConflict ? '#ffcdd2' : '#b0bec5'}>
            🏖{hasOffConflict ? '!' : ''}有休
          </Pip></>
        )}
        {dayMemo && <><br /><Pip bg="#fdf6f0" color="#795548" border="#d7b89a">📝</Pip></>}
      </td>

      {/* コンテンツセル */}
      <td style={{ borderBottom: '1px solid #d0d8e4', verticalAlign: 'top', padding: 0 }}>
        <div style={{ padding: '3px 5px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* 夜勤明け（前日夜勤の翌日表示） */}
          {morningEs.map(e => (
            <div key={e.id} style={{
              borderRadius: 3, padding: '3px 6px', marginBottom: 2,
              borderLeft: '3px solid #4a148c', background: '#f3e5f5', opacity: 0.88,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
                <ShiftBadge type="morning" />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#4a148c' }}>{e.koujimei}</span>
                {e.memo && <span style={{ fontSize: 9, color: '#4a6280', opacity: 0.85 }}>— {e.memo}</span>}
              </div>
              <WorkerRow workers={e.workers} conflicts={new Set()} />
              <VehicleRow vehicleIds={e.vehicleIds ?? []} vehicleMap={vehicleMap} conflicts={vcf} />
            </div>
          ))}

          {/* 昼勤 */}
          {dayE.map(e => {
            const fc = workerColor(e.workers[0] ?? '')
            return (
              <div key={e.id}
                onClick={() => onClickEntry(e)}
                style={{ borderRadius: 3, padding: '3px 6px', marginBottom: 2, cursor: 'pointer',
                  borderLeft: `3px solid ${fc}`, background: hexRgba(fc, 0.05) }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#1a2535', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{e.koujimei}</span>
                  {e.memo && <span style={{ fontSize: 9, color: '#4a6280', opacity: 0.85 }}>— {e.memo}</span>}
                </div>
                <WorkerRow workers={e.workers} conflicts={cf} onClickWorker={onFilterWorker} />
                <VehicleRow vehicleIds={e.vehicleIds ?? []} vehicleMap={vehicleMap} conflicts={vcf} />
              </div>
            )
          })}

          {/* 夜勤 */}
          {nightE.map(e => (
            <div key={e.id}
              onClick={() => onClickEntry(e)}
              style={{ borderRadius: 3, padding: '3px 6px', marginBottom: 2, cursor: 'pointer',
                borderLeft: '3px solid #1a237e', background: '#e8eaf6' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
                <ShiftBadge type="night" />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#1a237e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{e.koujimei}</span>
                {e.memo && <span style={{ fontSize: 9, color: '#4a6280', opacity: 0.85 }}>— {e.memo}</span>}
              </div>
              <WorkerRow workers={e.workers} conflicts={cf} isNight onClickWorker={onFilterWorker} />
              <VehicleRow vehicleIds={e.vehicleIds ?? []} vehicleMap={vehicleMap} conflicts={vcf} />
            </div>
          ))}

          {/* 有休 */}
          {offE.map(e => (
            <div key={e.id}
              onClick={() => onClickEntry(e)}
              style={{ borderRadius: 3, padding: '3px 6px', marginBottom: 2, cursor: 'pointer',
                borderLeft: '3px solid #546e7a', background: '#eceff1' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
                <ShiftBadge type="off" />
                {e.memo && <span style={{ fontSize: 9, color: '#4a6280', opacity: 0.85 }}>— {e.memo}</span>}
              </div>
              <OffWorkerRow workers={e.workers} conflicts={cf} />
            </div>
          ))}

          {/* ＋ボタン（ホバーで表示） */}
          <button
            onClick={() => onAddEntry(dateStr)}
            className="schedule-add-btn"
            style={{ fontSize: 9, padding: '1px 6px', margin: '2px 0', border: '1px solid #d0d8e4',
              borderRadius: 4, background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
              alignSelf: 'flex-start', opacity: 0, transition: 'opacity .15s' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
          >
            ＋ 予定追加
          </button>
        </div>

        {/* 空きメンバーバー */}
        {!!hasContent && avail.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 3, padding: '3px 5px 4px',
            borderTop: '1px dashed #c8e6c9', background: '#f1f8f1' }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: '#2e7d32', whiteSpace: 'nowrap', paddingTop: 2, minWidth: 22 }}>空き</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {avail.map(w => {
                const c = workerColor(w)
                return (
                  <span key={w} onClick={() => onFilterWorker(w)} style={{
                    display: 'inline-block', padding: '1px 5px', borderRadius: 3,
                    fontSize: 9, fontWeight: 600, cursor: 'pointer',
                    background: hexRgba(c, 0.08), color: c, border: `1px solid ${hexRgba(c, 0.25)}`,
                  }}>
                    {w}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* その日まだスケジュールに載っていない案件（案件管理の案件名と工事名の一致で判定） */}
        {unscheduledProjects.length > 0 && (
          <div style={{
            borderTop: '1px dashed #ffcc80',
            background: 'linear-gradient(180deg, #fffbf5 0%, #fff8f0 100%)',
            padding: '4px 5px 2px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: '#e65100', letterSpacing: 0.02 }}>未配置案件</span>
              <span style={{ fontSize: 8, color: '#94a3b8', fontFamily: 'IBM Plex Mono,monospace' }}>{unscheduledProjects.length}件</span>
            </div>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 3,
              maxHeight: 88, overflowY: 'auto', paddingBottom: 2,
              scrollbarWidth: 'thin',
            }}>
              {unscheduledProjects.map(p => (
                <span
                  key={p.id}
                  title={`${p.managementNumber ? `${p.managementNumber} ` : ''}${p.name}`}
                  style={{
                    display: 'inline-block', maxWidth: 148,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                    color: '#bf360c', background: '#fff3e0', border: '1px solid #ffcc80',
                  }}
                >
                  {p.managementNumber && (
                    <span style={{ fontFamily: 'IBM Plex Mono,monospace', fontSize: 8, color: '#94a3b8', marginRight: 4 }}>
                      {p.managementNumber}
                    </span>
                  )}
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 日次メモ */}
        <div style={{ borderTop: '1px solid #d0d8e4' }}>
          <DayMemoField date={dateStr} value={dayMemo} onChange={onDayMemoChange} />
        </div>
      </td>
    </tr>
  )
}

// 半月テーブル
const HalfTable: React.FC<Props & { from: number; to: number; label: string }> = ({
  year, month, from, to, label, ...rest
}) => {
  const dates: string[] = []
  for (let d = from; d <= to; d++) {
    dates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return (
    <div style={{ border: '1px solid #d0d8e4', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
      <div style={{ background: '#eef1f6', borderBottom: '1px solid #d0d8e4', padding: '6px 10px',
        fontSize: 12, fontWeight: 700, color: '#4a6280', display: 'flex', alignItems: 'center', gap: 6 }}>
        {label.split(' ')[0]}
        {' '}
        <span style={{ color: '#e65c00', fontFamily: 'IBM Plex Mono,monospace' }}>{label.split(' ')[1]}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ background: '#eef1f6', padding: '5px 6px', fontSize: 10, fontWeight: 700,
              color: '#4a6280', borderBottom: '1px solid #d0d8e4', borderRight: '1px solid #d0d8e4',
              width: 72, textAlign: 'center' }}>日付</th>
            <th style={{ background: '#eef1f6', padding: '5px 8px', fontSize: 10, fontWeight: 700,
              color: '#4a6280', borderBottom: '1px solid #d0d8e4', textAlign: 'left' }}>工事・作業員 / メモ</th>
          </tr>
        </thead>
        <tbody>
          {dates.map(ds => <DayRow key={ds} dateStr={ds} {...rest} />)}
        </tbody>
      </table>
    </div>
  )
}

// メインカレンダー
export const CalendarView: React.FC<Props> = (props) => {
  const { year, month } = props
  const days = daysInMonth(year, month)

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#e65c00', fontFamily: 'IBM Plex Mono,monospace' }}>
          {year}年{month + 1}月
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, minWidth: 700 }}>
        <HalfTable {...props} from={1} to={Math.min(15, days)} label={`前半 1〜${Math.min(15, days)}日`} />
        {days > 15 && <HalfTable {...props} from={16} to={days} label={`後半 16〜${days}日`} />}
      </div>
    </>
  )
}
