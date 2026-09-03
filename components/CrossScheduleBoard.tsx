"use client";

// ================================================================
// 横断工程表 — 期間バー中心（案件×最大5レーン、年表示対応）
// 人工・原価とは連携しない
// ================================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type { Project } from "@/lib/utils";
import { loadData } from "@/lib/supabase/data";
import { genId } from "@/lib/constants";
import { useUserRole } from "@/lib/roles";
import { useMediaQuery } from "@/lib/useMediaQuery";
import {
  MAX_CREWS_PER_PROJECT,
  CREW_COLOR_PALETTE,
  mergeWorkKinds,
  workKindById,
  crewColorForName,
  barDisplayDays,
  calendarDaysInclusive,
} from "@/types/crossSchedule";
import type { CrossScheduleRow, CrossScheduleBar, CrossWorkKind } from "@/types/crossSchedule";
import {
  loadCrossScheduleRows,
  loadCrossScheduleBars,
  loadCrossWorkKinds,
  upsertCrossScheduleRow,
  deleteCrossScheduleRow,
  upsertCrossScheduleBar,
  deleteCrossScheduleBar,
  upsertCrossWorkKind,
  deleteCrossWorkKind,
  CROSS_VIEWER_FORBIDDEN_MSG,
} from "@/lib/crossScheduleStorage";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

type DayCol = {
  date: string;
  day: number;
  monthIndex: number;
  year: number;
  dow: number;
};

type RangeMonths = 1 | 3 | 12;

