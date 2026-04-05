'use client'
// ================================================================
// components/ScheduleBoard/OtherViews.tsx
// 一覧ビュー / 作業員ビュー / マスタービュー
// ================================================================
import React, { useState } from 'react'
import type { ScheduleEntry, DayMemos } from '@/types/schedule'
import type { Vehicle } from '@/lib/utils'
import {
  TODAY_STR, DOW_LABELS, getConflicts, getVehicleConflicts, workerColor,
} from '@/lib/scheduleUtils'
import { ShiftBadge, WChip, WorkerRow, OffWorkerRow, VehicleRow } from './Chips'

// ── 共通スタイル ─────────────────────────────────────────────────
const sepStyle: React.CSSProperties = {
  fontSize: 11, color: '#4a6280', fontFamily: 'IBM Plex Mono,monospace',
  marginTop: 8, padding: '0 2px', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600,
}

// ================================================================
// 一覧ビュー
// ================================================================
interface ListViewProps {
  schedules: ScheduleEntry[]
  vehicles: Vehicle[]
  dayMemos: DayMemos
  filterWorker: string | null
  searchText: string
  onClickEntry: (e: ScheduleEntry) => void
  onDeleteEntry: (id: string) => void
}
export const ListView: React.FC<ListViewProps> = ({
  schedules, vehicles, dayMemos, filterWorker, searchText, onClickEntry, onDeleteEntry,
}) => {
  const vehicleMap = React.useMemo(() => new Map(vehicles.map(v => [v.id, v.registration])), [vehicles])
  let filtered = schedules
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || (a.shift === 'off' ? 1 : a.shift === 'night' ? 0 : -1))
  if (filterWorker) filtered = filtered.filter(e => e.workers.includes(filterWorker))
  if (searchText) {
    const q = searchText.toLowerCase()
    filtered = filtered.filter(e =>
      e.koujimei.toLowerCase().includes(q) ||
      e.workers.join('').toLowerCase().includes(q) ||
      (e.vehicleIds ?? []).some(id => vehicleMap.get(id)?.toLowerCase().includes(q))
    )
  }

  if (!filtered.length) return <p style={{ textAlign: 'center', padding: 40, color: '#8aa0b8', fontSize: 12 }}>予定がありません</p>

  let lastDate = ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {filtered.map(e => {
        const cf = getConflicts(e.date, schedules)
        const isOff = e.shift === 'off', isNight = e.shift === 'night'
        const pc = isOff ? '#546e7a' : isNight ? '#1a237e' : workerColor(e.workers[0] ?? '')
        const dm = dayMemos[e.date]
        const sep = e.date !== lastDate
        lastDate = e.date
        const d = new Date(e.date)

        return (
          <React.Fragment key={e.id}>
            {sep && (
              <div style={sepStyle}>
                {e.date}（{DOW_LABELS[d.getDay()]}）
                {e.date === TODAY_STR && <span style={{ background:'#e65c00', color:'#fff', fontSize:8, padding:'1px 4px', borderRadius:2, fontWeight:700 }}>TODAY</span>}
                {dm && <span style={{ fontSize: 10, color: '#795548', marginLeft: 4 }}>📝 {dm}</span>}
                <span style={{ flex: 1, height: 1, background: '#d0d8e4', display: 'inline-block' }} />
              </div>
            )}
            <div style={{
              background: isNight ? '#e8eaf6' : isOff ? '#eceff1' : '#fff',
              border: '1px solid #d0d8e4', borderRadius: 6,
              padding: '7px 12px', display: 'flex', alignItems: 'flex-start', gap: 10,
              borderLeft: `3px solid ${pc}`,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                  {isNight && <ShiftBadge type="night" />}
                  {isOff   && <ShiftBadge type="off" />}
                  {!isOff && <span style={{ fontSize: 13, fontWeight: 700, color: isNight ? '#1a237e' : '#1a2535' }}>{e.koujimei}</span>}
                  {e.memo && <span style={{ fontSize: 11, color: '#4a6280' }}>— {e.memo}</span>}
                </div>
                <div style={{ marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 3, flexDirection: 'column', alignItems: 'flex-start' }}>
                  {isOff
                    ? <OffWorkerRow workers={e.workers} conflicts={cf} />
                    : <WorkerRow workers={e.workers} conflicts={cf} isNight={isNight} />
                  }
                  <VehicleRow vehicleIds={e.vehicleIds ?? []} vehicleMap={vehicleMap} conflicts={getVehicleConflicts(e.date, schedules)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <IconBtn onClick={() => onClickEntry(e)}>✎</IconBtn>
                <IconBtn danger onClick={() => { if (confirm('削除しますか？')) onDeleteEntry(e.id) }}>✕</IconBtn>
              </div>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ================================================================
// 作業員ビュー
// ================================================================
interface WorkerViewProps {
  workers: string[]
  schedules: ScheduleEntry[]
  vehicles: Vehicle[]
  selectedWorker: string | null
  onSelect: (w: string) => void
  onBack: () => void
}
export const WorkerView: React.FC<WorkerViewProps> = ({
  workers, schedules, vehicles, selectedWorker, onSelect, onBack,
}) => {
  const vehicleMap = React.useMemo(() => new Map(vehicles.map(v => [v.id, v.registration])), [vehicles])
  if (selectedWorker) {
    const w = selectedWorker
    const c = workerColor(w)
    const entries = schedules.filter(e => e.workers.includes(w)).sort((a, b) => a.date.localeCompare(b.date))
    let lastDate2 = ''
    return (
      <div>
        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: c }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{w}</div>
            <div style={{ fontSize: 11, color: '#4a6280' }}>登録 {entries.length} 件</div>
          </div>
        </div>
        {entries.map(e => {
          const sep = e.date !== lastDate2; lastDate2 = e.date
          const isN = e.shift === 'night', isO = e.shift === 'off'
          const ic  = getConflicts(e.date, schedules).has(w)
          const lc  = isO ? '#546e7a' : isN ? '#1a237e' : c
          const d2  = new Date(e.date)
          return (
            <React.Fragment key={e.id}>
              {sep && (
                <div style={{ fontSize: 10, color: '#8aa0b8', margin: '8px 0 2px', fontFamily: 'IBM Plex Mono,monospace' }}>
                  {e.date}（{DOW_LABELS[d2.getDay()]}）
                </div>
              )}
              <div style={{
                background: ic ? '#fff5f5' : isN ? '#e8eaf6' : isO ? '#eceff1' : '#fff',
                border: '1px solid #d0d8e4', borderLeft: `3px solid ${lc}`,
                borderRadius: 4, padding: '6px 10px', marginBottom: 4,
              }}>
                {ic && <div style={{ fontSize: 10, color: '#c62828', fontWeight: 700, marginBottom: 2 }}>! {isO ? '有休中なのに仕事あり' : '同日重複'}</div>}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
                  {isN && <ShiftBadge type="night" />}
                  {isO && <ShiftBadge type="off" />}
                  {!isO && <span style={{ fontSize: 12, fontWeight: 700, color: lc }}>{e.koujimei}</span>}
                  {e.memo && <span style={{ fontSize: 10, color: '#4a6280' }}>— {e.memo}</span>}
                </div>
                {!isO && (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 3 }}>
                      {e.workers.filter(x => x !== w).map(x => (
                        <WChip key={x} name={x} isConflict={false} isNight={isN} />
                      ))}
                    </div>
                    <VehicleRow vehicleIds={e.vehicleIds ?? []} vehicleMap={vehicleMap} conflicts={getVehicleConflicts(e.date, schedules)} />
                  </>
                )}
              </div>
            </React.Fragment>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
      {workers.map(w => {
        const c       = workerColor(w)
        const total   = schedules.filter(e => e.workers.includes(w) && e.shift !== 'off').length
        const offCnt  = schedules.filter(e => e.workers.includes(w) && e.shift === 'off').length
        const hc      = schedules.filter(e => e.workers.includes(w)).some(e => getConflicts(e.date, schedules).has(w))
        return (
          <div key={w} onClick={() => onSelect(w)} style={{
            background: '#fff', border: '1px solid #d0d8e4', borderRadius: 6,
            padding: '10px 12px', cursor: 'pointer', transition: 'box-shadow .15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.1)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: c, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: c }}>{w}</span>
              {hc && <span style={{ fontSize: 10, fontWeight: 700, color: '#c62828', background: '#fff5f5', border: '1px solid #ffcdd2', padding: '0 4px', borderRadius: 2 }}>!</span>}
            </div>
            <div style={{ fontSize: 10, color: '#4a6280', marginTop: 4 }}>
              稼働 {total}件
              {offCnt > 0 && <span style={{ color: '#546e7a', marginLeft: 4 }}>有休 {offCnt}日</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ================================================================
// マスタービュー
// ================================================================
interface MasterViewProps {
  workers: string[]
  schedules: ScheduleEntry[]
  workerContacts: Record<string, string>
  onAdd: (name: string) => void
  onRemove: (name: string) => void
  onRename: (oldName: string, newName: string) => Promise<boolean>
  onSaveContact: (name: string, email: string) => void
  onTestTeams?: () => void
}
export const MasterView: React.FC<MasterViewProps> = ({ workers, schedules, workerContacts, onAdd, onRemove, onRename, onSaveContact, onTestTeams }) => {
  const [name, setName] = useState('')
  const [editingEmail, setEditingEmail] = useState<Record<string, string>>({})
  const [editingDisplayName, setEditingDisplayName] = useState<Record<string, string>>({})
  const [testLoading, setTestLoading] = useState(false)
  const add = () => { onAdd(name.trim()); setName('') }
  const handleTest = () => {
    if (!onTestTeams) return
    setTestLoading(true)
    onTestTeams()
    setTimeout(() => setTestLoading(false), 2000)
  }
  return (
    <div>
      <p style={{ fontSize: 11, color: '#4a6280', marginBottom: 12 }}>
        表示名・メールアドレスを編集できます。メールを登録すると、スケジュール変更時にTeamsチャネルへ通知されます。
      </p>
      {onTestTeams && (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={handleTest}
            disabled={testLoading}
            style={{
              padding: '6px 14px', borderRadius: 4, border: '1px solid #4a90d9',
              background: testLoading ? '#eef1f6' : '#fff', color: '#4a90d9',
              cursor: testLoading ? 'wait' : 'pointer', fontSize: 11, fontWeight: 600,
            }}
          >
            {testLoading ? '送信中...' : '🔔 Teams テスト送信'}
          </button>
          <span style={{ marginLeft: 8, fontSize: 10, color: '#8aa0b8' }}>チャネルに届くか確認</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder="氏名を入力して追加"
          style={{ padding: '7px 10px', border: '1px solid #d0d8e4', borderRadius: 4, fontSize: 12, flex: 1, maxWidth: 240 }}
        />
        <button onClick={add} style={{ padding: '5px 14px', borderRadius: 4, border: 'none', background: '#e65c00', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700 }}>
          ＋ 追加
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {workers.map(w => {
          const c   = workerColor(w)
          const cnt = schedules.filter(e => e.workers.includes(w) && e.shift !== 'off').length
          const email = editingEmail[w] ?? workerContacts[w] ?? ''
          const displayName = editingDisplayName[w] ?? w
          const commitDisplayName = async () => {
            const next = displayName.trim()
            if (!next) {
              setEditingDisplayName(prev => { const p = { ...prev }; delete p[w]; return p })
              return
            }
            if (next === w) {
              setEditingDisplayName(prev => { const p = { ...prev }; delete p[w]; return p })
              return
            }
            const ok = await onRename(w, next)
            if (ok) {
              setEditingDisplayName(prev => { const p = { ...prev }; delete p[w]; return p })
              setEditingEmail(prev => { const p = { ...prev }; delete p[w]; return p })
            }
          }
          return (
            <div key={w} style={{ background: '#fff', border: '1px solid #d0d8e4', borderRadius: 6, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: c, flexShrink: 0 }} />
                <input
                  type="text"
                  aria-label={`${w} の表示名`}
                  value={displayName}
                  onChange={e => setEditingDisplayName(prev => ({ ...prev, [w]: e.target.value }))}
                  onBlur={() => void commitDisplayName()}
                  onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
                  style={{
                    flex: 1, minWidth: 0, maxWidth: 200, padding: '6px 8px', border: '1px solid #d0d8e4', borderRadius: 4,
                    fontSize: 14, fontWeight: 700, color: c, fontFamily: 'inherit',
                  }}
                />
                <span style={{ fontSize: 11, color: '#4a6280', flexShrink: 0 }}>稼働 {cnt}件</span>
                <IconBtn danger onClick={() => onRemove(w)}>✕</IconBtn>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="email"
                  placeholder="通知用メールアドレス"
                  value={email}
                  onChange={e => setEditingEmail(prev => ({ ...prev, [w]: e.target.value }))}
                  onBlur={() => email !== (workerContacts[w] ?? '') && onSaveContact(w, email)}
                  style={{ padding: '5px 8px', border: '1px solid #d0d8e4', borderRadius: 4, fontSize: 11, flex: 1, maxWidth: 260 }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 共通アイコンボタン ────────────────────────────────────────────
const IconBtn: React.FC<{ danger?: boolean; onClick: () => void; children: React.ReactNode }> = ({ danger, onClick, children }) => (
  <button onClick={onClick} style={{
    width: 26, height: 26, borderRadius: 4,
    border: '1px solid #d0d8e4', background: '#fff',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, color: danger ? '#c62828' : '#4a6280',
  }}>
    {children}
  </button>
)
