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
import { MARK_DEFS, markDef, FREE_MARK_STYLE } from "@/types/crossSchedule";
import type { CrossScheduleRow, CrossScheduleCell } from "@/types/crossSchedule";
import {
  loadCrossScheduleRows,
  loadCrossScheduleCells,
  upsertCrossScheduleRow,
  deleteCrossScheduleRow,
  saveCrossScheduleCell,
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

/** 入力モード: 詳細エディタ / 各マークのスタンプ / スパン番号 / 消しゴム */
type PenMode = { kind: "detail" } | { kind: "mark"; char: string } | { kind: "span" } | { kind: "erase" };

const cellKey = (rowId: string, date: string) => `${rowId}|${date}`;

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [rangeMonths, setRangeMonths] = useState<1 | 3>(3);

  const [pen, setPen] = useState<PenMode>({ kind: "detail" });
  const [nextSpanNo, setNextSpanNo] = useState(1);
  const [editing, setEditing] = useState<{ rowId: string; date: string } | null>(null);
  const [addProjectId, setAddProjectId] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

  const { role } = useUserRole();
  const readOnly = role === "viewer";
  const pdfAreaRef = useRef<HTMLDivElement>(null);
  const today = todayStr();

  const days = useMemo(() => buildDays(year, month, rangeMonths), [year, month, rangeMonths]);
  const rangeStart = days[0]?.date ?? "";
  const rangeEnd = days[days.length - 1]?.date ?? "";

  // ── 初期ロード（案件・行）────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [d, r] = await Promise.all([loadData(), loadCrossScheduleRows()]);
        if (cancelled) return;
        setProjects((d?.projects ?? []).filter((p) => !p.deleted));
        setRows(r);
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

  // ── 表示範囲のセルを読み込み ─────────────────────────────────────
  useEffect(() => {
    if (!rangeStart || !rangeEnd) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await loadCrossScheduleCells(rangeStart, rangeEnd);
        if (cancelled) return;
        const map: Record<string, CrossScheduleCell> = {};
        for (const c of list) map[cellKey(c.rowId, c.date)] = c;
        setCells(map);
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

  const applyCell = useCallback(
    (rowId: string, date: string, patch: Partial<Pick<CrossScheduleCell, "mark" | "spanNo" | "note">>) => {
      const key = cellKey(rowId, date);
      setCells((prev) => {
        const cur = prev[key] ?? { rowId, date, mark: "", spanNo: "", note: "" };
        const next: CrossScheduleCell = { ...cur, ...patch };
        const out = { ...prev };
        if (!next.mark && !next.spanNo && !next.note) delete out[key];
        else out[key] = next;
        void persistCell(next);
        return out;
      });
    },
    [persistCell]
  );

  const handleCellClick = useCallback(
    (rowId: string, date: string) => {
      if (readOnly) return;
      if (pen.kind === "detail") {
        setEditing({ rowId, date });
        return;
      }
      if (pen.kind === "erase") {
        applyCell(rowId, date, { mark: "", spanNo: "", note: "" });
        return;
      }
      if (pen.kind === "span") {
        applyCell(rowId, date, { spanNo: String(nextSpanNo) });
        setNextSpanNo((n) => n + 1);
        return;
      }
      // マークスタンプ: 同じマークならトグルで外す
      const cur = cells[cellKey(rowId, date)];
      applyCell(rowId, date, { mark: cur?.mark === pen.char ? "" : pen.char });
    },
    [readOnly, pen, nextSpanNo, cells, applyCell]
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
  const renderDayCell = (row: CrossScheduleRow, d: DayCol, project: Project | null) => {
    const cell = cells[cellKey(row.id, d.date)];
    const def = cell?.mark ? markDef(cell.mark) : null;
    const style: React.CSSProperties = {
      width: DAY_W,
      minWidth: DAY_W,
      maxWidth: DAY_W,
      height: 26,
      padding: 0,
      textAlign: "center",
      fontSize: 11,
      fontWeight: 700,
      cursor: readOnly ? "default" : "pointer",
      position: "relative",
      borderRight: `1px solid ${d.day === new Date(d.year, d.monthIndex + 1, 0).getDate() ? "#90a4ae" : "#e0e6ed"}`,
      borderBottom: "1px solid #e0e6ed",
      userSelect: "none",
    };

    // 背景の優先順: マーク色 > 週末 > 工期外 > 白
    let bg = "#fff";
    let fg = "#1a2535";
    const inKoki =
      (!project?.startDate || d.date >= project.startDate) &&
      (!project?.endDate || d.date <= project.endDate);
    if (!inKoki) bg = "#f1f3f5";
    if (d.dow === 0) bg = "#ffebee";
    if (d.dow === 6) bg = "#e8f1fb";
    if (cell?.mark) {
      const s = def ?? FREE_MARK_STYLE;
      bg = s.bg;
      fg = s.fg;
    }
    style.background = bg;
    style.color = fg;
    if (d.date === today) style.boxShadow = "inset 0 0 0 2px #f59e0b";
    if (project?.endDate && d.date === project.endDate) style.borderRight = "2px solid #c62828";

    const text = cell?.spanNo || cell?.mark || "";
    const tipParts: string[] = [];
    if (cell?.spanNo) tipParts.push(`スパン ${cell.spanNo}`);
    if (cell?.mark) tipParts.push(def ? `${def.char}（${def.label}）` : cell.mark);
    if (cell?.note) tipParts.push(cell.note);
    if (project?.endDate && d.date === project.endDate) tipParts.push("工期末");
    const title = tipParts.length ? `${d.date}\n${tipParts.join("\n")}` : d.date;

    return (
      <td key={d.date} style={style} title={title} onClick={() => handleCellClick(row.id, d.date)}>
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
              label="詳細"
              title="クリックしたセルの編集画面を開きます（番号・マーク・注記）"
            />
            {MARK_DEFS.map((m) => (
              <PenButton
                key={m.char}
                active={pen.kind === "mark" && pen.char === m.char}
                onClick={() => setPen({ kind: "mark", char: m.char })}
                label={`${m.char} ${m.label}`}
                bg={m.bg}
                fg={m.fg}
                title={`クリックでセルに「${m.char}」を付けます（もう一度クリックで外す）`}
              />
            ))}
            <PenButton
              active={pen.kind === "span"}
              onClick={() => setPen({ kind: "span" })}
              label="番号"
              title="クリックしたセルにスパン番号を入れ、番号を自動で進めます"
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
              active={pen.kind === "erase"}
              onClick={() => setPen({ kind: "erase" })}
              label="消す"
              title="クリックしたセルの入力をすべて消します"
            />
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
      <div ref={pdfAreaRef} style={{ background: "#fff", borderRadius: 8, border: "1px solid #d0d8e4", overflow: "auto", maxHeight: "calc(100vh - 210px)" }}>
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
                  {days.map((d) => renderDayCell(row, d, g.project))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── 凡例 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8, fontSize: 11, color: "#4a6280" }}>
        <span style={{ fontWeight: 600 }}>凡例:</span>
        {MARK_DEFS.map((m) => (
          <span key={m.char} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 16, height: 16, borderRadius: 3, background: m.bg, color: m.fg, fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {m.char}
            </span>
            {m.label}
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 16, height: 16, borderRadius: 3, border: "2px solid #c62828", boxSizing: "border-box" }} />
          工期末（案件の終了日）
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 0, height: 0, borderTop: "8px solid #c62828", borderLeft: "8px solid transparent" }} />
          注記あり（セルにカーソルで表示）
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
              {MARK_DEFS.map((m) => {
                const active = editingCell?.mark === m.char;
                return (
                  <button
                    key={m.char}
                    type="button"
                    onClick={() => applyCell(editing.rowId, editing.date, { mark: active ? "" : m.char })}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 4,
                      border: active ? "2px solid #1a2535" : "1px solid #d0d8e4",
                      background: m.bg,
                      color: m.fg,
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
                  applyCell(editing.rowId, editing.date, { mark: "", spanNo: "", note: "" });
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