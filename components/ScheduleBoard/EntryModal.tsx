'use client'
// ================================================================
// components/ScheduleBoard/EntryModal.tsx
// 予定追加・編集モーダル
// ================================================================
import React, { useState, useMemo } from 'react'
import type { ScheduleEntry, Shift } from '@/types/schedule'
import type { Project, Vehicle } from '@/lib/utils'
import { genId, getBaseKoujimei, workerColor, hexRgba } from '@/lib/scheduleUtils'

const OTHER_ID = '__other__'

interface Props {
  /** 編集時は既存エントリ、新規時は { date } だけ必須 */
  entry: Partial<ScheduleEntry> & { date: string }
  workers: string[]
  projects: Project[]
  vehicles: Vehicle[]
  isEdit: boolean
  onSave: (entry: ScheduleEntry) => void
  onDelete?: () => void
  onClose: () => void
}

const SHIFT_LABELS: Record<Shift, string> = { day: '☀ 昼勤', night: '🌙 夜勤', off: '🏖 有休' }
const SHIFT_ACTIVE: Record<Shift, { bg: string; color: string }> = {
  day:   { bg: '#fff3e0', color: '#e65c00' },
  night: { bg: '#e8eaf6', color: '#1a237e' },
  off:   { bg: '#eceff1', color: '#546e7a' },
}
const SHIFT_HINT: Record<Shift, string | null> = {
  day:   null,
  night: '翌日に「夜勤明け」として自動表示されます',
  off:   '有休メンバーはその日の「空き」から除外されます',
}

