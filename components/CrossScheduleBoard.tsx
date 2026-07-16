"use client";

// ================================================================
// components/CrossScheduleBoard.tsx
// 横断工程表（日別ビュー）— 行 = 案件 × 施工班、列 = 日
// エクセルの横断工程表（四半期シート）をアプリ内で再現する
// ================================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type { Project } from "@/lib/utils";
import { loadData } from "@/lib/supabase/data";
import { genId } from "@/lib/constants";
import { useUserRole } from "@/lib/roles";
import {
  DEFAULT_MARK_DEFS,
  STICKY_COLORS,
  CELL_COLOR_PRESETS,
  mergeMarkDefs,
  markDefFromList,
  resolveCellColors,
} from "@/types/crossSchedule";
import type {
  CrossScheduleRow,
  CrossScheduleCell,
  CrossScheduleSticky,
  MarkDef,
} from "@/types/crossSchedule";
import {
  loadCrossScheduleRows,
  loadCrossScheduleCells,
  loadCrossScheduleMarks,
  loadCrossScheduleStickies,
  upsertCrossScheduleRow,
  deleteCrossScheduleRow,
  saveCrossScheduleCell,
  saveCrossScheduleCells,
  upsertCrossScheduleMark,
  deleteCrossScheduleMark,
  upsertCrossScheduleSticky,
  deleteCrossScheduleSticky,
  CROSS_VIEWER_FORBIDDEN_MSG,
} from "@/lib/crossScheduleStorage";

const MONTH_NAMES = "1月 2月 3月 4月 5月 6月 7月 8月 9月 10月 11月 12月".split(" ");
const DOW = ["日", "月", "火", "水", "木", "金", "土"];

type DayCol = {
  date: string; // YYYY-MM-DD
  day: number;
  monthIndex: number; // 0-11
  year: number;
  dow: number; // 0=日
};

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
      out.push({ date: ymd(y, m, d), day: d, monthIndex: m, year: y, dow: new Date(y, m, d).getDay() });
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

/** 入力モード: 詳細 / マーク / スパン / 消しゴム / 付箋 */
type PenMode =
  | { kind: "detail" }
  | { kind: "mark"; char: string }
  | { kind: "span" }
  | { kind: "erase" }
  | { kind: "sticky" };

const cellKey = (rowId: string, date: string) => `${rowId}|${date}`;

type GridPos = { ri: number; di: number };

type ClipCell = {
  mark: string;
  spanNo: string;
  note: string;
  colorBg: string;
  colorFg: string;
};

type ClipPayload = {
  h: number;
  w: number;
  /** 行優先。空セルは null */
  grid: (ClipCell | null)[][];
};

function rectRange(a: GridPos, b: GridPos) {
  return {
    r0: Math.min(a.ri, b.ri),
    r1: Math.max(a.ri, b.ri),
    d0: Math.min(a.di, b.di),
    d1: Math.max(a.di, b.di),
  };
}

const DAY_W = 26;
const LEFT_COLS = [
  { key: "name", label: "工事名", width: 150 },
  { key: "client", label: "元請", width: 92 },
  { key: "person", label: "担当者", width: 68 },
  { key: "crew", label: "施工班", width: 112 },
] as const;
const LEFT_TOTAL = LEFT_COLS.reduce((s, c) => s + c.width, 0);

