'use client'
// ================================================================
// components/ScheduleBoard/Chips.tsx
// 小さな UI パーツ（チップ・バッジ）
// ================================================================
import React from 'react'
import { workerColor, hexRgba } from '@/lib/scheduleUtils'

// ── Worker chip ──────────────────────────────────────────────────
interface WChipProps {
  name: string
  isConflict?: boolean
  isNight?: boolean
  onClick?: () => void
}
export const WChip: React.FC<WChipProps> = ({
  name, isConflict = false, isNight = false, onClick
}) => {
  const base = wcolor(name)
  const bg     = isConflict ? '#fff5f5' : isNight ? '#e8eaf6' : hexRgba(base, 0.1)
  const border = isConflict ? '#ffcdd2' : isNight ? '#9fa8da' : hexRgba(base, 0.3)
  const color  = isConflict ? '#c62828' : isNight ? '#1a237e' : base
  return (
    <span
      onClick={e => { e.stopPropagation(); onClick?.() }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 1,
        padding: '1px 5px', borderRadius: 3,
        fontSize: 9, fontWeight: 600,
        cursor: onClick ? 'pointer' : 'default',
        border: `1px solid ${border}`, background: bg, color,
        whiteSpace: 'nowrap',
      }}
    >
      {isConflict && <span style={{ fontSize: 9, fontWeight: 900, color: '#c62828', marginRight: 1 }}>!</span>}
      {name}
    </span>
  )
}

// ── Off (有休) chip ──────────────────────────────────────────────
interface OffChipProps { name: string; isConflict?: boolean }
export const OffChip: React.FC<OffChipProps> = ({ name, isConflict = false }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 2,
    padding: '1px 5px', borderRadius: 3,
    fontSize: 9, fontWeight: 600, whiteSpace: 'nowrap',
    border:      isConflict ? '1px solid #ffcdd2' : '1px solid #b0bec5',
    background:  isConflict ? '#fff5f5'           : '#eceff1',
    color:       isConflict ? '#c62828'           : '#546e7a',
  }}>
    {isConflict && <span style={{ fontWeight: 900 }}>!</span>}
    <span style={{ textDecoration: isConflict ? 'none' : 'line-through', opacity: isConflict ? 1 : 0.8 }}>
      {name}
    </span>
  </span>
)

// ── Shift badge ──────────────────────────────────────────────────
type BadgeType = 'night' | 'morning' | 'off'
const BADGE_MAP: Record<BadgeType, { bg: string; label: string }> = {
  night:   { bg: '#1a237e', label: '🌙 夜勤' },
  morning: { bg: '#4a148c', label: '☀ 夜勤明け' },
  off:     { bg: '#546e7a', label: '🏖 有休' },
}
interface ShiftBadgeProps { type: BadgeType }
export const ShiftBadge: React.FC<ShiftBadgeProps> = ({ type }) => {
  const { bg, label } = BADGE_MAP[type]
  return (
    <span style={{
      display: 'inline-block', fontSize: 8, padding: '1px 4px',
      borderRadius: 2, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
      background: bg, color: '#fff',
    }}>
      {label}
    </span>
  )
}

// ── Small pip (日付欄の小バッジ) ─────────────────────────────────
interface PipProps { bg: string; color: string; border: string; children: React.ReactNode }
export const Pip: React.FC<PipProps> = ({ bg, color, border, children }) => (
  <span style={{
    display: 'inline-block', fontSize: 8, padding: '0 4px',
    borderRadius: 2, fontWeight: 700, border: `1px solid ${border}`,
    background: bg, color, marginTop: 2,
  }}>
    {children}
  </span>
)

// ── Worker row ───────────────────────────────────────────────────
interface WorkerRowProps {
  workers: string[]
  conflicts: Set<string>
  isNight?: boolean
  onClickWorker?: (w: string) => void
}
export const WorkerRow: React.FC<WorkerRowProps> = ({
  workers, conflicts, isNight = false, onClickWorker
}) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2 }}>
    {workers.map(w => (
      <WChip
        key={w} name={w}
        isConflict={conflicts.has(w)}
        isNight={isNight}
        onClick={onClickWorker ? () => onClickWorker(w) : undefined}
      />
    ))}
  </div>
)

// ── Off worker row ───────────────────────────────────────────────
interface OffWorkerRowProps { workers: string[]; conflicts: Set<string> }
export const OffWorkerRow: React.FC<OffWorkerRowProps> = ({ workers, conflicts }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2 }}>
    {workers.map(w => <OffChip key={w} name={w} isConflict={conflicts.has(w)} />)}
  </div>
)

// ── Vehicle chip（使用車両）────────────────────────────────────────
const VEHICLE_COLOR = '#8b5cf6'
export const VehicleChip: React.FC<{ registration: string; isConflict?: boolean }> = ({ registration, isConflict = false }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 2,
    padding: '1px 5px', borderRadius: 3,
    fontSize: 9, fontWeight: 600, whiteSpace: 'nowrap',
    border:     isConflict ? '1px solid #ffcdd2' : '1px solid rgba(139,92,246,0.35)',
    background: isConflict ? '#fff5f5' : 'rgba(139,92,246,0.08)',
    color:      isConflict ? '#c62828' : VEHICLE_COLOR,
    fontFamily: 'IBM Plex Mono,monospace',
  }}>
    {isConflict && <span style={{ fontSize: 9, fontWeight: 900, color: '#c62828', marginRight: 1 }}>!</span>}
    🚛 {registration}
  </span>
)

// ── Vehicle row ──────────────────────────────────────────────────
interface VehicleRowProps {
  vehicleIds: string[]
  vehicleMap: Map<string, string>  // id → registration
  conflicts?: Set<string>          // 同日重複の車両ID
}
export const VehicleRow: React.FC<VehicleRowProps> = ({ vehicleIds, vehicleMap, conflicts = new Set() }) => {
  if (!vehicleIds?.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2 }}>
      {vehicleIds.map(id => (
        <VehicleChip key={id} registration={vehicleMap.get(id) ?? id} isConflict={conflicts.has(id)} />
      ))}
    </div>
  )
}

// ─── workerColor re-export for convenience ───────────────────────
function wcolor(w: string) { return workerColor(w) }
