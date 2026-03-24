'use client'
// ================================================================
// components/ScheduleBoard/index.tsx
// 工事スケジュール管理ボード — メインコンポーネント
// ================================================================
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { ScheduleEntry, DayMemos, ViewType } from '@/types/schedule'
import type { Project, Vehicle } from '@/lib/utils'
import { SAMPLE_DATA, getSampleDataForMarch2026 } from '@/lib/sampleData'
import { loadScheduleData, saveScheduleData, saveSchedulePendingSync, fetchScheduleRevision } from '@/lib/scheduleStorage'
import { loadData } from '@/lib/supabase/data'
import { loadWorkerContacts, saveWorkerContact, deleteWorkerContact } from '@/lib/workerContacts'
import { computeScheduleChanges } from '@/lib/scheduleNotify'
import { createClient } from '@/lib/supabase/client'
import {
  TODAY_STR, daysInMonth, genId, workerColor, hexRgba,
  getConflicts, getMonthSchedules, applySameDayKoujimeiSuffix,
  ensureNGSCInData,
} from '@/lib/scheduleUtils'
import { CalendarView }            from './CalendarView'
import { ListView, WorkerView, MasterView } from './OtherViews'
import { EntryModal }              from './EntryModal'

const MONTH_NAMES = '1月 2月 3月 4月 5月 6月 7月 8月 9月 10月 11月 12月'.split(' ')
const VIEW_LABELS: Record<ViewType, string> = { cal:'カレンダー', list:'一覧', worker:'作業員', master:'マスター' }

