'use client'
// ================================================================
// components/ScheduleBoard/DayMemoField.tsx
// 各日付の下段インラインメモ欄
// ================================================================
import React, { useState, useEffect, useRef } from 'react'

interface Props {
  date: string
  value: string
  onChange: (date: string, value: string) => void
}

export const DayMemoField: React.FC<Props> = ({ date, value, onChange }) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) taRef.current?.focus() }, [editing])

  const finish = () => {
    setEditing(false)
    onChange(date, draft.trim())
  }

  if (editing) {
    return (
      <textarea
        ref={taRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={e => { if (e.key === 'Escape') finish() }}
        placeholder="この日のメモ（材料・連絡事項など）"
        style={{
          width: '100%', minHeight: 52, padding: '4px 8px',
          fontSize: 10, fontFamily: 'inherit', color: '#1a2535',
          border: 'none', borderTop: '2px solid #e65c00',
          background: '#fffbf7', resize: 'vertical', outline: 'none',
          lineHeight: 1.5,
        }}
      />
    )
  }

  return (
    <div
      onClick={() => setEditing(true)}
      style={{
        minHeight: 28, padding: '4px 8px', fontSize: 10,
        color:      value ? '#795548' : '#8aa0b8',
        fontStyle:  value ? 'normal'  : 'italic',
        background: value ? '#fdf6f0' : 'transparent',
        cursor: 'text', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        lineHeight: 1.5,
      }}
    >
      {value || 'メモを追加...'}
    </div>
  )
}