function ymd(y: number, mIdx: number, d: number): string {
  return `${y}-${String(mIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function buildDays(startYear: number, startMonthIndex: number, monthCount: number): DayCol[] {
  const out: DayCol[] = [];
  let y = startYear;
  let m = startMonthIndex;
  for (let i = 0; i < monthCount; i++) {
    const last = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= last; d++) {
      out.push({
        date: ymd(y, m, d),
        day: d,
        monthIndex: m,
        year: y,
        dow: new Date(y, m, d).getDay(),
      });
    }
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

const todayStr = () => {
  const t = new Date();
  return ymd(t.getFullYear(), t.getMonth(), t.getDate());
};

function dayWidthFor(range: RangeMonths, mobile: boolean): number {
  if (range === 12) return mobile ? 8 : 10;
  if (range === 3) return mobile ? 22 : 20;
  return mobile ? 30 : 28;
}

const DESKTOP_LEFT = [
  { key: "name", label: "工事名", width: 200 },
  { key: "client", label: "元請", width: 88 },
  { key: "person", label: "担当", width: 64 },
  { key: "crew", label: "業者", width: 128 },
] as const;
const MOBILE_LEFT = [
  { key: "name", label: "工事名", width: 132 },
  { key: "crew", label: "業者", width: 88 },
] as const;

const LANE_H = 32;
const HEADER_H = 44;

type DragPaint = {
  rowId: string;
  startDi: number;
  endDi: number;
};

type BarEditDraft = {
  id: string;
  rowId: string;
  startDate: string;
  endDate: string;
  workKindId: string;
  label: string;
  note: string;
  plannedDays: string;
};

function contrastFg(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const y = (r * 299 + g * 587 + b * 114) / 1000;
  return y > 160 ? "#1a1a1a" : "#ffffff";
}

export default function CrossScheduleBoard() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const leftCols = isMobile ? [...MOBILE_LEFT] : [...DESKTOP_LEFT];
  const leftTotal = leftCols.reduce((s, c) => s + c.width, 0);

  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<CrossScheduleRow[]>([]);
  const [bars, setBars] = useState<CrossScheduleBar[]>([]);
  const [customKinds, setCustomKinds] = useState<CrossWorkKind[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [rangeMonths, setRangeMonths] = useState<RangeMonths>(3);

  const [activeKindId, setActiveKindId] = useState<string>("");
  const [addProjectId, setAddProjectId] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showKindManager, setShowKindManager] = useState(false);
  const [editingBar, setEditingBar] = useState<BarEditDraft | null>(null);
  const [drag, setDrag] = useState<DragPaint | null>(null);

  const { role } = useUserRole();
  const readOnly = role === "viewer";
  const pdfAreaRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const crewTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const today = todayStr();

  const dayW = dayWidthFor(rangeMonths, isMobile);
  const workKinds = useMemo(() => mergeWorkKinds(customKinds), [customKinds]);

  useEffect(() => {
    if (!activeKindId && workKinds.length > 0) {
      setActiveKindId(workKinds[0].id);
    }
  }, [activeKindId, workKinds]);

  const days = useMemo(() => buildDays(year, month, rangeMonths), [year, month, rangeMonths]);
  const rangeStart = days[0]?.date ?? "";
  const rangeEnd = days[days.length - 1]?.date ?? "";
  const dateIndex = useMemo(() => {
    const m = new Map<string, number>();
    days.forEach((d, i) => m.set(d.date, i));
    return m;
  }, [days]);

  const monthBands = useMemo(() => {
    const bands: { key: string; label: string; start: number; span: number }[] = [];
    let i = 0;
    while (i < days.length) {
      const d = days[i];
      let j = i + 1;
      while (j < days.length && days[j].year === d.year && days[j].monthIndex === d.monthIndex) j++;
      bands.push({
        key: `${d.year}-${d.monthIndex}`,
        label: rangeMonths === 12 ? `${d.monthIndex + 1}月` : `${d.year}年${d.monthIndex + 1}月`,
        start: i,
        span: j - i,
      });
      i = j;
    }
    return bands;
  }, [days, rangeMonths]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [d, r, kinds] = await Promise.all([
          loadData(),
          loadCrossScheduleRows(),
          loadCrossWorkKinds().catch(() => [] as CrossWorkKind[]),
        ]);
        if (cancelled) return;
        setProjects((d?.projects ?? []).filter((p) => !p.deleted));
        setRows(r.map((row) => ({ ...row, crewColor: row.crewColor ?? "" })));
        setCustomKinds(kinds);
      } catch (e) {
        console.error("[CrossSchedule] load", e);
        if (!cancelled) {
          setLoadError(
            "読み込みに失敗しました。Supabase で supabase/cross_schedule.sql と supabase/cross_schedule_bars.sql を実行してください。"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!rangeStart || !rangeEnd) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await loadCrossScheduleBars(rangeStart, rangeEnd);
        if (!cancelled) setBars(list);
      } catch (e) {
        console.error("[CrossSchedule] load bars", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeStart, rangeEnd]);

  const projectById = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const groups = useMemo(() => {
    const byPid = new Map<string, CrossScheduleRow[]>();
    for (const r of rows) {
      const list = byPid.get(r.projectId) ?? [];
      list.push(r);
      byPid.set(r.projectId, list);
    }
    const pids = [...byPid.keys()].sort((a, b) => {
      const pa = projectById.get(a);
      const pb = projectById.get(b);
      const ma = pa?.managementNumber ?? "";
      const mb = pb?.managementNumber ?? "";
      if (ma !== mb) return ma.localeCompare(mb, "ja");
      return (pa?.name ?? "").localeCompare(pb?.name ?? "", "ja");
    });
    return pids.map((pid) => ({
      projectId: pid,
      project: projectById.get(pid) ?? null,
      rows: (byPid.get(pid) ?? []).slice().sort((x, y) => x.sortOrder - y.sortOrder),
    }));
  }, [rows, projectById]);

  const barsByRow = useMemo(() => {
    const m = new Map<string, CrossScheduleBar[]>();
    for (const b of bars) {
      const list = m.get(b.rowId) ?? [];
      list.push(b);
      m.set(b.rowId, list);
    }
    return m;
  }, [bars]);

  const projectsNotOnBoard = useMemo(() => {
    const onBoard = new Set(rows.map((r) => r.projectId));
    return projects
      .filter((p) => !p.archived && !onBoard.has(p.id))
      .sort((a, b) => (a.managementNumber ?? "").localeCompare(b.managementNumber ?? "", "ja"));
  }, [projects, rows]);

  const reportSaved = useCallback(() => {
    setSaveState("saved");
    setSaveErrorMsg(null);
    window.setTimeout(() => setSaveState("idle"), 1500);
  }, []);

  const reportError = useCallback((e: unknown) => {
    console.error("[CrossSchedule] save", e);
    setSaveState("error");
    setSaveErrorMsg(
      e instanceof Error && e.message === CROSS_VIEWER_FORBIDDEN_MSG
        ? e.message
        : e instanceof Error
          ? e.message
          : "保存に失敗しました"
    );
  }, []);

  const stepMonths = useCallback(
    (delta: number) => {
      let y = year;
      let m = month + delta;
      while (m < 0) {
        m += 12;
        y -= 1;
      }
      while (m > 11) {
        m -= 12;
        y += 1;
      }
      setYear(y);
      setMonth(m);
    },
    [year, month]
  );

  const goToday = useCallback(() => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
  }, []);

  const addRow = useCallback(
    async (projectId: string) => {
      if (readOnly) return;
      const same = rows.filter((r) => r.projectId === projectId);
      if (same.length >= MAX_CREWS_PER_PROJECT) {
        window.alert(`1案件あたり業者レーンは最大${MAX_CREWS_PER_PROJECT}までです。`);
        return;
      }
      const row: CrossScheduleRow = {
        id: genId(),
        projectId,
        crewName: "",
        crewColor: CREW_COLOR_PALETTE[same.length % CREW_COLOR_PALETTE.length],
        sortOrder: same.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1,
      };
      setRows((prev) => [...prev, row]);
      setSaveState("saving");
      try {
        await upsertCrossScheduleRow(row);
        reportSaved();
      } catch (e) {
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        reportError(e);
      }
    },
    [rows, readOnly, reportSaved, reportError]
  );

  const persistRow = useCallback(
    async (row: CrossScheduleRow) => {
      setSaveState("saving");
      try {
        await upsertCrossScheduleRow(row);
        reportSaved();
      } catch (e) {
        reportError(e);
      }
    },
    [reportSaved, reportError]
  );

  const updateCrew = useCallback(
    (rowId: string, patch: Partial<Pick<CrossScheduleRow, "crewName" | "crewColor">>) => {
      setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
      if (crewTimers.current[rowId]) clearTimeout(crewTimers.current[rowId]);
      crewTimers.current[rowId] = setTimeout(() => {
        const row = rowsRef.current.find((r) => r.id === rowId);
        if (row) void persistRow(row);
      }, 600);
    },
    [persistRow]
  );

  const removeRow = useCallback(
    async (rowId: string) => {
      if (readOnly) return;
      if (!window.confirm("この業者レーンを削除しますか？（期間バーも消えます）")) return;
      const backup = rows;
      const barsBackup = bars;
      setRows((prev) => prev.filter((r) => r.id !== rowId));
      setBars((prev) => prev.filter((b) => b.rowId !== rowId));
      setSaveState("saving");
      try {
        await deleteCrossScheduleRow(rowId);
        reportSaved();
      } catch (e) {
        setRows(backup);
        setBars(barsBackup);
        reportError(e);
      }
    },
    [rows, bars, readOnly, reportSaved, reportError]
  );

  const addProject = useCallback(async () => {
    if (!addProjectId || readOnly) return;
    await addRow(addProjectId);
    setAddProjectId("");
  }, [addProjectId, addRow, readOnly]);

  const persistBar = useCallback(
    async (bar: CrossScheduleBar) => {
      setSaveState("saving");
      try {
        await upsertCrossScheduleBar(bar);
        reportSaved();
      } catch (e) {
        reportError(e);
      }
    },
    [reportSaved, reportError]
  );

  const openBarEdit = useCallback((bar: CrossScheduleBar) => {
    setEditingBar({
      id: bar.id,
      rowId: bar.rowId,
      startDate: bar.startDate,
      endDate: bar.endDate,
      workKindId: bar.workKindId,
      label: bar.label,
      note: bar.note,
      plannedDays: bar.plannedDays != null ? String(bar.plannedDays) : "",
    });
  }, []);

  const createBarFromDrag = useCallback(
    async (rowId: string, d0: number, d1: number) => {
      if (readOnly) return;
      const a = Math.min(d0, d1);
      const b = Math.max(d0, d1);
      const start = days[a];
      const end = days[b];
      if (!start || !end) return;
      const kind = workKindById(workKinds, activeKindId) ?? workKinds[0];
      const cal = calendarDaysInclusive(start.date, end.date);
      const planned =
        kind?.kindKey === "rehab" || kind?.label === "管更生"
          ? Math.ceil(cal * 1.4)
          : null;
      const bar: CrossScheduleBar = {
        id: genId(),
        rowId,
        startDate: start.date,
        endDate: end.date,
        workKindId: kind?.id ?? "",
        label: "",
        note: "",
        plannedDays: planned,
      };
      setBars((prev) => [...prev, bar]);
      await persistBar(bar);
      openBarEdit(bar);
    },
    [days, activeKindId, workKinds, readOnly, persistBar, openBarEdit]
  );

  const saveBarEdit = useCallback(async () => {
    if (!editingBar || readOnly) return;
    let start = editingBar.startDate;
    let end = editingBar.endDate;
    if (end < start) [start, end] = [end, start];
    const plannedRaw = editingBar.plannedDays.trim();
    const plannedDays =
      plannedRaw === "" ? null : Math.max(1, Math.round(Number(plannedRaw)) || 1);
    const bar: CrossScheduleBar = {
      id: editingBar.id,
      rowId: editingBar.rowId,
      startDate: start,
      endDate: end,
      workKindId: editingBar.workKindId,
      label: editingBar.label.trim(),
      note: editingBar.note.trim(),
      plannedDays,
    };
    setBars((prev) => {
      const exists = prev.some((b) => b.id === bar.id);
      return exists ? prev.map((b) => (b.id === bar.id ? bar : b)) : [...prev, bar];
    });
    setEditingBar(null);
    await persistBar(bar);
  }, [editingBar, readOnly, persistBar]);

  const removeEditingBar = useCallback(async () => {
    if (!editingBar || readOnly) return;
    if (!window.confirm("この期間バーを削除しますか？")) return;
    const id = editingBar.id;
    setEditingBar(null);
    setBars((prev) => prev.filter((b) => b.id !== id));
    setSaveState("saving");
    try {
      await deleteCrossScheduleBar(id);
      reportSaved();
    } catch (e) {
      reportError(e);
    }
  }, [editingBar, readOnly, reportSaved, reportError]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const diAttr =
        el instanceof Element ? el.closest("[data-day-i]")?.getAttribute("data-day-i") : null;
      if (diAttr == null) return;
      const di = Number(diAttr);
      if (Number.isNaN(di)) return;
      setDrag((prev) => (prev ? { ...prev, endDi: di } : prev));
    };
    const onUp = () => {
      setDrag((prev) => {
        if (prev) void createBarFromDrag(prev.rowId, prev.startDi, prev.endDi);
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, createBarFromDrag]);

  const saveKind = useCallback(
    async (kind: CrossWorkKind) => {
      if (readOnly) return;
      const id = kind.id.startsWith("default:") ? genId() : kind.id;
      const saved: CrossWorkKind = { ...kind, id, custom: true };
      setCustomKinds((prev) => {
        const without = prev.filter((k) => k.label !== kind.label && k.id !== id);
        return [...without, saved];
      });
      setSaveState("saving");
      try {
        await upsertCrossWorkKind(saved as CrossWorkKind & { id: string });
        reportSaved();
      } catch (e) {
        reportError(e);
      }
    },
    [readOnly, reportSaved, reportError]
  );

  const removeKind = useCallback(
    async (kindId: string) => {
      if (readOnly || kindId.startsWith("default:")) return;
      setCustomKinds((prev) => prev.filter((k) => k.id !== kindId));
      setSaveState("saving");
      try {
        await deleteCrossWorkKind(kindId);
        reportSaved();
      } catch (e) {
        reportError(e);
      }
    },
    [readOnly, reportSaved, reportError]
  );

  const handleExportPdf = useCallback(async () => {
    const el = pdfAreaRef.current;
    if (!el) return;
    setPdfLoading(true);
    try {
      const canvas = await html2canvas(el, {
        scale: rangeMonths === 12 ? 1.25 : 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        ignoreElements: (node) =>
          node instanceof HTMLElement && node.classList.contains("cross-no-print"),
      });
      const imgData = canvas.toDataURL("image/png", 1.0);
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const aspect = canvas.height / canvas.width;
      const imgW = pageW * aspect <= pageH ? pageW : pageH / aspect;
      const imgH = imgW * aspect;
      pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH);
      pdf.save(`cross-schedule-${year}-${String(month + 1).padStart(2, "0")}-${rangeMonths}m.pdf`);
    } catch (e) {
      console.error("[CrossSchedule PDF]", e);
    } finally {
      setPdfLoading(false);
    }
  }, [year, month, rangeMonths]);

  const gridWidth = leftTotal + days.length * dayW;

  if (loading) {
    return <div style={{ padding: 24, color: "#64748b" }}>横断工程表を読み込み中…</div>;
  }
  if (loadError) {
    return (
      <div style={{ padding: 24, color: "#b91c1c", lineHeight: 1.6 }}>
        {loadError}
      </div>
    );
  }

  const editingCal =
    editingBar != null ? calendarDaysInclusive(editingBar.startDate, editingBar.endDate) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div
        className="cross-no-print"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          padding: "8px 4px",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <button type="button" onClick={() => stepMonths(-rangeMonths)} style={navBtn}>
          ‹
        </button>
        <strong style={{ fontSize: 15, minWidth: rangeMonths === 12 ? 72 : 160, textAlign: "center" }}>
          {year}年{month + 1}月
          {rangeMonths > 1
            ? ` 〜 ${days[days.length - 1]?.year}年${(days[days.length - 1]?.monthIndex ?? 0) + 1}月`
            : ""}
        </strong>
        <button type="button" onClick={() => stepMonths(rangeMonths)} style={navBtn}>
          ›
        </button>
        <button type="button" onClick={goToday} style={ghostBtn}>
          今日
        </button>

        <select
          value={rangeMonths}
          onChange={(e) => setRangeMonths(Number(e.target.value) as RangeMonths)}
          style={selectStyle}
          aria-label="表示期間"
        >
          <option value={1}>1ヶ月</option>
          <option value={3}>3ヶ月</option>
          <option value={12}>1年</option>
        </select>

        <span style={{ width: 1, height: 22, background: "#e2e8f0", margin: "0 4px" }} />

        <span style={{ fontSize: 12, color: "#64748b" }}>工種:</span>
        {workKinds.map((k) => {
          const on = activeKindId === k.id;
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => setActiveKindId(k.id)}
              title={`${k.label}（ドラッグで期間を塗る）`}
              style={{
                ...chipBtn,
                background: k.color,
                color: contrastFg(k.color),
                outline: on ? "2px solid #0f172a" : "2px solid transparent",
                outlineOffset: 1,
                opacity: on ? 1 : 0.75,
              }}
            >
              {k.label}
            </button>
          );
        })}
        <button type="button" onClick={() => setShowKindManager(true)} style={ghostBtn}>
          工種の色…
        </button>

        <span style={{ flex: 1 }} />

        {!readOnly && (
          <>
            <select
              value={addProjectId}
              onChange={(e) => setAddProjectId(e.target.value)}
              style={{ ...selectStyle, maxWidth: 200 }}
            >
              <option value="">案件を追加…</option>
              {projectsNotOnBoard.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.managementNumber ? `${p.managementNumber} ` : ""}
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void addProject()}
              disabled={!addProjectId}
              style={primaryBtn}
            >
              追加
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => void handleExportPdf()}
          disabled={pdfLoading}
          style={ghostBtn}
        >
          {pdfLoading ? "PDF…" : "PDF"}
        </button>

        <span
          style={{
            fontSize: 11,
            color: saveState === "error" ? "#b91c1c" : "#64748b",
            minWidth: 72,
          }}
        >
          {saveState === "saving" && "保存中…"}
          {saveState === "saved" && "保存済"}
          {saveState === "error" && (saveErrorMsg ?? "エラー")}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
        レーン上をドラッグして期間バーを作成。バーをクリックで日数・メモを編集。業者・工種ごとに色を固定します（人工・原価とは連動しません）。
      </p>

      <div
        style={{
          overflow: "auto",
          border: "1px solid #cbd5e1",
          borderRadius: 6,
          background: "#fff",
        }}
      >
        <div ref={pdfAreaRef} style={{ width: gridWidth, minWidth: "100%" }}>
          <div
            style={{
              display: "flex",
              position: "sticky",
              top: 0,
              zIndex: 5,
              background: "#f8fafc",
            }}
          >
            <div
              style={{
                width: leftTotal,
                minWidth: leftTotal,
                position: "sticky",
                left: 0,
                zIndex: 6,
                background: "#f1f5f9",
                borderBottom: "1px solid #cbd5e1",
                borderRight: "1px solid #cbd5e1",
                display: "flex",
                height: HEADER_H,
              }}
            >
              {leftCols.map((c) => (
                <div
                  key={c.key}
                  style={{
                    width: c.width,
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#475569",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 6px",
                    borderRight: "1px solid #e2e8f0",
                  }}
                >
                  {c.label}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", height: HEADER_H }}>
              <div style={{ display: "flex", height: 18 }}>
                {monthBands.map((b) => (
                  <div
                    key={b.key}
                    style={{
                      width: b.span * dayW,
                      fontSize: rangeMonths === 12 ? 10 : 11,
                      fontWeight: 600,
                      textAlign: "center",
                      borderRight: "1px solid #94a3b8",
                      borderBottom: "1px solid #e2e8f0",
                      background: "#e2e8f0",
                      color: "#334155",
                    }}
                  >
                    {b.label}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", height: HEADER_H - 18 }}>
                {days.map((d, di) => {
                  const isToday = d.date === today;
                  const weekend = d.dow === 0 || d.dow === 6;
                  return (
                    <div
                      key={d.date}
                      title={`${d.date}（${DOW[d.dow]}）`}
                      style={{
                        width: dayW,
                        fontSize: rangeMonths === 12 ? 8 : 10,
                        textAlign: "center",
                        lineHeight: 1.1,
                        borderRight:
                          d.day === 1 && di > 0 ? "1px solid #94a3b8" : "1px solid #e2e8f0",
                        background: isToday ? "#fef08a" : weekend ? "#f1f5f9" : "#fff",
                        color: d.dow === 0 ? "#dc2626" : d.dow === 6 ? "#2563eb" : "#334155",
                        paddingTop: 2,
                      }}
                    >
                      {rangeMonths === 12 ? (d.day === 1 || d.day % 5 === 0 ? d.day : "") : d.day}
                      {rangeMonths !== 12 && (
                        <div style={{ fontSize: 8, opacity: 0.75 }}>{DOW[d.dow]}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {groups.length === 0 ? (
            <div style={{ padding: 32, color: "#64748b", fontSize: 13 }}>
              上の「案件を追加」から案件を載せてください。1案件あたり最大{MAX_CREWS_PER_PROJECT}
              業者までレーンを追加できます。
            </div>
          ) : (
            groups.map((g) => {
              const p = g.project;
              const nameCol = leftCols.find((c) => c.key === "name")!;
              const clientCol = leftCols.find((c) => c.key === "client");
              const personCol = leftCols.find((c) => c.key === "person");
              const crewCol = leftCols.find((c) => c.key === "crew")!;
              const projectTitle = `${p?.managementNumber ? `${p.managementNumber} ` : ""}${
                p?.name ?? "(不明な案件)"
              }`;
              const lanesMinH = g.rows.length * LANE_H;

              return (
                <div key={g.projectId} style={{ borderBottom: "2px solid #94a3b8" }}>
                  <div style={{ display: "flex", alignItems: "stretch", minHeight: lanesMinH }}>
                    {/* 左固定：工事名などはレーン全体にまたがって折り返し表示 */}
                    <div
                      style={{
                        width: leftTotal,
                        minWidth: leftTotal,
                        position: "sticky",
                        left: 0,
                        zIndex: 3,
                        background: "#fff",
                        borderRight: "1px solid #cbd5e1",
                        display: "flex",
                        alignItems: "stretch",
                      }}
                    >
                      <div
                        title={projectTitle}
                        style={{
                          width: nameCol.width,
                          minWidth: nameCol.width,
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#0f172a",
                          padding: "6px 8px",
                          borderRight: "1px solid #e2e8f0",
                          borderBottom: "1px solid #e2e8f0",
                          background: "#f8fafc",
                          lineHeight: 1.35,
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                          display: "flex",
                          alignItems: "center",
                          boxSizing: "border-box",
                        }}
                      >
                        {p?.managementNumber ? (
                          <span>
                            <span style={{ display: "block", fontSize: 10, color: "#64748b", fontWeight: 600 }}>
                              {p.managementNumber}
                            </span>
                            <span>{p?.name ?? "(不明な案件)"}</span>
                          </span>
                        ) : (
                          <span>{p?.name ?? "(不明な案件)"}</span>
                        )}
                      </div>
                      {clientCol && (
                        <div
                          title={p?.client ?? ""}
                          style={{
                            width: clientCol.width,
                            minWidth: clientCol.width,
                            fontSize: 11,
                            padding: "6px 6px",
                            borderRight: "1px solid #e2e8f0",
                            borderBottom: "1px solid #e2e8f0",
                            color: "#475569",
                            lineHeight: 1.35,
                            whiteSpace: "normal",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                            display: "flex",
                            alignItems: "center",
                            boxSizing: "border-box",
                          }}
                        >
                          {p?.client ?? ""}
                        </div>
                      )}
                      {personCol && (
                        <div
                          title={p?.personInCharge ?? ""}
                          style={{
                            width: personCol.width,
                            minWidth: personCol.width,
                            fontSize: 11,
                            padding: "6px 6px",
                            borderRight: "1px solid #e2e8f0",
                            borderBottom: "1px solid #e2e8f0",
                            color: "#475569",
                            lineHeight: 1.35,
                            whiteSpace: "normal",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                            display: "flex",
                            alignItems: "center",
                            boxSizing: "border-box",
                          }}
                        >
                          {p?.personInCharge ?? ""}
                        </div>
                      )}
                      <div
                        style={{
                          width: crewCol.width,
                          minWidth: crewCol.width,
                          display: "flex",
                          flexDirection: "column",
                          borderBottom: "1px solid #e2e8f0",
                        }}
                      >
                        {g.rows.map((row) => {
                          const crewColor = crewColorForName(row.crewName, row.crewColor);
                          return (
                            <div
                              key={row.id}
                              style={{
                                flex: 1,
                                minHeight: LANE_H,
                                padding: "2px 4px",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                borderBottom: "1px solid #e2e8f0",
                                boxSizing: "border-box",
                              }}
                            >
                              <input
                                type="color"
                                value={crewColor}
                                disabled={readOnly}
                                title="業者の色"
                                onChange={(e) => updateCrew(row.id, { crewColor: e.target.value })}
                                style={{
                                  width: 18,
                                  height: 18,
                                  padding: 0,
                                  border: "1px solid #cbd5e1",
                                  borderRadius: 3,
                                  cursor: readOnly ? "default" : "pointer",
                                  flexShrink: 0,
                                }}
                              />
                              <input
                                type="text"
                                value={row.crewName}
                                disabled={readOnly}
                                placeholder="業者名"
                                onChange={(e) => updateCrew(row.id, { crewName: e.target.value })}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  fontSize: 11,
                                  border: "1px solid #e2e8f0",
                                  borderRadius: 3,
                                  padding: "2px 4px",
                                  borderLeft: `3px solid ${crewColor}`,
                                }}
                              />
                              {!readOnly && (
                                <button
                                  type="button"
                                  className="cross-no-print"
                                  title="レーン削除"
                                  onClick={() => void removeRow(row.id)}
                                  style={{
                                    border: "none",
                                    background: "transparent",
                                    color: "#94a3b8",
                                    cursor: "pointer",
                                    fontSize: 12,
                                    padding: 0,
                                    lineHeight: 1,
                                  }}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* タイムライン（業者レーンごと） */}
                    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                      {g.rows.map((row) => {
                        const crewColor = crewColorForName(row.crewName, row.crewColor);
                        const rowBars = barsByRow.get(row.id) ?? [];
                        return (
                          <div
                            key={row.id}
                            style={{
                              position: "relative",
                              width: days.length * dayW,
                              flex: 1,
                              minHeight: LANE_H,
                              borderBottom: "1px solid #e2e8f0",
                              background: "#fff",
                            }}
                          >
                            <div style={{ display: "flex", position: "absolute", inset: 0 }}>
                              {days.map((d, di) => {
                                const weekend = d.dow === 0 || d.dow === 6;
                                const inDrag =
                                  drag &&
                                  drag.rowId === row.id &&
                                  di >= Math.min(drag.startDi, drag.endDi) &&
                                  di <= Math.max(drag.startDi, drag.endDi);
                                return (
                                  <div
                                    key={d.date}
                                    data-day-i={di}
                                    onPointerDown={(e) => {
                                      if (readOnly || e.button !== 0) return;
                                      e.preventDefault();
                                      setDrag({ rowId: row.id, startDi: di, endDi: di });
                                    }}
                                    style={{
                                      width: dayW,
                                      height: "100%",
                                      borderRight:
                                        d.day === 1 && di > 0
                                          ? "1px solid #cbd5e1"
                                          : "1px solid #f1f5f9",
                                      background: inDrag
                                        ? "rgba(37,99,235,0.2)"
                                        : d.date === today
                                          ? "rgba(254,240,138,0.45)"
                                          : weekend
                                            ? "rgba(241,245,249,0.8)"
                                            : "transparent",
                                      cursor: readOnly ? "default" : "crosshair",
                                    }}
                                  />
                                );
                              })}
                            </div>

                            {rowBars.map((bar) => {
                              if (bar.endDate < rangeStart || bar.startDate > rangeEnd) return null;
                              const sIdx = dateIndex.get(bar.startDate);
                              const eIdx = dateIndex.get(bar.endDate);
                              const leftDi = sIdx == null || bar.startDate < rangeStart ? 0 : sIdx;
                              const rightDi =
                                eIdx == null || bar.endDate > rangeEnd ? days.length - 1 : eIdx;
                              const left = leftDi * dayW;
                              const width = Math.max(dayW, (rightDi - leftDi + 1) * dayW);
                              const kind = workKindById(workKinds, bar.workKindId);
                              const bg = kind?.color ?? "#90caf9";
                              const fg = contrastFg(bg);
                              const daysLabel = barDisplayDays(bar);
                              const titleText = bar.label || kind?.label || "作業";
                              const showText = width >= (rangeMonths === 12 ? 28 : 40);
                              return (
                                <button
                                  key={bar.id}
                                  type="button"
                                  title={`${titleText} ${bar.startDate}〜${bar.endDate}（${daysLabel}日）${
                                    bar.note ? `\n${bar.note}` : ""
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openBarEdit(bar);
                                  }}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  style={{
                                    position: "absolute",
                                    left: left + 1,
                                    top: 4,
                                    bottom: 4,
                                    width: width - 2,
                                    borderRadius: 4,
                                    border: `1px solid ${crewColor}`,
                                    background: bg,
                                    color: fg,
                                    fontSize: rangeMonths === 12 ? 9 : 11,
                                    fontWeight: 600,
                                    padding: "0 4px",
                                    overflow: "hidden",
                                    whiteSpace: "nowrap",
                                    textOverflow: "ellipsis",
                                    textAlign: "left",
                                    cursor: "pointer",
                                    zIndex: 2,
                                    boxShadow: "0 1px 2px rgba(15,23,42,0.12)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  {showText && (
                                    <>
                                      <span
                                        style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                                      >
                                        {titleText}
                                      </span>
                                      <span
                                        style={{
                                          marginLeft: "auto",
                                          flexShrink: 0,
                                          opacity: 0.95,
                                          fontVariantNumeric: "tabular-nums",
                                        }}
                                      >
                                        {daysLabel}日
                                      </span>
                                    </>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {!readOnly && g.rows.length < MAX_CREWS_PER_PROJECT && (
                    <div className="cross-no-print" style={{ display: "flex", height: 24 }}>
                      <div
                        style={{
                          width: leftTotal,
                          minWidth: leftTotal,
                          position: "sticky",
                          left: 0,
                          zIndex: 3,
                          background: "#f8fafc",
                          borderRight: "1px solid #e2e8f0",
                          paddingLeft: 8,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => void addRow(g.projectId)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#2563eb",
                            fontSize: 11,
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          ＋ 業者レーン（{g.rows.length}/{MAX_CREWS_PER_PROJECT}）
                        </button>
                      </div>
                      <div style={{ flex: 1, background: "#f8fafc" }} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {editingBar && (
        <div style={modalOverlay} onClick={() => setEditingBar(null)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>期間バー</h3>
            <label style={fieldLabel}>
              工種
              <select
                value={editingBar.workKindId}
                disabled={readOnly}
                onChange={(e) => setEditingBar({ ...editingBar, workKindId: e.target.value })}
                style={fieldInput}
              >
                {workKinds.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldLabel}>
              表示名（任意）
              <input
                value={editingBar.label}
                disabled={readOnly}
                placeholder="空なら工種名"
                onChange={(e) => setEditingBar({ ...editingBar, label: e.target.value })}
                style={fieldInput}
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ ...fieldLabel, flex: 1 }}>
                開始
                <input
                  type="date"
                  value={editingBar.startDate}
                  disabled={readOnly}
                  onChange={(e) => setEditingBar({ ...editingBar, startDate: e.target.value })}
                  style={fieldInput}
                />
              </label>
              <label style={{ ...fieldLabel, flex: 1 }}>
                終了
                <input
                  type="date"
                  value={editingBar.endDate}
                  disabled={readOnly}
                  onChange={(e) => setEditingBar({ ...editingBar, endDate: e.target.value })}
                  style={fieldInput}
                />
              </label>
            </div>
            <label style={fieldLabel}>
              目安日数（空＝暦日 {editingCal} 日）
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="number"
                  min={1}
                  value={editingBar.plannedDays}
                  disabled={readOnly}
                  placeholder={String(editingCal || "")}
                  onChange={(e) => setEditingBar({ ...editingBar, plannedDays: e.target.value })}
                  style={{ ...fieldInput, flex: 1 }}
                />
                {!readOnly && (
                  <>
                    <button
                      type="button"
                      style={ghostBtn}
                      title="暦日のまま"
                      onClick={() =>
                        setEditingBar({ ...editingBar, plannedDays: String(editingCal || 1) })
                      }
                    >
                      =暦
                    </button>
                    <button
                      type="button"
                      style={ghostBtn}
                      title="管更生目安（×1.4）"
                      onClick={() =>
                        setEditingBar({
                          ...editingBar,
                          plannedDays: String(Math.ceil((editingCal || 1) * 1.4)),
                        })
                      }
                    >
                      ×1.4
                    </button>
                  </>
                )}
              </div>
            </label>
            <label style={fieldLabel}>
              作業内容・メモ
              <textarea
                value={editingBar.note}
                disabled={readOnly}
                rows={4}
                placeholder="ここに作業内容を記入"
                onChange={(e) => setEditingBar({ ...editingBar, note: e.target.value })}
                style={{ ...fieldInput, resize: "vertical", minHeight: 80 }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "space-between" }}>
              {!readOnly && (
                <button type="button" onClick={() => void removeEditingBar()} style={dangerBtn}>
                  削除
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setEditingBar(null)} style={ghostBtn}>
                閉じる
              </button>
              {!readOnly && (
                <button type="button" onClick={() => void saveBarEdit()} style={primaryBtn}>
                  保存
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showKindManager && (
        <KindManagerModal
          kinds={workKinds}
          readOnly={readOnly}
          onClose={() => setShowKindManager(false)}
          onSave={(k) => void saveKind(k)}
          onDelete={(id) => void removeKind(id)}
        />
      )}
    </div>
  );
}

function KindManagerModal({
  kinds,
  readOnly,
  onClose,
  onSave,
  onDelete,
}: {
  kinds: CrossWorkKind[];
  readOnly: boolean;
  onClose: () => void;
  onSave: (k: CrossWorkKind) => void;
  onDelete: (id: string) => void;
}) {
  const [draftLabel, setDraftLabel] = useState("");
  const [draftColor, setDraftColor] = useState("#78909c");

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={{ ...modalCard, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>工種の色</h3>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b" }}>
          既定の工種は色を上書きできます。会社専用の工種も追加できます。
        </p>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {kinds.map((k) => (
            <li
              key={k.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                background: "#f8fafc",
                borderRadius: 6,
              }}
            >
              <input
                type="color"
                value={k.color}
                disabled={readOnly}
                onChange={(e) => onSave({ ...k, color: e.target.value })}
                style={{
                  width: 28,
                  height: 28,
                  border: "none",
                  cursor: readOnly ? "default" : "pointer",
                }}
              />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{k.label}</span>
              {k.custom && !readOnly && (
                <button type="button" onClick={() => onDelete(k.id)} style={ghostBtn}>
                  削除
                </button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <div style={{ display: "flex", gap: 6, marginTop: 14, alignItems: "center" }}>
            <input
              type="color"
              value={draftColor}
              onChange={(e) => setDraftColor(e.target.value)}
              style={{ width: 28, height: 28 }}
            />
            <input
              value={draftLabel}
              placeholder="新しい工種名"
              onChange={(e) => setDraftLabel(e.target.value)}
              style={{ ...fieldInput, flex: 1, marginTop: 0 }}
            />
            <button
              type="button"
              style={primaryBtn}
              disabled={!draftLabel.trim()}
              onClick={() => {
                const label = draftLabel.trim();
                if (!label) return;
                onSave({
                  id: genId(),
                  kindKey: "",
                  label,
                  color: draftColor,
                  sortOrder: 100 + kinds.length,
                  custom: true,
                });
                setDraftLabel("");
              }}
            >
              追加
            </button>
          </div>
        )}
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <button type="button" onClick={onClose} style={ghostBtn}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 6,
  width: 32,
  height: 32,
  cursor: "pointer",
  fontSize: 18,
  lineHeight: 1,
};
const ghostBtn: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 12,
  cursor: "pointer",
  color: "#334155",
};
const primaryBtn: React.CSSProperties = {
  border: "none",
  background: "#2563eb",
  color: "#fff",
  borderRadius: 6,
  padding: "5px 12px",
  fontSize: 12,
  cursor: "pointer",
  fontWeight: 600,
};
const dangerBtn: React.CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  borderRadius: 6,
  padding: "5px 12px",
  fontSize: 12,
  cursor: "pointer",
};
const chipBtn: React.CSSProperties = {
  border: "none",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 12,
  cursor: "pointer",
  fontWeight: 600,
};
const selectStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "4px 8px",
  fontSize: 12,
  background: "#fff",
};
const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 16,
};
const modalCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  padding: 20,
  width: "100%",
  maxWidth: 440,
  boxShadow: "0 20px 40px rgba(15,23,42,0.2)",
  maxHeight: "90vh",
  overflow: "auto",
};
const fieldLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
  color: "#475569",
  marginBottom: 10,
};
const fieldInput: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13,
  fontWeight: 400,
  color: "#0f172a",
  marginTop: 2,
};