export default function ScheduleBoard() {
  // ── State ──────────────────────────────────────────────────────
  const [workers,   setWorkers]   = useState<string[]>(SAMPLE_DATA.workers)
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([])
  const [dayMemos,  setDayMemos]  = useState<DayMemos>({})
  const [view,           setView]           = useState<ViewType>('cal')
  const [year,           setYear]           = useState(() => new Date().getFullYear())
  const [month,          setMonth]          = useState(() => new Date().getMonth())
  const [filterWorker,   setFilterWorker]   = useState<string | null>(null)
  const [searchText,     setSearchText]     = useState('')
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null)
  const [modal, setModal] = useState<{ entry: Partial<ScheduleEntry> & { date: string }; isEdit: boolean } | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [workerContacts, setWorkerContacts] = useState<Record<string, string>>({})
  const [pdfLoading, setPdfLoading] = useState(false)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const pdfAreaRef = useRef<HTMLDivElement>(null)
  const lastSyncedRevisionRef = useRef<string | null>(null)
  const modalRef = useRef(modal)
  modalRef.current = modal
  const yearMonthRef = useRef({ year, month })
  yearMonthRef.current = { year, month }

  // ── 初期ロード（プロジェクト等）─────────────────────────────────
  useEffect(() => {
    loadData().then(d => {
      if (d) {
        if (d.projects?.length) setProjects(d.projects.filter(p => !p.archived && !p.deleted))
        if (d.vehicles?.length) setVehicles(d.vehicles)
      }
    })
    loadWorkerContacts().then(setWorkerContacts)
  }, [])

  // ── 保存（保存前にサーバー版を照合）──────────────────────────────
  const persist = useCallback(async (
    w: string[],
    s: ScheduleEntry[],
    m: DayMemos,
    prevSchedules?: ScheduleEntry[]
  ): Promise<boolean> => {
    const payload = { workers: w, schedules: s, dayMemos: m }
    const remote = await fetchScheduleRevision()
    if (
      lastSyncedRevisionRef.current !== null &&
      remote !== '' &&
      remote !== lastSyncedRevisionRef.current
    ) {
      alert(
        'サーバー上のデータが別の端末で更新されています。\n\n' +
          'いったんページを再読み込み（F5）してから、もう一度操作してください。'
      )
      return false
    }
    try {
      saveSchedulePendingSync(payload)
      await saveScheduleData(payload)
      lastSyncedRevisionRef.current = await fetchScheduleRevision()
    } catch (e) {
      console.error('[persist]', e)
      alert('保存に失敗しました。ネットワークをご確認ください。')
      return false
    }
    if (prevSchedules !== undefined && prevSchedules !== s) {
      const changes = computeScheduleChanges(prevSchedules, s)
      if (changes.length > 0) {
        console.log('[Notify] 変更検知', changes.length, '件', changes.map(c => `${c.workerName}: ${c.message}`))
        createClient().auth.getSession().then(({ data: { session } }) => {
          if (session?.access_token) {
            fetch('/api/schedule/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ changes }),
            })
              .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
              .then(({ ok, data }) => {
                if (ok) console.log('[Notify] 通知送信完了', data)
                else console.warn('[Notify] エラー', data)
              })
              .catch((e) => console.error('[Notify] 送信失敗', e))
          } else {
            console.warn('[Notify] 未ログインのためスキップ')
          }
        })
      }
    }
    return true
  }, [])

  // ── スケジュール初期ロード ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const data = await loadScheduleData()
      if (cancelled) return
      if (data) {
        const w = data.workers?.length ? data.workers : SAMPLE_DATA.workers
        const s = data.schedules ?? []
        const m = data.dayMemos ?? {}
        const now = new Date()
        const ensured = ensureNGSCInData(w, s, m, now.getFullYear(), now.getMonth())
        setWorkers(ensured.workers)
        setSchedules(ensured.schedules)
        setDayMemos(ensured.dayMemos)
        if (ensured.added) {
          const payload = { workers: ensured.workers, schedules: ensured.schedules, dayMemos: ensured.dayMemos }
          saveSchedulePendingSync(payload)
          await saveScheduleData(payload)
        }
      } else {
        const now = new Date()
        const isMarch2026 = now.getFullYear() === 2026 && now.getMonth() === 2
        if (isMarch2026) {
          const sample = getSampleDataForMarch2026()
          setWorkers(sample.workers)
          setSchedules(sample.schedules)
          setDayMemos(sample.dayMemos)
          setYear(2026)
          setMonth(2)
        } else {
          const ensured = ensureNGSCInData(SAMPLE_DATA.workers, [], {}, now.getFullYear(), now.getMonth())
          setWorkers(ensured.workers)
          setSchedules(ensured.schedules)
          setDayMemos(ensured.dayMemos)
          if (ensured.added) {
            const payload = { workers: ensured.workers, schedules: ensured.schedules, dayMemos: ensured.dayMemos }
            saveSchedulePendingSync(payload)
            await saveScheduleData(payload)
          }
        }
      }
      if (!cancelled) lastSyncedRevisionRef.current = await fetchScheduleRevision()
    })()
    return () => { cancelled = true }
  }, [])

  // 月切り替え時: 表示月の平日にNGSCがなければ追加
  const prevYM = useRef({ year, month })
  useEffect(() => {
    if (workers.length === 0) return
    if (prevYM.current.year === year && prevYM.current.month === month) return
    prevYM.current = { year, month }
    const result = ensureNGSCInData(workers, schedules, dayMemos, year, month)
    if (!result.added) return
    void (async () => {
      const ok = await persist(result.workers, result.schedules, result.dayMemos)
      if (ok) {
        setWorkers(result.workers)
        setSchedules(result.schedules)
        setDayMemos(result.dayMemos)
      }
    })()
  }, [year, month, workers, schedules, dayMemos, persist])

  // タブが前面に戻ったとき: サーバーが更新されていれば自動で再読み込み（モーダル編集中は除く）
  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState !== 'visible') return
      const remote = await fetchScheduleRevision()
      if (remote === '' || lastSyncedRevisionRef.current === null) return
      if (remote === lastSyncedRevisionRef.current) return
      if (modalRef.current) return
      const fresh = await loadScheduleData()
      if (!fresh) return
      const w = fresh.workers?.length ? fresh.workers : SAMPLE_DATA.workers
      const s = fresh.schedules ?? []
      const mem = fresh.dayMemos ?? {}
      const { year: y, month: mo } = yearMonthRef.current
      const ensured = ensureNGSCInData(w, s, mem, y, mo)
      setWorkers(ensured.workers)
      setSchedules(ensured.schedules)
      setDayMemos(ensured.dayMemos)
      if (ensured.added) {
        const payload = { workers: ensured.workers, schedules: ensured.schedules, dayMemos: ensured.dayMemos }
        saveSchedulePendingSync(payload)
        await saveScheduleData(payload)
      }
      lastSyncedRevisionRef.current = await fetchScheduleRevision()
      setSyncNotice('他の端末での更新を取り込みました')
      window.setTimeout(() => setSyncNotice(null), 5000)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // beforeunload: リロード・タブ閉じ前に必ずバックアップ
  useEffect(() => {
    const handler = () => {
      saveSchedulePendingSync({ workers, schedules, dayMemos })
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [workers, schedules, dayMemos])

  // ── 予定 CRUD ──────────────────────────────────────────────────
  const handleSaveEntry = async (entry: ScheduleEntry) => {
    const withEntry = schedules.find(x => x.id === entry.id)
      ? schedules.map(x => (x.id === entry.id ? entry : x))
      : [...schedules, entry]
    const next = entry.shift !== 'off' && entry.koujimei
      ? applySameDayKoujimeiSuffix(entry, withEntry)
      : withEntry
    const ok = await persist(workers, next, dayMemos, schedules)
    if (ok) {
      setSchedules(next)
      setModal(null)
    }
  }
  const handleDeleteEntry = async (id: string) => {
    const next = schedules.filter(x => x.id !== id)
    const ok = await persist(workers, next, dayMemos, schedules)
    if (ok) {
      setSchedules(next)
      setModal(null)
    }
  }

  // ── 日次メモ ─────────────────────────────────────────────────
  const handleDayMemo = async (date: string, value: string) => {
    const next = { ...dayMemos }
    if (value) next[date] = value; else delete next[date]
    const ok = await persist(workers, schedules, next)
    if (ok) setDayMemos(next)
  }

  // ── 作業員 CRUD ──────────────────────────────────────────────────
  const handleAddWorker = async (name: string) => {
    if (!name || workers.includes(name)) return
    const next = [...workers, name]
    const ok = await persist(next, schedules, dayMemos)
    if (ok) setWorkers(next)
  }
  const handleRemoveWorker = async (name: string) => {
    if (!confirm(`「${name}」を削除しますか？`)) return
    const next = workers.filter(w => w !== name)
    const ok = await persist(next, schedules, dayMemos)
    if (ok) setWorkers(next)
  }
  const handleRenameWorker = useCallback(async (oldName: string, newName: string): Promise<boolean> => {
    const trimmed = newName.trim()
    if (!trimmed) {
      alert('表示名を入力してください')
      return false
    }
    if (trimmed === oldName) return true
    if (workers.includes(trimmed)) {
      alert(`「${trimmed}」は既に登録されています`)
      return false
    }
    const idx = workers.indexOf(oldName)
    if (idx < 0) return false
    const nextWorkers = [...workers]
    nextWorkers[idx] = trimmed
    const nextSchedules = schedules.map(s => ({
      ...s,
      workers: s.workers.map(n => (n === oldName ? trimmed : n)),
    }))
    const ok = await persist(nextWorkers, nextSchedules, dayMemos)
    if (!ok) return false
    setWorkers(nextWorkers)
    setSchedules(nextSchedules)
    const email = workerContacts[oldName] ?? ''
    try {
      await deleteWorkerContact(oldName)
      if (email.trim()) await saveWorkerContact(trimmed, email)
      setWorkerContacts(prev => {
        const next = { ...prev }
        delete next[oldName]
        if (email.trim()) next[trimmed] = email.trim()
        return next
      })
    } catch (e) {
      console.error('[handleRenameWorker] contacts', e)
      alert('表示名は保存しましたが、連絡先の移行に失敗しました。マスターでメールを再登録してください。')
    }
    if (filterWorker === oldName) setFilterWorker(trimmed)
    if (selectedWorker === oldName) setSelectedWorker(trimmed)
    return true
  }, [workers, schedules, dayMemos, persist, workerContacts, filterWorker, selectedWorker])
  const handleSaveContact = useCallback(async (workerName: string, email: string) => {
    await saveWorkerContact(workerName, email)
    setWorkerContacts(prev => ({ ...prev, [workerName]: email }))
  }, [])

  const handleTestTeams = useCallback(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) {
        alert('ログインしてください')
        return
      }
      const testChanges = [{ workerName: 'テスト', date: new Date().toISOString().slice(0, 10), message: '接続テスト' }]
      fetch('/api/schedule/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ changes: testChanges }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.ok) alert('送信しました。Teamsチャネルを確認してください')
          else alert('エラー: ' + (d.error || JSON.stringify(d)))
        })
        .catch(e => alert('送信失敗: ' + e.message))
    })
  }, [])

  // ── filterWorker のトグル ────────────────────────────────────────
  const handleFilterWorker = (w: string) =>
    setFilterWorker(fw => fw === w ? null : w)

  // ── 統計（カレンダー） ─────────────────────────────────────────
  const monthScheds = useMemo(
    () => getMonthSchedules(year, month, schedules),
    [year, month, schedules]
  )
  const stats = useMemo(() => ({
    total:   monthScheds.filter(s => s.shift !== 'off').length,
    nights:  monthScheds.filter(s => s.shift === 'night').length,
    offDays: monthScheds.filter(s => s.shift === 'off').flatMap(e => e.workers).length,
    conflicts: [...new Set(monthScheds.map(s => s.date))]
      .filter(d => getConflicts(d, schedules).size > 0).length,
    memos: Object.keys(dayMemos).filter(d => {
      const [dy, dm] = d.split('-'); return +dy === year && +dm - 1 === month
    }).length,
  }), [monthScheds, schedules, dayMemos, year, month])

  // ── ヘルパー UI ──────────────────────────────────────────────────
  const navBtn = (active: boolean, onClick: () => void, children: React.ReactNode) => (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 4,
      border:      `1px solid ${active ? '#e65c00' : '#d0d8e4'}`,
      background:  active ? '#e65c00' : '#fff',
      color:       active ? '#fff'    : '#4a6280',
      fontWeight:  active ? 700       : 400,
      cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, whiteSpace: 'nowrap',
      transition: 'all .15s',
    }}>
      {children}
    </button>
  )

  const handlePrint = () => window.print()

  const handleExportPdf = useCallback(async () => {
    const el = pdfAreaRef.current
    if (!el) return
    setPdfLoading(true)
    try {
      const FIXED_WIDTH = 900
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f5f7fa',
        onclone: (_, clonedEl) => {
          if (clonedEl instanceof HTMLElement) {
            clonedEl.style.width = `${FIXED_WIDTH}px`
            clonedEl.style.minWidth = `${FIXED_WIDTH}px`
          }
        },
      })
      const imgData = canvas.toDataURL('image/png', 1.0)
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const aspect = canvas.height / canvas.width
      const imgW = pageW * aspect <= pageH ? pageW : pageH / aspect
      const imgH = imgW * aspect
      pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH)
      const fname = `schedule-${year}-${String(month + 1).padStart(2, '0')}.pdf`
      pdf.save(fname)
    } catch (e) {
      console.error('[PDF export]', e)
      alert('PDFの作成に失敗しました')
    } finally {
      setPdfLoading(false)
    }
  }, [year, month])

  // ── レンダー ──────────────────────────────────────────────────
  return (
    <div className="schedule-print-root" style={{ fontFamily: 'Noto Sans JP,sans-serif', background: '#f5f7fa', minHeight: '100vh', fontSize: 13, color: '#1a2535' }}>

      {/* ── Header ── */}
      <div className="schedule-no-print" style={{
        background: '#fff', borderBottom: '2px solid #e65c00',
        padding: '10px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100,
        gap: 12, flexWrap: 'wrap', boxShadow: '0 2px 6px rgba(0,0,0,.07)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/" style={{
            fontSize: 12, color: '#4a6280', textDecoration: 'none', marginRight: 8,
            padding: '4px 8px', borderRadius: 4, border: '1px solid #d0d8e4',
          }}>← 案件管理に戻る</Link>
          <div style={{
            width: 34, height: 34, background: '#e65c00', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'IBM Plex Mono,monospace', fontWeight: 600, fontSize: 15, color: '#fff',
          }}>工</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>工事スケジュール管理</div>
            <div style={{ fontSize: 10, color: '#4a6280', letterSpacing: 2 }}>PROJECT-BASED SCHEDULE BOARD</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {(['cal', 'list', 'worker', 'master'] as ViewType[]).map(v =>
            navBtn(view === v, () => { setView(v); setSelectedWorker(null) }, VIEW_LABELS[v])
          )}
          <button
            onClick={handleExportPdf}
            disabled={pdfLoading}
            className="schedule-no-print"
            style={{
              padding: '5px 12px', borderRadius: 4, marginLeft: 8,
              border: '1px solid #8b5cf6', background: '#f5f3ff',
              color: '#8b5cf6', cursor: pdfLoading ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {pdfLoading ? '作成中...' : '📄 PDF'}
          </button>
          <button
            onClick={handlePrint}
            className="schedule-no-print"
            style={{
              padding: '5px 12px', borderRadius: 4, marginLeft: 4,
              border: '1px solid #d0d8e4', background: '#fff',
              color: '#4a6280', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
            }}
          >
            🖨 印刷
          </button>
        </div>
      </div>

      {syncNotice && (
        <div className="schedule-no-print" style={{
          background: '#e3f2fd', borderBottom: '1px solid #90caf9', color: '#1565c0',
          padding: '8px 16px', fontSize: 12, textAlign: 'center',
        }}>
          {syncNotice}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="schedule-no-print" style={{ background: '#fff', borderBottom: '1px solid #d0d8e4', padding: '8px 16px',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 48 }}>

        {view === 'cal' && <>
          {navBtn(false, () => setYear(y => y - 1), `◀ ${year - 1}`)}
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e65c00', fontFamily: 'IBM Plex Mono,monospace' }}>{year}年</span>
          {navBtn(false, () => setYear(y => y + 1), `${year + 1} ▶`)}
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {MONTH_NAMES.map((mn, i) => navBtn(i === month, () => setMonth(i), mn))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            {filterWorker && <>
              <span style={{ fontSize: 11, background: hexRgba(workerColor(filterWorker), 0.1), color: workerColor(filterWorker), border: `1px solid ${hexRgba(workerColor(filterWorker), 0.3)}`, padding: '3px 8px', borderRadius: 3 }}>
                🔍 {filterWorker}
              </span>
              {navBtn(false, () => setFilterWorker(null), '✕ 解除')}
            </>}
            {navBtn(true, () => setModal({ entry: { date: TODAY_STR, shift: 'day', workers: [], memo: '' }, isEdit: false }), '＋ 予定追加')}
          </div>
        </>}

        {view === 'list' && <>
          <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="工事名・作業員で検索..." style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d0d8e4', fontSize: 11, width: 220 }} />
          <select value={filterWorker ?? ''} onChange={e => setFilterWorker(e.target.value || null)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d0d8e4', fontSize: 11 }}>
            <option value="">全作業員</option>
            {workers.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <div style={{ marginLeft: 'auto' }}>
            {navBtn(true, () => setModal({ entry: { date: TODAY_STR, shift: 'day', workers: [], memo: '' }, isEdit: false }), '＋ 予定追加')}
          </div>
        </>}

        {view === 'worker' && <>
          <span style={{ fontSize: 11, color: '#4a6280' }}>作業員をクリックして稼働履歴を確認</span>
          {selectedWorker && <span style={{ marginLeft: 'auto' }}>{navBtn(false, () => setSelectedWorker(null), '← 一覧に戻る')}</span>}
        </>}

        {view === 'master' && <span style={{ fontSize: 11, color: '#4a6280' }}>作業員マスター管理</span>}
      </div>

      {/* ── 統計バー（カレンダーのみ） ── */}
      {view === 'cal' && (
        <div className="schedule-no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, padding: '10px 16px', background: '#eef1f6', borderBottom: '1px solid #d0d8e4' }}>
          {[
            { n: stats.total,     l: '今月の予定数',  c: '#e65c00' },
            { n: stats.nights,    l: '夜勤件数',      c: '#1a237e' },
            ...(stats.offDays > 0 ? [{ n: stats.offDays, l: '有休人日数', c: '#546e7a' }] : []),
            { n: stats.conflicts, l: '重複日数',      c: stats.conflicts > 0 ? '#c62828' : '#e65c00', alert: stats.conflicts > 0 },
            { n: stats.memos,     l: 'メモあり日数',  c: '#795548' },
          ].map((s, i) => (
            <div key={i} style={{ background: '#fff', border: `${s.alert ? 2 : 1}px solid ${s.alert ? '#c62828' : '#d0d8e4'}`, borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.c, fontFamily: 'IBM Plex Mono,monospace' }}>
                {s.alert ? '!' : ''}{s.n}
              </div>
              <div style={{ fontSize: 10, color: s.alert ? s.c : '#4a6280', marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main（PDF対象） ── */}
      <div ref={pdfAreaRef} style={{ flex: 1, padding: '12px 16px', overflow: 'auto', background: '#f5f7fa' }}>

        {view === 'cal' && (
          <CalendarView
            year={year} month={month}
            schedules={schedules} workers={workers} vehicles={vehicles} dayMemos={dayMemos}
            filterWorker={filterWorker}
            onFilterWorker={handleFilterWorker}
            onClickEntry={e => setModal({ entry: e, isEdit: true })}
            onAddEntry={date => setModal({ entry: { date, shift: 'day', workers: [], memo: '' }, isEdit: false })}
            onDayMemoChange={handleDayMemo}
          />
        )}

        {view === 'list' && (
          <ListView
            schedules={schedules} vehicles={vehicles} dayMemos={dayMemos}
            filterWorker={filterWorker} searchText={searchText}
            onClickEntry={e => setModal({ entry: e, isEdit: true })}
            onDeleteEntry={handleDeleteEntry}
          />
        )}

        {view === 'worker' && (
          <WorkerView
            workers={workers} schedules={schedules} vehicles={vehicles}
            selectedWorker={selectedWorker}
            onSelect={setSelectedWorker}
            onBack={() => setSelectedWorker(null)}
          />
        )}

        {view === 'master' && (
          <MasterView
            workers={workers}
            schedules={schedules}
            workerContacts={workerContacts}
            onAdd={handleAddWorker}
            onRemove={handleRemoveWorker}
            onRename={handleRenameWorker}
            onSaveContact={handleSaveContact}
            onTestTeams={handleTestTeams}
          />
        )}
      </div>

      {/* ── Modal（印刷時非表示） ── */}
      {modal && (
        <EntryModal
          entry={modal.entry}
          workers={workers}
          projects={projects}
          vehicles={vehicles}
          isEdit={modal.isEdit}
          onSave={handleSaveEntry}
          onDelete={modal.isEdit ? () => handleDeleteEntry(modal.entry.id!) : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