export const EntryModal: React.FC<Props> = ({
  entry, workers, projects, vehicles, isEdit, onSave, onDelete, onClose,
}) => {
  const baseKouji = getBaseKoujimei(entry.koujimei ?? '')
  const matchedProj = useMemo(
    () => projects.find(p => p.name === baseKouji),
    [projects, baseKouji]
  )
  const [shift, setShift]           = useState<Shift>(entry.shift ?? 'day')
  const [date, setDate]              = useState(entry.date)
  const [projectId, setProjectId]   = useState(matchedProj ? matchedProj.id : (baseKouji ? OTHER_ID : ''))
  const [customKoujimei, setCustomKoujimei] = useState(matchedProj ? '' : (baseKouji || ''))
  const [selected, setSelected]    = useState<Set<string>>(new Set(entry.workers ?? []))
  const [selectedVehicles, setSelectedVehicles] = useState<Set<string>>(new Set(entry.vehicleIds ?? []))
  const [memo, setMemo]             = useState(entry.memo ?? '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const toggleWorker = (w: string) =>
    setSelected(prev => { const s = new Set(prev); s.has(w) ? s.delete(w) : s.add(w); return s })
  const toggleVehicle = (id: string) =>
    setSelectedVehicles(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const resolvedKoujimei = projectId === OTHER_ID
    ? customKoujimei.trim()
    : (projects.find(p => p.id === projectId)?.name ?? '')

  const handleSave = () => {
    if (!date) return
    onSave({
      id:         entry.id ?? genId(),
      date,
      koujimei:   shift === 'off' ? '有休' : resolvedKoujimei,
      shift,
      workers:    [...selected],
      vehicleIds:  [...selectedVehicles],
      memo,
    })
  }

  const hint = SHIFT_HINT[shift]

  return (
    <div
      className="schedule-no-print"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, padding: 16,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 10,
        width: '100%', maxWidth: 480, overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,.15)',
      }}>
        {/* Header */}
        <div style={{
          background: '#eef1f6', borderBottom: '1px solid #d0d8e4',
          padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#e65c00' }}>
            {isEdit ? '予定を編集' : '予定を追加'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#4a6280' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '70vh', overflowY: 'auto' }}>

          {/* 区分トグル */}
          <Field label="区分">
            <div style={{ display: 'flex', border: '1px solid #d0d8e4', borderRadius: 4, overflow: 'hidden' }}>
              {(['day', 'night', 'off'] as Shift[]).map(s => {
                const active = shift === s
                return (
                  <button key={s} onClick={() => setShift(s)} style={{
                    flex: 1, padding: '7px 4px', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 11, whiteSpace: 'nowrap',
                    background: active ? SHIFT_ACTIVE[s].bg : '#fff',
                    color:      active ? SHIFT_ACTIVE[s].color : '#4a6280',
                    fontWeight: active ? 700 : 400,
                    transition: 'all .15s',
                  }}>
                    {SHIFT_LABELS[s]}
                  </button>
                )
              })}
            </div>
          </Field>

          {/* ヒント */}
          {hint && (
            <div style={{
              fontSize: 10, padding: '5px 8px', borderRadius: 4,
              background: SHIFT_ACTIVE[shift].bg, color: SHIFT_ACTIVE[shift].color,
            }}>
              {hint}
            </div>
          )}

          {/* 日付 */}
          <Field label="日付">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </Field>

          {/* 工事名（有休以外）— 案件一覧連動 */}
          {shift !== 'off' && (
            <Field label="工事名">
              <select
                value={projectId}
                onChange={e => {
                  const v = e.target.value
                  setProjectId(v)
                  if (v !== OTHER_ID) setCustomKoujimei('')
                }}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">— 選択してください —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.managementNumber ? `${p.managementNumber} ` : ''}{p.name}
                  </option>
                ))}
                <option value={OTHER_ID}>その他（手入力）</option>
              </select>
              {projectId === OTHER_ID && (
                <input
                  type="text"
                  value={customKoujimei}
                  onChange={e => setCustomKoujimei(e.target.value)}
                  placeholder="例：神明町更生工事"
                  style={{ ...inputStyle, marginTop: 6 }}
                />
              )}
            </Field>
          )}

          {/* 作業員選択 */}
          <Field label={shift === 'off' ? '対象メンバー（タップで選択）' : '作業員（タップで選択）'}>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 5, padding: 8,
              background: '#eef1f6', borderRadius: 4, border: '1px solid #d0d8e4',
            }}>
              {workers.map(w => {
                const sel = selected.has(w)
                const c = workerColor(w)
                return (
                  <span key={w} onClick={() => toggleWorker(w)} style={{
                    padding: '3px 9px', borderRadius: 3, fontSize: 11,
                    cursor: 'pointer', transition: 'all .1s',
                    background: sel ? hexRgba(c, 0.12) : '#fff',
                    color:      sel ? c                 : '#4a6280',
                    border:     sel ? `2px solid ${c}`  : '1px solid #d0d8e4',
                    fontWeight: sel ? 700 : 400,
                  }}>
                    {w}
                  </span>
                )
              })}
            </div>
          </Field>

          {/* 使用車両（有休以外・本体の車両マスターから） */}
          {shift !== 'off' && vehicles.length > 0 && (
            <Field label="使用車両（タップで選択）">
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 5, padding: 8,
                background: '#f5f3ff', borderRadius: 4, border: '1px solid #ddd6fe',
              }}>
                {vehicles.map(v => {
                  const sel = selectedVehicles.has(v.id)
                  return (
                    <span key={v.id} onClick={() => toggleVehicle(v.id)} style={{
                      padding: '3px 9px', borderRadius: 3, fontSize: 11,
                      fontFamily: 'IBM Plex Mono,monospace',
                      cursor: 'pointer', transition: 'all .1s',
                      background: sel ? 'rgba(139,92,246,0.15)' : '#fff',
                      color:      sel ? '#8b5cf6' : '#4a6280',
                      border:     sel ? '2px solid #8b5cf6' : '1px solid #ddd6fe',
                      fontWeight: sel ? 700 : 400,
                    }}>
                      🚛 {v.registration}
                    </span>
                  )
                })}
              </div>
            </Field>
          )}

          {/* メモ */}
          <Field label="メモ（工事名の横に表示）">
            <input
              type="text" value={memo} onChange={e => setMemo(e.target.value)}
              placeholder="例：出張・資材搬入など"
              style={inputStyle}
            />
          </Field>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid #d0d8e4',
          display: 'flex', gap: 6, justifyContent: 'flex-end',
          background: '#eef1f6',
        }}>
          {isEdit && onDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{ ...btnStyle, marginRight: 'auto', color: '#c62828', borderColor: '#ffcdd2' }}
            >
              🗑 削除
            </button>
          )}
          <button onClick={onClose} style={btnStyle}>キャンセル</button>
          <button onClick={handleSave} style={{ ...btnStyle, background: '#e65c00', color: '#fff', border: 'none', fontWeight: 700 }}>
            {isEdit ? '更新' : '保存'}
          </button>
        </div>
      </div>

      {/* 削除確認ポップアップ */}
      {showDeleteConfirm && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowDeleteConfirm(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 300, padding: 16,
          }}
        >
          <div style={{
            background: '#fff', borderRadius: 10, padding: 20,
            maxWidth: 360, width: '100%',
            boxShadow: '0 8px 32px rgba(0,0,0,.2)',
          }}>
            <p style={{ margin: 0, fontSize: 14, color: '#1a2535', lineHeight: 1.6 }}>
              この予定を削除しますか？
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={btnStyle}>
                キャンセル
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); onDelete?.() }}
                style={{ ...btnStyle, background: '#c62828', color: '#fff', border: 'none', fontWeight: 700 }}
              >
                🗑 削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 共通スタイル ─────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  border: '1px solid #d0d8e4', borderRadius: 4,
  fontFamily: 'inherit', fontSize: 12, color: '#1a2535',
  outline: 'none',
}
const btnStyle: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 4,
  border: '1px solid #d0d8e4', background: '#fff',
  color: '#1a2535', cursor: 'pointer',
  fontSize: 11, fontFamily: 'inherit',
}
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <label style={{ fontSize: 11, color: '#4a6280', fontWeight: 600 }}>{label}</label>
    {children}
  </div>
)