export default function CrossScheduleBoard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<CrossScheduleRow[]>([]);
  const [cells, setCells] = useState<Record<string, CrossScheduleCell>>({});
  const [customMarks, setCustomMarks] = useState<MarkDef[]>([]);
  const [stickies, setStickies] = useState<CrossScheduleSticky[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [rangeMonths, setRangeMonths] = useState<1 | 3>(3);

  const [pen, setPen] = useState<PenMode>({ kind: "detail" });
  const [nextSpanNo, setNextSpanNo] = useState(1);
  const [paintColor, setPaintColor] = useState(CELL_COLOR_PRESETS[1]); // 青（予定っぽいデフォルト）
  const [stickyColor, setStickyColor] = useState<string>(STICKY_COLORS[0]);
  const [editing, setEditing] = useState<{ rowId: string; date: string } | null>(null);
  const [editingStickyId, setEditingStickyId] = useState<string | null>(null);
  const [showMarkManager, setShowMarkManager] = useState(false);
  const [addProjectId, setAddProjectId] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  /** 選択範囲（Excel風）— selA=アンカー, selB=対角 */
  const [selA, setSelA] = useState<GridPos | null>(null);
  const [selB, setSelB] = useState<GridPos | null>(null);
  const [clipNotice, setClipNotice] = useState<string | null>(null);

  const { role } = useUserRole();
  const readOnly = role === "viewer";
  const pdfAreaRef = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<ClipPayload | null>(null);
  const dragSelRef = useRef<{
    active: boolean;
    start: GridPos;
    end: GridPos;
    moved: boolean;
  } | null>(null);
  const today = todayStr();

  const markDefs = useMemo(() => mergeMarkDefs(customMarks), [customMarks]);
  const stickiesByCell = useMemo(() => {
    const m = new Map<string, CrossScheduleSticky[]>();
    for (const s of stickies) {
      const k = cellKey(s.rowId, s.date);
      const list = m.get(k) ?? [];
      list.push(s);
      m.set(k, list);
    }
    return m;
  }, [stickies]);

  const days = useMemo(() => buildDays(year, month, rangeMonths), [year, month, rangeMonths]);
  const rangeStart = days[0]?.date ?? "";
  const rangeEnd = days[days.length - 1]?.date ?? "";

  // ── 初期ロード（案件・行・マーク）────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [d, r, marks] = await Promise.all([
          loadData(),
          loadCrossScheduleRows(),
          loadCrossScheduleMarks().catch(() => [] as MarkDef[]),
        ]);
        if (cancelled) return;
        setProjects((d?.projects ?? []).filter((p) => !p.deleted));
        setRows(r);
        setCustomMarks(marks);
      } catch (e) {
        console.error("[CrossSchedule] load", e);
        if (!cancelled)
          setLoadError(
            "読み込みに失敗しました。Supabase で supabase/cross_schedule.sql が実行済みか確認してください。"
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── 表示範囲のセル・付箋を読み込み ────────────────────────────────
  useEffect(() => {
    if (!rangeStart || !rangeEnd) return;
    let cancelled = false;
    (async () => {
      try {
        const [list, stickyList] = await Promise.all([
          loadCrossScheduleCells(rangeStart, rangeEnd),
          loadCrossScheduleStickies(rangeStart, rangeEnd).catch(() => [] as CrossScheduleSticky[]),
        ]);
        if (cancelled) return;
        const map: Record<string, CrossScheduleCell> = {};
        for (const c of list) map[cellKey(c.rowId, c.date)] = c;
        setCells(map);
        setStickies(stickyList);
      } catch (e) {
        console.error("[CrossSchedule] load cells", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeStart, rangeEnd]);

  // ── 案件グループ ─────────────────────────────────────────────────
  const projectById = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  /** ボードに載っている案件（管理番号順）とその班行 */
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

  /** 表の行順（選択・コピペの座標系） */
  const flatRows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  const selectedTargets = useMemo(() => {
    if (!selA || !selB) return [] as { rowId: string; date: string; ri: number; di: number }[];
    const { r0, r1, d0, d1 } = rectRange(selA, selB);
    const out: { rowId: string; date: string; ri: number; di: number }[] = [];
    for (let ri = r0; ri <= r1; ri++) {
      const row = flatRows[ri];
      if (!row) continue;
      for (let di = d0; di <= d1; di++) {
        const day = days[di];
        if (!day) continue;
        out.push({ rowId: row.id, date: day.date, ri, di });
      }
    }
    return out;
  }, [selA, selB, flatRows, days]);

  const selectedCount = selectedTargets.length;
  const selectedKeySet = useMemo(() => {
    const s = new Set<string>();
    for (const t of selectedTargets) s.add(cellKey(t.rowId, t.date));
    return s;
  }, [selectedTargets]);
  const rowIndexById = useMemo(() => {
    const m = new Map<string, number>();
    flatRows.forEach((r, i) => m.set(r.id, i));
    return m;
  }, [flatRows]);

  const projectsNotOnBoard = useMemo(() => {
    const onBoard = new Set(rows.map((r) => r.projectId));
    return projects
      .filter((p) => !p.archived && !onBoard.has(p.id))
      .sort((a, b) => (a.managementNumber ?? "").localeCompare(b.managementNumber ?? "", "ja"));
  }, [projects, rows]);

  // ── 保存まわり ───────────────────────────────────────────────────
  const reportSaved = useCallback(() => {
    setSaveState("saved");
    setSaveErrorMsg(null);
    window.setTimeout(() => setSaveState("idle"), 1500);
  }, []);

  const reportError = useCallback((e: unknown) => {
    console.error("[CrossSchedule] save", e);
    setSaveState("error");
    setSaveErrorMsg(e instanceof Error && e.message === CROSS_VIEWER_FORBIDDEN_MSG ? e.message : "保存に失敗しました");
  }, []);

  const persistCell = useCallback(
    async (cell: CrossScheduleCell) => {
      setSaveState("saving");
      try {
        await saveCrossScheduleCell(cell);
        reportSaved();
      } catch (e) {
        reportError(e);
      }
    },
    [reportSaved, reportError]
  );

  const persistCells = useCallback(
    async (list: CrossScheduleCell[]) => {
      setSaveState("saving");
      try {
        await saveCrossScheduleCells(list);
        reportSaved();
      } catch (e) {
        reportError(e);
      }
    },
    [reportSaved, reportError]
  );

  const emptyCell = useCallback(
    (rowId: string, date: string): CrossScheduleCell => ({
      rowId,
      date,
      mark: "",
      spanNo: "",
      note: "",
      colorBg: "",
      colorFg: "",
    }),
    []
  );

  const applyCell = useCallback(
    (
      rowId: string,
      date: string,
      patch: Partial<Pick<CrossScheduleCell, "mark" | "spanNo" | "note" | "colorBg" | "colorFg">>
    ) => {
      const key = cellKey(rowId, date);
      setCells((prev) => {
        const cur = prev[key] ?? emptyCell(rowId, date);
        const next: CrossScheduleCell = { ...cur, ...patch };
        const out = { ...prev };
        if (!next.mark && !next.spanNo && !next.note && !next.colorBg) delete out[key];
        else out[key] = next;
        void persistCell(next);
        return out;
      });
    },
    [persistCell, emptyCell]
  );

  const applyCellsPatch = useCallback(
    (
      targets: { rowId: string; date: string }[],
      patchFor: (cur: CrossScheduleCell) => Partial<CrossScheduleCell>
    ) => {
      if (targets.length === 0) return;
      const nextList: CrossScheduleCell[] = [];
      setCells((prev) => {
        const out = { ...prev };
        for (const t of targets) {
          const key = cellKey(t.rowId, t.date);
          const cur = prev[key] ?? emptyCell(t.rowId, t.date);
          const next: CrossScheduleCell = { ...cur, ...patchFor(cur) };
          if (!next.mark && !next.spanNo && !next.note && !next.colorBg) delete out[key];
          else out[key] = next;
          nextList.push(next);
        }
        return out;
      });
      void persistCells(nextList);
    },
    [emptyCell, persistCells]
  );

  const fillSelectionWithPen = useCallback(
    (targets: { rowId: string; date: string }[], mode: PenMode = pen) => {
      if (readOnly || targets.length === 0) return;
      if (mode.kind === "erase") {
        applyCellsPatch(targets, () => ({
          mark: "",
          spanNo: "",
          note: "",
          colorBg: "",
          colorFg: "",
        }));
        return;
      }
      if (mode.kind === "span") {
        const n = String(nextSpanNo);
        applyCellsPatch(targets, () => ({ spanNo: n }));
        setNextSpanNo((x) => x + 1);
        return;
      }
      if (mode.kind === "mark") {
        applyCellsPatch(targets, (cur) => {
          if (targets.length === 1 && cur.mark === mode.char) {
            return { mark: "", colorBg: "", colorFg: "" };
          }
          return {
            mark: mode.char,
            colorBg: paintColor.bg,
            colorFg: paintColor.fg,
          };
        });
      }
    },
    [readOnly, pen, nextSpanNo, paintColor, applyCellsPatch]
  );

  const copySelection = useCallback(() => {
    if (!selA || !selB || selectedTargets.length === 0) return;
    const { r0, r1, d0, d1 } = rectRange(selA, selB);
    const h = r1 - r0 + 1;
    const w = d1 - d0 + 1;
    const grid: (ClipCell | null)[][] = [];
    for (let ri = r0; ri <= r1; ri++) {
      const row: (ClipCell | null)[] = [];
      for (let di = d0; di <= d1; di++) {
        const fr = flatRows[ri];
        const day = days[di];
        if (!fr || !day) {
          row.push(null);
          continue;
        }
        const c = cells[cellKey(fr.id, day.date)];
        if (!c || (!c.mark && !c.spanNo && !c.note && !c.colorBg)) {
          row.push(null);
        } else {
          row.push({
            mark: c.mark,
            spanNo: c.spanNo,
            note: c.note,
            colorBg: c.colorBg,
            colorFg: c.colorFg,
          });
        }
      }
      grid.push(row);
    }
    clipboardRef.current = { h, w, grid };
    setClipNotice(`${h}×${w} セルをコピーしました`);
    window.setTimeout(() => setClipNotice(null), 2000);
  }, [selA, selB, selectedTargets, flatRows, days, cells]);

  const pasteClipboard = useCallback(() => {
    if (readOnly) return;
    const clip = clipboardRef.current;
    if (!clip) {
      setClipNotice("コピーしたデータがありません");
      window.setTimeout(() => setClipNotice(null), 2000);
      return;
    }
    const origin = selA && selB ? { ri: Math.min(selA.ri, selB.ri), di: Math.min(selA.di, selB.di) } : selA;
    if (!origin) return;
    const targets: { rowId: string; date: string }[] = [];
    const values: ClipCell[] = [];
    for (let i = 0; i < clip.h; i++) {
      for (let j = 0; j < clip.w; j++) {
        const ri = origin.ri + i;
        const di = origin.di + j;
        const fr = flatRows[ri];
        const day = days[di];
        if (!fr || !day) continue;
        const src = clip.grid[i]?.[j] ?? null;
        targets.push({ rowId: fr.id, date: day.date });
        values.push(
          src ?? { mark: "", spanNo: "", note: "", colorBg: "", colorFg: "" }
        );
      }
    }
    if (targets.length === 0) return;
    const nextList: CrossScheduleCell[] = [];
    setCells((prev) => {
      const out = { ...prev };
      targets.forEach((t, idx) => {
        const v = values[idx];
        const next: CrossScheduleCell = {
          rowId: t.rowId,
          date: t.date,
          mark: v.mark,
          spanNo: v.spanNo,
          note: v.note,
          colorBg: v.colorBg,
          colorFg: v.colorFg,
        };
        const key = cellKey(t.rowId, t.date);
        if (!next.mark && !next.spanNo && !next.note && !next.colorBg) delete out[key];
        else out[key] = next;
        nextList.push(next);
      });
      return out;
    });
    void persistCells(nextList);
    setSelA(origin);
    setSelB({
      ri: Math.min(flatRows.length - 1, origin.ri + clip.h - 1),
      di: Math.min(days.length - 1, origin.di + clip.w - 1),
    });
    setClipNotice(`${targets.length} セルに貼り付けました`);
    window.setTimeout(() => setClipNotice(null), 2000);
  }, [readOnly, selA, selB, flatRows, days, persistCells]);

  const clearSelectionCells = useCallback(() => {
    if (readOnly || selectedTargets.length === 0) return;
    applyCellsPatch(selectedTargets, () => ({
      mark: "",
      spanNo: "",
      note: "",
      colorBg: "",
      colorFg: "",
    }));
  }, [readOnly, selectedTargets, applyCellsPatch]);

  const finishPointerSelect = useCallback(() => {
    const drag = dragSelRef.current;
    if (!drag?.active) return;
    const start = drag.start;
    const end = drag.end;
    const moved = drag.moved;
    dragSelRef.current = null;
    setSelA(start);
    setSelB(end);
    if (readOnly) return;

    const targets: { rowId: string; date: string }[] = [];
    const { r0, r1, d0, d1 } = rectRange(start, end);
    for (let ri = r0; ri <= r1; ri++) {
      for (let di = d0; di <= d1; di++) {
        const row = flatRows[ri];
        const day = days[di];
        if (row && day) targets.push({ rowId: row.id, date: day.date });
      }
    }

    if (pen.kind === "sticky") {
      if (!moved && targets[0]) {
        const t = targets[0];
        const sticky: CrossScheduleSticky = {
          id: genId(),
          rowId: t.rowId,
          date: t.date,
          body: "",
          color: stickyColor,
          offsetX: 8,
          offsetY: 8,
          zIndex: stickies.reduce((m, s) => Math.max(m, s.zIndex), 0) + 1,
        };
        setStickies((prev) => [...prev, sticky]);
        setEditingStickyId(sticky.id);
        setSaveState("saving");
        void upsertCrossScheduleSticky(sticky).then(reportSaved).catch(reportError);
      }
      return;
    }

    if (pen.kind === "mark" || pen.kind === "span" || pen.kind === "erase") {
      fillSelectionWithPen(targets);
    }
  }, [
    readOnly,
    pen,
    flatRows,
    days,
    stickyColor,
    stickies,
    fillSelectionWithPen,
    reportSaved,
    reportError,
  ]);

  useEffect(() => {
    const onUp = () => finishPointerSelect();
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [finishPointerSelect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (editing || showMarkManager || editingStickyId) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !readOnly) {
        e.preventDefault();
        clearSelectionCells();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    editing,
    showMarkManager,
    editingStickyId,
    copySelection,
    pasteClipboard,
    clearSelectionCells,
    readOnly,
  ]);

  const onCellMouseDown = useCallback(
    (ri: number, di: number, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setEditingStickyId(null);
      const pos = { ri, di };
      if (e.shiftKey && selA) {
        setSelB(pos);
        dragSelRef.current = null;
        return;
      }
      setSelA(pos);
      setSelB(pos);
      dragSelRef.current = { active: true, start: pos, end: pos, moved: false };
    },
    [selA]
  );

  const onCellMouseEnter = useCallback((ri: number, di: number) => {
    const drag = dragSelRef.current;
    if (!drag?.active) return;
    const pos = { ri, di };
    if (ri !== drag.start.ri || di !== drag.start.di) drag.moved = true;
    drag.end = pos;
    setSelB(pos);
  }, []);

  const onCellDoubleClick = useCallback(
    (rowId: string, date: string) => {
      if (readOnly) return;
      setEditing({ rowId, date });
    },
    [readOnly]
  );

  const selectMarkPen = useCallback(
    (char: string) => {
      const mode: PenMode = { kind: "mark", char };
      setPen(mode);
      if (selectedCount >= 2) fillSelectionWithPen(selectedTargets, mode);
    },
    [selectedCount, selectedTargets, fillSelectionWithPen]
  );

  const selectErasePen = useCallback(() => {
    const mode: PenMode = { kind: "erase" };
    setPen(mode);
    if (selectedCount >= 2) fillSelectionWithPen(selectedTargets, mode);
  }, [selectedCount, selectedTargets, fillSelectionWithPen]);

  const selectSpanPen = useCallback(() => {
    const mode: PenMode = { kind: "span" };
    setPen(mode);
    if (selectedCount >= 2) fillSelectionWithPen(selectedTargets, mode);
  }, [selectedCount, selectedTargets, fillSelectionWithPen]);

  const persistSticky = useCallback(
    async (sticky: CrossScheduleSticky) => {
      setSaveState("saving");
      try {
        await upsertCrossScheduleSticky(sticky);
        reportSaved();
      } catch (e) {
        reportError(e);
      }
    },
    [reportSaved, reportError]
  );

  const updateSticky = useCallback(
    (id: string, patch: Partial<CrossScheduleSticky>, persist = true) => {
      setStickies((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
        const updated = next.find((s) => s.id === id);
        if (persist && updated) void persistSticky(updated);
        return next;
      });
    },
    [persistSticky]
  );

  const removeSticky = useCallback(
    async (id: string) => {
      const backup = stickies;
      setStickies((prev) => prev.filter((s) => s.id !== id));
      if (editingStickyId === id) setEditingStickyId(null);
      setSaveState("saving");
      try {
        await deleteCrossScheduleSticky(id);
        reportSaved();
      } catch (e) {
        setStickies(backup);
        reportError(e);
      }
    },
    [stickies, editingStickyId, reportSaved, reportError]
  );

  const saveMark = useCallback(
    async (mark: MarkDef & { id: string }) => {
      setSaveState("saving");
      try {
        await upsertCrossScheduleMark(mark);
        setCustomMarks((prev) => {
          const i = prev.findIndex((m) => m.id === mark.id);
          if (i >= 0) {
            const next = [...prev];
            next[i] = { ...mark, custom: true };
            return next;
          }
          return [...prev, { ...mark, custom: true }];
        });
        reportSaved();
      } catch (e) {
        reportError(e);
      }
    },
    [reportSaved, reportError]
  );

  const removeMark = useCallback(
    async (markId: string) => {
      setSaveState("saving");
      try {
        await deleteCrossScheduleMark(markId);
        setCustomMarks((prev) => prev.filter((m) => m.id !== markId));
        reportSaved();
      } catch (e) {
        reportError(e);
      }
    },
    [reportSaved, reportError]
  );

  // ── 行操作 ───────────────────────────────────────────────────────
  const addRow = useCallback(
    async (projectId: string) => {
      const same = rows.filter((r) => r.projectId === projectId);
      const row: CrossScheduleRow = {
        id: genId(),
        projectId,
        crewName: "",
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
    [rows, reportSaved, reportError]
  );

  const crewSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const rowsRef = useRef<CrossScheduleRow[]>([]);
  rowsRef.current = rows;

  const updateCrewName = useCallback(
    (rowId: string, crewName: string) => {
      setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, crewName } : r)));
      if (crewSaveTimers.current[rowId]) clearTimeout(crewSaveTimers.current[rowId]);
      crewSaveTimers.current[rowId] = setTimeout(async () => {
        const row = rowsRef.current.find((r) => r.id === rowId);
        if (!row) return;
        setSaveState("saving");
        try {
          await upsertCrossScheduleRow(row);
          reportSaved();
        } catch (e) {
          reportError(e);
        }
      }, 700);
    },
    [reportSaved, reportError]
  );

  const removeRow = useCallback(
    async (rowId: string) => {
      if (!window.confirm("この班行を削除しますか？（入力済みの日別セルも消えます）")) return;
      const backup = rows;
      setRows((prev) => prev.filter((r) => r.id !== rowId));
      setSaveState("saving");
      try {
        await deleteCrossScheduleRow(rowId);
        reportSaved();
      } catch (e) {
        setRows(backup);
        reportError(e);
      }
    },
    [rows, reportSaved, reportError]
  );

  const addProject = useCallback(async () => {
    if (!addProjectId) return;
    await addRow(addProjectId);
    setAddProjectId("");
  }, [addProjectId, addRow]);

  // ── PDF出力 ──────────────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    const el = pdfAreaRef.current;
    if (!el) return;
    setPdfLoading(true);
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
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
      alert("PDFの作成に失敗しました");
    } finally {
      setPdfLoading(false);
    }
  }, [year, month, rangeMonths]);

  // ── 月ヘッダー（colSpan 用）──────────────────────────────────────
  const monthSpans = useMemo(() => {
    const out: { label: string; count: number }[] = [];
    for (const d of days) {
      const label = `${d.year}年${MONTH_NAMES[d.monthIndex]}`;
      const last = out[out.length - 1];
      if (last && last.label === label) last.count += 1;
      else out.push({ label, count: 1 });
    }
    return out;
  }, [days]);

  const stepMonths = useCallback(
    (delta: number) => {
      let m = month + delta;
      let y = year;
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

  // ── セル描画 ─────────────────────────────────────────────────────
  const renderDayCell = (
    row: CrossScheduleRow,
    d: DayCol,
    project: Project | null,
    ri: number,
    di: number
  ) => {
    const cell = cells[cellKey(row.id, d.date)];
    const def = cell?.mark ? markDefFromList(cell.mark, markDefs) : null;
    const cellStickies = stickiesByCell.get(cellKey(row.id, d.date)) ?? [];
    const selected = selectedKeySet.has(cellKey(row.id, d.date));
    const style: React.CSSProperties = {
      width: DAY_W,
      minWidth: DAY_W,
      maxWidth: DAY_W,
      height: 26,
      padding: 0,
      textAlign: "center",
      fontSize: 11,
      fontWeight: 700,
      cursor: readOnly ? "default" : "cell",
      position: "relative",
      overflow: "visible",
      borderRight: `1px solid ${d.day === new Date(d.year, d.monthIndex + 1, 0).getDate() ? "#90a4ae" : "#e0e6ed"}`,
      borderBottom: "1px solid #e0e6ed",
      userSelect: "none",
    };

    // 背景の優先順: セル色（マーク等） > 週末 > 工期外 > 白
    let bg = "#fff";
    let fg = "#1a2535";
    const inKoki =
      (!project?.startDate || d.date >= project.startDate) &&
      (!project?.endDate || d.date <= project.endDate);
    if (!inKoki) bg = "#f1f3f5";
    if (d.dow === 0) bg = "#ffebee";
    if (d.dow === 6) bg = "#e8f1fb";
    const painted = resolveCellColors(cell, markDefs);
    if (painted) {
      bg = painted.bg;
      fg = painted.fg;
    }
    style.background = bg;
    style.color = fg;
    if (selected) {
      style.outline = "2px solid #1565c0";
      style.outlineOffset = -2;
      style.zIndex = 1;
    }
    if (d.date === today) style.boxShadow = selected ? undefined : "inset 0 0 0 2px #f59e0b";
    if (project?.endDate && d.date === project.endDate) style.borderRight = "2px solid #c62828";

    const text = cell?.spanNo || cell?.mark || "";
    const tipParts: string[] = [];
    if (cell?.spanNo) tipParts.push(`スパン ${cell.spanNo}`);
    if (cell?.mark) tipParts.push(def ? `${def.char}（${def.label}）` : cell.mark);
    if (cell?.note) tipParts.push(cell.note);
    if (cellStickies.length) tipParts.push(`付箋 ${cellStickies.length}件`);
    if (project?.endDate && d.date === project.endDate) tipParts.push("工期末");
    const title = tipParts.length ? `${d.date}\n${tipParts.join("\n")}` : d.date;

    return (
      <td
        key={d.date}
        style={style}
        title={title}
        onMouseDown={(e) => onCellMouseDown(ri, di, e)}
        onMouseEnter={() => onCellMouseEnter(ri, di)}
        onDoubleClick={() => onCellDoubleClick(row.id, d.date)}
      >
        {text}
        {cell?.note ? (
          <span
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: 0,
              height: 0,
              borderTop: "6px solid #c62828",
              borderLeft: "6px solid transparent",
            }}
          />
        ) : null}
        {cellStickies.map((s) => (
          <StickyNoteView
            key={s.id}
            sticky={s}
            readOnly={readOnly}
            selected={editingStickyId === s.id}
            onSelect={() => setEditingStickyId(s.id)}
            onChange={(patch, persist) => updateSticky(s.id, patch, persist)}
            onRemove={() => void removeSticky(s.id)}
          />
        ))}
      </td>
    );
  };

  // ── レンダリング ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#4a6280" }}>読み込み中…</div>
    );
  }
  if (loadError) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#c62828", fontSize: 13 }}>{loadError}</div>
    );
  }

  const leftCellBase: React.CSSProperties = {
    borderRight: "1px solid #d0d8e4",
    borderBottom: "1px solid #e0e6ed",
    padding: "2px 6px",
    fontSize: 12,
    background: "#fff",
    position: "sticky",
    zIndex: 2,
  };
  const leftOffsets = LEFT_COLS.reduce<number[]>((acc, c, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + LEFT_COLS[i - 1].width);
    return acc;
  }, []);

  const editingCell = editing ? cells[cellKey(editing.rowId, editing.date)] : null;
  const editingRow = editing ? rows.find((r) => r.id === editing.rowId) : null;
  const editingProject = editingRow ? projectById.get(editingRow.projectId) : null;

  return (
    <div style={{ padding: "0 16px 24px" }}>
      {/* ── 操作バー ── */}
      <div
        className="cross-no-print"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          margin: "12px 0",
          background: "#fff",
          padding: 10,
          borderRadius: 8,
          border: "1px solid #d0d8e4",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => stepMonths(-rangeMonths)} style={navBtn}>
            ◀ 前へ
          </button>
          <span style={{ fontWeight: 700, color: "#1565c0", fontFamily: "IBM Plex Mono, monospace", minWidth: 150, textAlign: "center" }}>
            {year}年{month + 1}月
            {rangeMonths > 1 ? ` 〜 ${days[days.length - 1].year}年${days[days.length - 1].monthIndex + 1}月` : ""}
          </span>
          <button type="button" onClick={() => stepMonths(rangeMonths)} style={navBtn}>
            次へ ▶
          </button>
          <button
            type="button"
            onClick={() => {
              const t = new Date();
              setYear(t.getFullYear());
              setMonth(t.getMonth());
            }}
            style={navBtn}
          >
            今月
          </button>
          <select
            value={rangeMonths}
            onChange={(e) => setRangeMonths(Number(e.target.value) as 1 | 3)}
            style={{ padding: "5px 10px", borderRadius: 4, border: "1px solid #d0d8e4", fontSize: 12, fontFamily: "inherit", background: "#fff", cursor: "pointer" }}
            aria-label="表示する月数"
          >
            <option value={1}>1か月</option>
            <option value={3}>四半期（3か月）</option>
          </select>
          <span style={{ fontSize: 11, color: "#90a4ae" }}>|</span>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={pdfLoading}
            style={{ ...navBtn, border: "1px solid #8b5cf6", background: "#f5f3ff", color: "#8b5cf6" }}
          >
            {pdfLoading ? "PDF作成中…" : "PDF（A3横）"}
          </button>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {saveState === "saving" && <span style={{ fontSize: 11, color: "#4a6280" }}>保存中…</span>}
            {saveState === "saved" && <span style={{ fontSize: 11, color: "#2e7d32" }}>保存しました</span>}
            {saveState === "error" && (
              <span style={{ fontSize: 11, color: "#c62828" }}>{saveErrorMsg ?? "保存エラー"}</span>
            )}
          </div>
        </div>

        {/* ── 入力パレット ── */}
        {!readOnly && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid #e8ecf2" }}>
            <span style={{ fontSize: 11, color: "#607d8b", fontWeight: 600 }}>セル入力</span>
            <PenButton
              active={pen.kind === "detail"}
              onClick={() => setPen({ kind: "detail" })}
              label="選択"
              title="ドラッグ／Shift+クリックで範囲選択。ダブルクリックで詳細編集。Ctrl+C / Ctrl+V でコピペ"
            />
            {markDefs.map((m) => (
              <PenButton
                key={m.char}
                active={pen.kind === "mark" && pen.char === m.char}
                onClick={() => selectMarkPen(m.char)}
                label={`${m.char} ${m.label}`}
                title={`ドラッグ／クリックで「${m.char}」を塗ります。複数選択中なら一気に塗ります`}
              />
            ))}
            {(pen.kind === "mark" || pen.kind === "detail") && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
                <span style={{ fontSize: 11, color: "#607d8b" }}>塗り色</span>
                {CELL_COLOR_PRESETS.map((p) => (
                  <button
                    key={p.bg}
                    type="button"
                    aria-label={`塗り色 ${p.label}`}
                    title={p.label}
                    onClick={() => {
                      setPaintColor(p);
                      if (selectedCount >= 1 && pen.kind === "mark") {
                        applyCellsPatch(selectedTargets, () => ({
                          mark: pen.char,
                          colorBg: p.bg,
                          colorFg: p.fg,
                        }));
                      }
                    }}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 3,
                      background: p.bg,
                      border: paintColor.bg === p.bg ? "2px solid #1a2535" : "1px solid #b0bec5",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                ))}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowMarkManager(true)}
              title="マーク項目の追加"
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px dashed #90a4ae",
                background: "#fff",
                color: "#4a6280",
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "inherit",
              }}
            >
              ＋項目
            </button>
            <PenButton
              active={pen.kind === "span"}
              onClick={selectSpanPen}
              label="番号"
              title="選択範囲／ドラッグした範囲にスパン番号を入れます"
            />
            {pen.kind === "span" && (
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#607d8b" }}>
                次の番号
                <input
                  type="number"
                  min={1}
                  value={nextSpanNo}
                  onChange={(e) => setNextSpanNo(Math.max(1, Number(e.target.value) || 1))}
                  style={{ width: 56, padding: "3px 6px", borderRadius: 4, border: "1px solid #d0d8e4", fontFamily: "inherit", fontSize: 12 }}
                />
              </label>
            )}
            <PenButton
              active={pen.kind === "sticky"}
              onClick={() => setPen({ kind: "sticky" })}
              label="付箋"
              title="クリックしたセルに付箋メモを貼ります。ドラッグで移動できます"
              bg="#fff59d"
              fg="#5d4037"
            />
            {pen.kind === "sticky" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {STICKY_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`付箋色 ${c}`}
                    onClick={() => setStickyColor(c)}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 3,
                      background: c,
                      border: stickyColor === c ? "2px solid #1a2535" : "1px solid #b0bec5",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                ))}
              </span>
            )}
            <PenButton
              active={pen.kind === "erase"}
              onClick={selectErasePen}
              label="消す"
              title="選択範囲／ドラッグした範囲のマーク・番号・注記を消します"
            />
            <span style={{ fontSize: 11, color: "#90a4ae" }}>|</span>
            <button
              type="button"
              onClick={copySelection}
              disabled={selectedCount === 0}
              style={{ ...navBtn, opacity: selectedCount ? 1 : 0.5 }}
              title="Ctrl+C"
            >
              コピー
            </button>
            <button
              type="button"
              onClick={pasteClipboard}
              style={navBtn}
              title="Ctrl+V（選択の左上から貼り付け）"
            >
              貼り付け
            </button>
            {selectedCount > 0 && (
              <span style={{ fontSize: 11, color: "#1565c0", fontWeight: 600 }}>
                {selectedCount}セル選択中
              </span>
            )}
            {clipNotice && <span style={{ fontSize: 11, color: "#2e7d32" }}>{clipNotice}</span>}
            <span style={{ fontSize: 10, color: "#90a4ae", width: "100%" }}>
              ドラッグで範囲選択／Shift+クリックで拡張／Ctrl+C・Vでコピペ／Deleteで消去／ダブルクリックで詳細
            </span>
          </div>
        )}

        {/* ── 案件追加 ── */}
        {!readOnly && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid #e8ecf2" }}>
            <span style={{ fontSize: 11, color: "#607d8b", fontWeight: 600 }}>案件を追加</span>
            <select
              value={addProjectId}
              onChange={(e) => setAddProjectId(e.target.value)}
              style={{ padding: "5px 10px", borderRadius: 4, border: "1px solid #d0d8e4", fontSize: 12, fontFamily: "inherit", background: "#fff", maxWidth: 360 }}
              aria-label="横断工程表に追加する案件"
            >
              <option value="">案件を選択…</option>
              {projectsNotOnBoard.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.managementNumber ? `${p.managementNumber} ` : ""}
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addProject}
              disabled={!addProjectId}
              style={{ ...navBtn, border: "1px solid #1565c0", background: addProjectId ? "#e3f2fd" : "#f5f7fa", color: "#1565c0", cursor: addProjectId ? "pointer" : "default" }}
            >
              ＋ 追加
            </button>
            <span style={{ fontSize: 11, color: "#90a4ae" }}>
              追加すると班行が1行できます。班行は工事名セルの「＋班」で増やせます。
            </span>
          </div>
        )}
        {readOnly && (
          <div style={{ fontSize: 11, color: "#c62828" }}>{CROSS_VIEWER_FORBIDDEN_MSG}</div>
        )}
      </div>

      {/* ── 本体テーブル ── */}
      <div
        ref={pdfAreaRef}
        onClick={() => setEditingStickyId(null)}
        style={{ background: "#fff", borderRadius: 8, border: "1px solid #d0d8e4", overflow: "auto", maxHeight: "calc(100vh - 210px)" }}
      >
        <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: LEFT_TOTAL + days.length * DAY_W }}>
          <thead>
            {/* 月ヘッダー */}
            <tr>
              {LEFT_COLS.map((c, i) => (
                <th
                  key={c.key}
                  style={{
                    ...headCell,
                    width: c.width,
                    minWidth: c.width,
                    left: leftOffsets[i],
                    zIndex: 5,
                    top: 0,
                  }}
                  rowSpan={2}
                >
                  {c.label}
                </th>
              ))}
              {monthSpans.map((m) => (
                <th key={m.label} colSpan={m.count} style={{ ...headCell, top: 0, zIndex: 3, background: "#e3f2fd", color: "#1565c0" }}>
                  {m.label}
                </th>
              ))}
            </tr>
            {/* 日ヘッダー */}
            <tr>
              {days.map((d) => (
                <th
                  key={d.date}
                  style={{
                    ...headCell,
                    top: 25,
                    zIndex: 3,
                    width: DAY_W,
                    minWidth: DAY_W,
                    padding: "1px 0",
                    fontSize: 10,
                    background: d.dow === 0 ? "#ffebee" : d.dow === 6 ? "#e8f1fb" : "#f5f7fa",
                    color: d.dow === 0 ? "#c62828" : d.dow === 6 ? "#1565c0" : "#4a6280",
                    boxShadow: d.date === today ? "inset 0 0 0 2px #f59e0b" : undefined,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{d.day}</div>
                  <div style={{ fontSize: 8 }}>{DOW[d.dow]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={LEFT_COLS.length + days.length} style={{ padding: 24, textAlign: "center", color: "#90a4ae", fontSize: 13 }}>
                  まだ案件がありません。上の「案件を追加」から選んでください。
                </td>
              </tr>
            )}
            {groups.map((g) =>
              g.rows.map((row, ri) => (
                <tr key={row.id}>
                  {ri === 0 && (
                    <>
                      <td rowSpan={g.rows.length} style={{ ...leftCellBase, left: leftOffsets[0], width: LEFT_COLS[0].width, minWidth: LEFT_COLS[0].width, fontWeight: 700, verticalAlign: "top", borderBottom: "1px solid #b8c4d4" }}>
                        <div>{g.project?.name ?? "（削除済み案件）"}</div>
                        {g.project?.managementNumber && (
                          <div style={{ fontSize: 10, color: "#90a4ae", fontWeight: 400 }}>{g.project.managementNumber}</div>
                        )}
                        {!readOnly && (
                          <button
                            type="button"
                            className="cross-no-print"
                            onClick={() => addRow(g.projectId)}
                            style={{ marginTop: 4, padding: "2px 8px", borderRadius: 4, border: "1px dashed #90a4ae", background: "#fff", color: "#4a6280", cursor: "pointer", fontSize: 10 }}
                          >
                            ＋班
                          </button>
                        )}
                      </td>
                      <td rowSpan={g.rows.length} style={{ ...leftCellBase, left: leftOffsets[1], width: LEFT_COLS[1].width, minWidth: LEFT_COLS[1].width, verticalAlign: "top", color: "#4a6280", borderBottom: "1px solid #b8c4d4" }}>
                        {g.project?.client ?? ""}
                      </td>
                      <td rowSpan={g.rows.length} style={{ ...leftCellBase, left: leftOffsets[2], width: LEFT_COLS[2].width, minWidth: LEFT_COLS[2].width, verticalAlign: "top", color: "#4a6280", borderBottom: "1px solid #b8c4d4" }}>
                        {g.project?.personInCharge ?? ""}
                      </td>
                    </>
                  )}
                  <td
                    style={{
                      ...leftCellBase,
                      left: leftOffsets[3],
                      width: LEFT_COLS[3].width,
                      minWidth: LEFT_COLS[3].width,
                      padding: "0 2px",
                      borderBottom: ri === g.rows.length - 1 ? "1px solid #b8c4d4" : "1px solid #e0e6ed",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <input
                        value={row.crewName}
                        onChange={(e) => updateCrewName(row.id, e.target.value)}
                        placeholder="班名"
                        disabled={readOnly}
                        style={{ width: "100%", border: "none", outline: "none", fontSize: 12, fontFamily: "inherit", background: "transparent", padding: "4px 4px", color: "#1a2535" }}
                        aria-label={`${g.project?.name ?? ""}の施工班名`}
                      />
                      {!readOnly && (
                        <button
                          type="button"
                          className="cross-no-print"
                          onClick={() => removeRow(row.id)}
                          title="この班行を削除"
                          style={{ border: "none", background: "transparent", color: "#c62828", cursor: "pointer", fontSize: 12, padding: "0 2px" }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                  {days.map((d, di) =>
                    renderDayCell(row, d, g.project, rowIndexById.get(row.id) ?? 0, di)
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── 凡例 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8, fontSize: 11, color: "#4a6280" }}>
        <span style={{ fontWeight: 600 }}>凡例:</span>
        {markDefs.map((m) => (
          <span key={m.char} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                background: "#fff",
                color: "#1a2535",
                border: "1px solid #b0bec5",
                fontSize: 10,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {m.char}
            </span>
            {m.label}
          </span>
        ))}
        <span style={{ fontSize: 10, color: "#90a4ae" }}>（色はセルごとに「塗り色」で指定）</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 16, height: 16, borderRadius: 3, border: "2px solid #c62828", boxSizing: "border-box" }} />
          工期末（案件の終了日）
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 0, height: 0, borderTop: "8px solid #c62828", borderLeft: "8px solid transparent" }} />
          注記あり（セルにカーソルで表示）
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 16, height: 12, borderRadius: 2, background: "#fff59d", border: "1px solid #f0c040", boxShadow: "1px 1px 0 rgba(0,0,0,.08)" }} />
          付箋メモ
        </span>
      </div>

      {/* ── セル詳細エディタ ── */}
      {editing && !readOnly && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setEditing(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 10, padding: 18, width: 360, maxWidth: "92vw", boxShadow: "0 8px 30px rgba(0,0,0,.18)" }}
          >
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
              {editingProject?.name ?? ""} {editingRow?.crewName ? `／${editingRow.crewName}` : ""}
            </div>
            <div style={{ fontSize: 12, color: "#4a6280", marginBottom: 10 }}>{editing.date}</div>

            <div style={{ fontSize: 11, color: "#607d8b", fontWeight: 600, marginBottom: 4 }}>マーク</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
              {markDefs.map((m) => {
                const active = editingCell?.mark === m.char;
                return (
                  <button
                    key={m.char}
                    type="button"
                    onClick={() =>
                      applyCell(editing.rowId, editing.date, {
                        mark: active ? "" : m.char,
                        colorBg: active ? "" : paintColor.bg,
                        colorFg: active ? "" : paintColor.fg,
                      })
                    }
                    style={{
                      padding: "4px 8px",
                      borderRadius: 4,
                      border: active ? "2px solid #1a2535" : "1px solid #d0d8e4",
                      background: active
                        ? editingCell?.colorBg || paintColor.bg
                        : "#fff",
                      color: active
                        ? editingCell?.colorFg || paintColor.fg
                        : "#4a6280",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {m.char}
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 11, color: "#607d8b", fontWeight: 600, marginBottom: 4 }}>セルの色</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
              {CELL_COLOR_PRESETS.map((p) => {
                const active = (editingCell?.colorBg || paintColor.bg) === p.bg;
                return (
                  <button
                    key={p.bg}
                    type="button"
                    title={p.label}
                    onClick={() => {
                      setPaintColor(p);
                      if (editingCell?.mark || editingCell?.spanNo) {
                        applyCell(editing.rowId, editing.date, {
                          colorBg: p.bg,
                          colorFg: p.fg,
                        });
                      }
                    }}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 3,
                      background: p.bg,
                      border: active ? "2px solid #1a2535" : "1px solid #b0bec5",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                );
              })}
              {editingCell?.colorBg && (
                <button
                  type="button"
                  onClick={() => applyCell(editing.rowId, editing.date, { colorBg: "", colorFg: "" })}
                  style={{ fontSize: 10, border: "1px solid #d0d8e4", background: "#fff", borderRadius: 4, padding: "3px 8px", cursor: "pointer", color: "#607d8b" }}
                >
                  色をクリア
                </button>
              )}
            </div>

            <label style={{ display: "block", fontSize: 11, color: "#607d8b", fontWeight: 600, marginBottom: 4 }}>
              スパン番号（表示テキスト）
              <input
                value={editingCell?.spanNo ?? ""}
                onChange={(e) => applyCell(editing.rowId, editing.date, { spanNo: e.target.value })}
                placeholder="例: 12"
                style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", borderRadius: 4, border: "1px solid #d0d8e4", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }}
              />
            </label>

            <label style={{ display: "block", fontSize: 11, color: "#607d8b", fontWeight: 600, margin: "10px 0 4px" }}>
              注記（セルにカーソルを合わせると表示）
              <textarea
                value={editingCell?.note ?? ""}
                onChange={(e) => applyCell(editing.rowId, editing.date, { note: e.target.value })}
                rows={3}
                placeholder="例: 水道工事が入るため夜間更生に変更"
                style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", borderRadius: 4, border: "1px solid #d0d8e4", fontFamily: "inherit", fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
              />
            </label>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
              <button
                type="button"
                onClick={() => {
                  applyCell(editing.rowId, editing.date, {
                    mark: "",
                    spanNo: "",
                    note: "",
                    colorBg: "",
                    colorFg: "",
                  });
                  setEditing(null);
                }}
                style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid #ef9a9a", background: "#ffebee", color: "#c62828", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}
              >
                このセルを消す
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                style={{ padding: "6px 16px", borderRadius: 4, border: "1px solid #1565c0", background: "#e3f2fd", color: "#1565c0", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {showMarkManager && !readOnly && (
        <MarkManagerModal
          markDefs={markDefs}
          customMarks={customMarks}
          onClose={() => setShowMarkManager(false)}
          onSave={saveMark}
          onDelete={removeMark}
        />
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: 4,
  border: "1px solid #d0d8e4",
  background: "#fff",
  color: "#4a6280",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
};

const headCell: React.CSSProperties = {
  position: "sticky",
  background: "#f5f7fa",
  borderRight: "1px solid #d0d8e4",
  borderBottom: "1px solid #b8c4d4",
  padding: "4px 6px",
  fontSize: 11,
  fontWeight: 700,
  color: "#4a6280",
  whiteSpace: "nowrap",
};

function PenButton({
  active,
  onClick,
  label,
  title,
  bg,
  fg,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title?: string;
  bg?: string;
  fg?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        padding: "4px 10px",
        borderRadius: 4,
        border: active ? "2px solid #1a2535" : "1px solid #d0d8e4",
        background: bg ?? (active ? "#e3f2fd" : "#fff"),
        color: fg ?? (active ? "#1565c0" : "#4a6280"),
        cursor: "pointer",
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

/** セル上の付箋（ドラッグで移動・テキスト編集） */
function StickyNoteView({
  sticky,
  readOnly,
  selected,
  onSelect,
  onChange,
  onRemove,
}: {
  sticky: CrossScheduleSticky;
  readOnly: boolean;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<CrossScheduleSticky>, persist?: boolean) => void;
  onRemove: () => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const [draft, setDraft] = useState(sticky.body);
  useEffect(() => setDraft(sticky.body), [sticky.body]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    onSelect();
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON" || target.closest("button")) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      ox: sticky.offsetX,
      oy: sticky.offsetY,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    onChange(
      {
        offsetX: Math.round(dragRef.current.ox + dx),
        offsetY: Math.round(dragRef.current.oy + dy),
      },
      false
    );
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const next = {
      offsetX: Math.round(dragRef.current.ox + dx),
      offsetY: Math.round(dragRef.current.oy + dy),
    };
    dragRef.current = null;
    onChange(next, true);
  };

  return (
    <div
      className="cross-sticky"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: "absolute",
        left: sticky.offsetX,
        top: sticky.offsetY,
        zIndex: 20 + sticky.zIndex + (selected ? 50 : 0),
        width: selected ? 140 : 72,
        minHeight: selected ? 72 : 28,
        padding: selected ? 6 : "4px 5px",
        background: sticky.color,
        border: selected ? "1.5px solid #5d4037" : "1px solid rgba(0,0,0,.15)",
        borderRadius: 2,
        boxShadow: "2px 2px 4px rgba(0,0,0,.12)",
        cursor: readOnly ? "default" : "grab",
        fontSize: 10,
        color: "#3e2723",
        lineHeight: 1.3,
        textAlign: "left",
        fontWeight: 400,
        whiteSpace: selected ? "normal" : "nowrap",
        overflow: selected ? "visible" : "hidden",
        textOverflow: "ellipsis",
      }}
      title={sticky.body || "（空の付箋）"}
    >
      {selected && !readOnly ? (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onChange({ body: draft }, true)}
            placeholder="メモを入力…"
            rows={3}
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              resize: "none",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: 11,
              color: "#3e2723",
              boxSizing: "border-box",
            }}
            autoFocus
          />
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 }}>
            {STICKY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange({ color: c }, true)}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 2,
                  background: c,
                  border: sticky.color === c ? "1.5px solid #1a2535" : "1px solid #999",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
            <button
              type="button"
              onClick={onRemove}
              style={{
                marginLeft: "auto",
                border: "none",
                background: "transparent",
                color: "#c62828",
                cursor: "pointer",
                fontSize: 10,
                padding: 0,
              }}
            >
              削除
            </button>
          </div>
        </>
      ) : (
        <span>{sticky.body || "…"}</span>
      )}
    </div>
  );
}

const MARK_COLOR_PRESETS = [
  { bg: "#c8e6c9", fg: "#1b5e20" },
  { bg: "#bbdefb", fg: "#0d47a1" },
  { bg: "#ffe0b2", fg: "#e65100" },
  { bg: "#b3e5fc", fg: "#01579b" },
  { bg: "#eceff1", fg: "#546e7a" },
  { bg: "#d1c4e9", fg: "#4527a0" },
  { bg: "#f0f4c3", fg: "#827717" },
  { bg: "#b2dfdb", fg: "#00695c" },
  { bg: "#f8bbd0", fg: "#880e4f" },
  { bg: "#ffcdd2", fg: "#b71c1c" },
  { bg: "#fff9c4", fg: "#5d4037" },
  { bg: "#d7ccc8", fg: "#4e342e" },
];

function MarkManagerModal({
  markDefs,
  customMarks,
  onClose,
  onSave,
  onDelete,
}: {
  markDefs: MarkDef[];
  customMarks: MarkDef[];
  onClose: () => void;
  onSave: (mark: MarkDef & { id: string }) => Promise<void>;
  onDelete: (markId: string) => Promise<void>;
}) {
  const [char, setChar] = useState("");
  const [label, setLabel] = useState("");
  const [bg, setBg] = useState("#fff9c4");
  const [fg, setFg] = useState("#5d4037");
  const [editingId, setEditingId] = useState<string | null>(null);

  const startEdit = (m: MarkDef) => {
    if (!m.id) {
      // 既定マークをカスタム化して上書き
      setEditingId(null);
      setChar(m.char);
      setLabel(m.label);
      setBg(m.bg);
      setFg(m.fg);
      return;
    }
    setEditingId(m.id);
    setChar(m.char);
    setLabel(m.label);
    setBg(m.bg);
    setFg(m.fg);
  };

  const handleSave = async () => {
    const c = char.trim().slice(0, 2);
    if (!c) {
      alert("表示文字を入力してください（1〜2文字）");
      return;
    }
    const id = editingId ?? genId();
    const sortOrder =
      customMarks.find((m) => m.id === id)?.sortOrder ??
      DEFAULT_MARK_DEFS.length + customMarks.length;
    await onSave({
      id,
      char: c,
      label: label.trim() || c,
      bg,
      fg,
      sortOrder,
      custom: true,
    });
    setEditingId(null);
    setChar("");
    setLabel("");
    setBg("#fff9c4");
    setFg("#5d4037");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 10, padding: 18, width: 440, maxWidth: "94vw", maxHeight: "85vh", overflow: "auto", boxShadow: "0 8px 30px rgba(0,0,0,.18)" }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>マーク項目・色の編集</div>
        <p style={{ fontSize: 11, color: "#607d8b", margin: "0 0 12px" }}>
          新しい項目を追加したり、色を変えたりできます。既定項目をクリックして色を変えて保存すると、会社用の上書きとして残ります。
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {markDefs.map((m) => (
            <div
              key={m.char + (m.id ?? "")}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "1px solid #e8ecf2", borderRadius: 6 }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 4,
                  background: m.bg,
                  color: m.fg,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {m.char}
              </span>
              <span style={{ flex: 1, fontSize: 12 }}>
                {m.label}
                {m.custom ? (
                  <span style={{ marginLeft: 6, fontSize: 10, color: "#1565c0" }}>カスタム</span>
                ) : (
                  <span style={{ marginLeft: 6, fontSize: 10, color: "#90a4ae" }}>既定</span>
                )}
              </span>
              <button type="button" onClick={() => startEdit(m)} style={{ ...navBtn, fontSize: 11, padding: "3px 8px" }}>
                色・編集
              </button>
              {m.id && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`「${m.char} ${m.label}」を削除しますか？`)) void onDelete(m.id!);
                  }}
                  style={{ border: "none", background: "transparent", color: "#c62828", cursor: "pointer", fontSize: 11 }}
                >
                  削除
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #e8ecf2", paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            {editingId ? "項目を更新" : "新しい項目を追加 / 既定を上書き"}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: "#607d8b" }}>
              文字
              <input
                value={char}
                onChange={(e) => setChar(e.target.value.slice(0, 2))}
                maxLength={2}
                placeholder="例: 移"
                style={{ display: "block", width: 64, marginTop: 3, padding: "5px 6px", borderRadius: 4, border: "1px solid #d0d8e4", fontFamily: "inherit" }}
              />
            </label>
            <label style={{ fontSize: 11, color: "#607d8b", flex: 1, minWidth: 120 }}>
              名称
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例: 移設"
                style={{ display: "block", width: "100%", marginTop: 3, padding: "5px 6px", borderRadius: 4, border: "1px solid #d0d8e4", fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </label>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 4,
                background: bg,
                color: fg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                border: "1px solid #d0d8e4",
                alignSelf: "flex-end",
              }}
            >
              {char || "?"}
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#607d8b", marginBottom: 4 }}>色のプリセット</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {MARK_COLOR_PRESETS.map((p) => (
              <button
                key={p.bg}
                type="button"
                onClick={() => {
                  setBg(p.bg);
                  setFg(p.fg);
                }}
                style={{
                  width: 28,
                  height: 22,
                  borderRadius: 3,
                  background: p.bg,
                  border: bg === p.bg ? "2px solid #1a2535" : "1px solid #b0bec5",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: "#607d8b" }}>
              背景
              <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} style={{ display: "block", marginTop: 3, width: 48, height: 28, border: "none", padding: 0, background: "transparent" }} />
            </label>
            <label style={{ fontSize: 11, color: "#607d8b" }}>
              文字色
              <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} style={{ display: "block", marginTop: 3, width: 48, height: 28, border: "none", padding: 0, background: "transparent" }} />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onClose} style={navBtn}>
              閉じる
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              style={{ ...navBtn, border: "1px solid #1565c0", background: "#e3f2fd", color: "#1565c0", fontWeight: 700 }}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}