"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type { Project } from "@/lib/utils";
import { loadData } from "@/lib/supabase/data";
import { genId, T } from "@/lib/constants";
import {
  defaultActualBarColor,
  fillRatesForRange,
  getProcessRowVariance,
  isConstructionProject,
  monthSequence,
  periodsForMonthRange,
  type MonthPeriod,
  type ProcessVarianceKind,
} from "@/lib/processMeetingUtils";
import type { ProcessMeetingRow } from "@/types/processMeeting";
import {
  loadProcessMeetingRows,
  loadProcessMeetingMeta,
  saveProcessMeetingMeta,
  upsertProcessMeetingRows,
  deleteProcessMeetingRow,
  insertProcessMeetingRows,
} from "@/lib/processMeetingStorage";

const MONTH_NAMES = "1月 2月 3月 4月 5月 6月 7月 8月 9月 10月 11月 12月".split(" ");
const DEFAULT_PLANNED_BAR = "#1565c0";

function PeriodBar({
  kind,
  periods,
  rangeStart,
  rangeEnd,
  actualVariance,
  plannedColorOverride,
  actualColorOverride,
  barHeight = 14,
  compact = false,
  rowMarginTop,
}: {
  kind: "planned" | "actual";
  periods: MonthPeriod[];
  rangeStart: string | null;
  rangeEnd: string | null;
  /** 実施行のみ：遅れ・前倒し等で帯の色を変える */
  actualVariance?: ProcessVarianceKind | null;
  /** 行ごとの予定帯色（未指定は既定の青） */
  plannedColorOverride?: string | null;
  /** 行ごとの実施帯色（未指定は actualVariance に応じた自動色） */
  actualColorOverride?: string | null;
  barHeight?: number;
  /** 一覧を詰める：左の「予定/実施」ラベルを隠し帯だけに（日付列と重複しない） */
  compact?: boolean;
  rowMarginTop?: number;
}) {
  const rates = fillRatesForRange(periods, rangeStart, rangeEnd);
  const label = kind === "planned" ? "予定" : "実施";
  const labelFont = Math.max(9, Math.round(barHeight * 0.58));
  const mt = rowMarginTop ?? (compact ? (kind === "planned" ? 0 : 2) : 4);
  const vKind = actualVariance ?? "unknown";
  const autoActual = defaultActualBarColor(vKind);
  const color =
    kind === "planned"
      ? plannedColorOverride?.trim() || DEFAULT_PLANNED_BAR
      : actualColorOverride?.trim() || autoActual;
  const labelColor =
    kind === "planned"
      ? plannedColorOverride?.trim() || DEFAULT_PLANNED_BAR
      : actualColorOverride?.trim() || (vKind === "unknown" ? "#e65100" : autoActual);
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: compact ? 4 : 8, marginTop: mt }}
      aria-label={compact ? `${label}の工程帯` : undefined}
    >
      {!compact && (
        <span
          style={{
            width: 40,
            fontSize: labelFont,
            fontWeight: 700,
            color: labelColor,
            flexShrink: 0,
          }}
        >
          {label}
        </span>
      )}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${periods.length}, minmax(8px, 1fr))`,
          gap: compact ? 2 : 4,
          minWidth: Math.max(120, periods.length * (compact ? 12 : 14)),
        }}
      >
        {rates.map((r, i) => (
          <div
            key={periods[i].start}
            title={`${periods[i].label} ${Math.round(r * 100)}%`}
            style={{
              background: "#eceff1",
              borderRadius: 4,
              height: barHeight,
              overflow: "hidden",
              position: "relative",
              border:
                kind === "actual" && (actualVariance === "delay" || actualVariance === "overdue")
                  ? "1px solid #ef9a9a"
                  : kind === "actual" && actualVariance === "early"
                    ? "1px solid #a5d6a7"
                    : "1px solid #cfd8dc",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${Math.min(100, Math.round(r * 100))}%`,
                background: color,
                opacity: r > 0 ? 0.88 : 0,
                transition: "width .2s",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function VarianceBadge({ row, large, compact }: { row: ProcessMeetingRow; large?: boolean; compact?: boolean }) {
  const v = getProcessRowVariance(row);
  if (!v.label) return null;
  const bg =
    v.kind === "delay" || v.kind === "overdue"
      ? "#ffebee"
      : v.kind === "early"
        ? "#e8f5e9"
        : v.kind === "ok"
          ? "#e0f2f1"
          : "#eceff1";
  const fg =
    v.kind === "delay" || v.kind === "overdue"
      ? "#c62828"
      : v.kind === "early"
        ? "#2e7d32"
        : v.kind === "ok"
          ? "#00695c"
          : "#546e7a";
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: large ? 12 : compact ? 9 : 10,
        fontWeight: 700,
        padding: compact ? "1px 6px" : "2px 8px",
        borderRadius: 4,
        background: bg,
        color: fg,
        border: `1px solid ${fg}33`,
        whiteSpace: "nowrap",
      }}
    >
      {v.kind === "delay" && "⚠ "}
      {v.kind === "early" && "↑ "}
      {v.kind === "ok" && "✓ "}
      {v.kind === "overdue" && "⏱ "}
      {v.label}
    </span>
  );
}

function groupByProject(rows: ProcessMeetingRow[]): Map<string, ProcessMeetingRow[]> {
  const m = new Map<string, ProcessMeetingRow[]>();
  for (const r of rows) {
    const list = m.get(r.projectId) ?? [];
    list.push(r);
    m.set(r.projectId, list);
  }
  for (const list of m.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  }
  return m;
}

export default function ProcessMeetingBoard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<ProcessMeetingRow[]>([]);
  const [hiddenProjectIds, setHiddenProjectIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [rangeMonths, setRangeMonths] = useState<1 | 3 | 6 | 12>(1);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(() => new Set());
  const [projectFilterOpen, setProjectFilterOpen] = useState(true);
  const prevVisibleProjectIdsRef = useRef<string[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowsRef = useRef<ProcessMeetingRow[]>([]);
  rowsRef.current = rows;
  const pdfAreaRef = useRef<HTMLDivElement>(null);
  const [presentationMode, setPresentationMode] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  /** 既定オン：案件の縦幅を詰めて一覧性を上げる。「一覧：ゆとり」で従来の余白に */
  const [compactBoard, setCompactBoard] = useState(true);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem("process-meeting-compact") === "0") {
        setCompactBoard(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCompactBoard = useCallback(() => {
    setCompactBoard((c) => {
      const next = !c;
      try {
        localStorage.setItem("process-meeting-compact", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const periods = useMemo(
    () => periodsForMonthRange(year, month, rangeMonths),
    [year, month, rangeMonths]
  );

  const monthHeaders = useMemo(
    () => monthSequence(year, month, rangeMonths),
    [year, month, rangeMonths]
  );

  const constructionProjects = useMemo(() => {
    return projects.filter(isConstructionProject).sort((a, b) => {
      const ma = a.managementNumber ?? "";
      const mb = b.managementNumber ?? "";
      if (ma !== mb) return ma.localeCompare(mb, "ja");
      return a.name.localeCompare(b.name, "ja");
    });
  }, [projects]);

  const visibleProjects = useMemo(
    () => constructionProjects.filter((p) => !hiddenProjectIds.includes(p.id)),
    [constructionProjects, hiddenProjectIds]
  );

  /** ボードに出る工事案件のうち、チェックで選んだものだけ */
  const displayedProjects = useMemo(
    () => visibleProjects.filter((p) => selectedProjectIds.has(p.id)),
    [visibleProjects, selectedProjectIds]
  );

  useEffect(() => {
    const visibleIds = visibleProjects.map((p) => p.id);
    const prev = prevVisibleProjectIdsRef.current;
    setSelectedProjectIds((sel) => {
      if (sel.size === 0 && visibleIds.length > 0 && prev.length === 0) {
        return new Set(visibleIds);
      }
      const next = new Set(sel);
      for (const id of visibleIds) {
        if (!prev.includes(id)) next.add(id);
      }
      for (const id of [...next]) {
        if (!visibleIds.includes(id)) next.delete(id);
      }
      return next;
    });
    prevVisibleProjectIdsRef.current = visibleIds;
  }, [visibleProjects]);

  const hiddenProjects = useMemo(
    () => constructionProjects.filter((p) => hiddenProjectIds.includes(p.id)),
    [constructionProjects, hiddenProjectIds]
  );

  const rowsByProject = useMemo(() => groupByProject(rows), [rows]);

  const flushSave = useCallback(async (next: ProcessMeetingRow[]) => {
    setSaveState("saving");
    try {
      await upsertProcessMeetingRows(next);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      console.error(e);
      setSaveState("error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const d = await loadData();
        if (cancelled) return;
        setProjects(d?.projects ?? []);

        let list = await loadProcessMeetingRows();
        const meta = await loadProcessMeetingMeta();
        if (cancelled) return;
        setHiddenProjectIds(meta.hiddenProjectIds);

        const cons = (d?.projects ?? []).filter(isConstructionProject);
        const byPid = groupByProject(list);
        const toInsert: ProcessMeetingRow[] = [];
        for (const p of cons) {
          if (meta.hiddenProjectIds.includes(p.id)) continue;
          const existing = byPid.get(p.id);
          if (!existing?.length) {
            toInsert.push({
              id: genId(),
              projectId: p.id,
              processName: "",
              plannedStart: null,
              plannedEnd: null,
              actualStart: null,
              actualEnd: null,
              sortOrder: 0,
            });
          }
        }
        if (toInsert.length) {
          await insertProcessMeetingRows(toInsert);
          list = [...list, ...toInsert];
        }
        setRows(list);
      } catch (e) {
        console.error(e);
        setLoadError(
          "読み込みに失敗しました。Supabase に process_meeting 用テーブルがあるか確認してください。"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateRow = (id: string, patch: Partial<ProcessMeetingRow>) => {
    setRows((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      rowsRef.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => flushSave(rowsRef.current), 700);
      return next;
    });
  };

  const addRow = (projectId: string) => {
    setRows((prev) => {
      const same = prev.filter((r) => r.projectId === projectId);
      const maxOrder = same.reduce((m, r) => Math.max(m, r.sortOrder), -1);
      const row: ProcessMeetingRow = {
        id: genId(),
        projectId,
        processName: "",
        plannedStart: null,
        plannedEnd: null,
        actualStart: null,
        actualEnd: null,
        sortOrder: maxOrder + 1,
      };
      const next = [...prev, row];
      rowsRef.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => flushSave(rowsRef.current), 700);
      return next;
    });
  };

  const removeRow = async (id: string, projectId: string) => {
    try {
      await deleteProcessMeetingRow(id);
      let next = rows.filter((r) => r.id !== id);
      const rest = next.filter((r) => r.projectId === projectId);
      if (rest.length === 0 && !hiddenProjectIds.includes(projectId)) {
        const blank: ProcessMeetingRow = {
          id: genId(),
          projectId,
          processName: "",
          plannedStart: null,
          plannedEnd: null,
          actualStart: null,
          actualEnd: null,
          sortOrder: 0,
        };
        await insertProcessMeetingRows([blank]);
        next = [...next, blank];
      }
      setRows(next);
      rowsRef.current = next;
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1500);
    } catch (e) {
      console.error(e);
      setSaveState("error");
    }
  };

  const hideProject = async (projectId: string) => {
    const nextHidden = [...new Set([...hiddenProjectIds, projectId])];
    setHiddenProjectIds(nextHidden);
    try {
      await saveProcessMeetingMeta(nextHidden);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePrint = useCallback(() => window.print(), []);

  const handleExportPdf = useCallback(async () => {
    const el = pdfAreaRef.current;
    if (!el) return;
    setPdfLoading(true);
    try {
      const FIXED_WIDTH = 900;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#f5f7fa",
        ignoreElements: (node) =>
          node instanceof HTMLElement && node.classList.contains("process-meeting-no-print"),
        onclone: (_, clonedEl) => {
          if (clonedEl instanceof HTMLElement) {
            clonedEl.style.width = `${FIXED_WIDTH}px`;
            clonedEl.style.minWidth = `${FIXED_WIDTH}px`;
          }
        },
      });
      const imgData = canvas.toDataURL("image/png", 1.0);
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const aspect = canvas.height / canvas.width;
      const imgW = pageW * aspect <= pageH ? pageW : pageH / aspect;
      const imgH = imgW * aspect;
      pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH);
      const fname = `process-meeting-${year}-${String(month + 1).padStart(2, "0")}-${rangeMonths}m.pdf`;
      pdf.save(fname);
    } catch (e) {
      console.error("[PDF export]", e);
      alert("PDFの作成に失敗しました");
    } finally {
      setPdfLoading(false);
    }
  }, [year, month, rangeMonths]);

  const unhideProject = async (projectId: string) => {
    const nextHidden = hiddenProjectIds.filter((id) => id !== projectId);
    setHiddenProjectIds(nextHidden);
    try {
      await saveProcessMeetingMeta(nextHidden);
      let list = rows;
      const has = list.some((r) => r.projectId === projectId);
      if (!has) {
        const blank: ProcessMeetingRow = {
          id: genId(),
          projectId,
          processName: "",
          plannedStart: null,
          plannedEnd: null,
          actualStart: null,
          actualEnd: null,
          sortOrder: 0,
        };
        await insertProcessMeetingRows([blank]);
        list = [...list, blank];
        setRows(list);
        rowsRef.current = list;
      }
    } catch (e) {
      console.error(e);
    }
  };

  const dateInput = (value: string | null, onChange: (v: string | null) => void) => (
    <input
      type="date"
      className="pm-date-input"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? e.target.value : null)}
      style={{
        border: `1px solid ${T.bd}`,
        fontFamily: "inherit",
        color: T.tx,
        background: T.s,
        ...(presentationMode ? { fontSize: 14, minHeight: 32 } : {}),
      }}
    />
  );

  const pmBaseFs = presentationMode ? 15 : compactBoard ? 12 : 13;
  const pmBarH = presentationMode ? 18 : compactBoard ? 10 : 14;
  const rowGridCols = compactBoard
    ? `minmax(140px, 260px) minmax(280px,1fr)`
    : `minmax(200px, 300px) minmax(280px,1fr)`;
  const rangeTitle =
    monthHeaders.length > 0
      ? `${monthHeaders[0].year}年${monthHeaders[0].month + 1}月〜${monthHeaders[monthHeaders.length - 1].year}年${
          monthHeaders[monthHeaders.length - 1].month + 1
        }月（${rangeMonths}か月）`
      : "";

  const compactListButton = (
    <button
      type="button"
      onClick={toggleCompactBoard}
      className="process-meeting-no-print"
      title="一覧を縦に詰めます。コンパクト時は日付入力は隠れます（編集は「一覧：ゆとり」で表示）"
      style={{
        padding: "5px 12px",
        borderRadius: 4,
        border: `1px solid ${compactBoard ? "#2e7d32" : "#d0d8e4"}`,
        background: compactBoard ? "#e8f5e9" : "#fff",
        color: compactBoard ? "#2e7d32" : "#4a6280",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 11,
        fontWeight: compactBoard ? 700 : 400,
        whiteSpace: "nowrap",
      }}
    >
      {compactBoard ? "一覧：コンパクト" : "一覧：ゆとり"}
    </button>
  );

  const meetingActionButtons = (
    <>
      <button
        type="button"
        onClick={() => setPresentationMode((v) => !v)}
        className="process-meeting-no-print"
        style={{
          padding: "5px 12px",
          borderRadius: 4,
          border: `1px solid ${presentationMode ? "#1565c0" : "#d0d8e4"}`,
          background: presentationMode ? "#e3f2fd" : "#fff",
          color: presentationMode ? "#1565c0" : "#4a6280",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 11,
          fontWeight: presentationMode ? 700 : 400,
        }}
      >
        {presentationMode ? "全画面モード中" : "全画面（投影）"}
      </button>
      <button
        type="button"
        onClick={handleExportPdf}
        disabled={pdfLoading}
        className="process-meeting-no-print"
        style={{
          padding: "5px 12px",
          borderRadius: 4,
          border: "1px solid #8b5cf6",
          background: "#f5f3ff",
          color: "#8b5cf6",
          cursor: pdfLoading ? "wait" : "pointer",
          fontFamily: "inherit",
          fontSize: 11,
        }}
      >
        {pdfLoading ? "作成中…" : "📄 PDF"}
      </button>
      <button
        type="button"
        onClick={handlePrint}
        className="process-meeting-no-print"
        style={{
          padding: "5px 12px",
          borderRadius: 4,
          border: "1px solid #d0d8e4",
          background: "#fff",
          color: "#4a6280",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 11,
        }}
      >
        印刷
      </button>
    </>
  );

  return (
    <div
      className="process-meeting-print-root"
      style={{
        fontFamily: "'Noto Sans JP', sans-serif",
        background: "#f5f7fa",
        minHeight: "100vh",
        color: "#1a2535",
        fontSize: pmBaseFs,
      }}
    >
      <div
        className="process-meeting-no-print"
        style={{
          background: presentationMode ? "rgba(255,255,255,.92)" : "#fff",
          borderBottom: presentationMode ? "1px solid #e2e8f0" : "2px solid #1565c0",
          padding: presentationMode ? "6px 14px" : "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          position: "sticky",
          top: 0,
          zIndex: 20,
          boxShadow: presentationMode ? "0 1px 4px rgba(0,0,0,.04)" : "0 2px 6px rgba(0,0,0,.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link
            href="/"
            style={{
              fontSize: presentationMode ? 11 : 12,
              color: "#4a6280",
              textDecoration: "none",
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid #d0d8e4",
            }}
          >
            ← 案件管理に戻る
          </Link>
          <div
            style={{
              width: presentationMode ? 30 : 34,
              height: presentationMode ? 30 : 34,
              background: "#1565c0",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: presentationMode ? 13 : 14,
              color: "#fff",
            }}
          >
            程
          </div>
          <div>
            <div style={{ fontSize: presentationMode ? 16 : 15, fontWeight: 700 }}>工程会議ボード</div>
            <div style={{ fontSize: presentationMode ? 11 : 10, color: "#4a6280" }}>
              工事案件 × 手入力工程 · 10日区切り（表示幅を選択）
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {meetingActionButtons}
          {saveState === "saving" && (
            <span style={{ fontSize: 11, color: "#4a6280" }}>保存中…</span>
          )}
          {saveState === "saved" && (
            <span style={{ fontSize: 11, color: "#2e7d32" }}>保存しました</span>
          )}
          {saveState === "error" && (
            <span style={{ fontSize: 11, color: "#c62828" }}>保存エラー</span>
          )}
        </div>
      </div>

      <div className="process-meeting-no-print" style={{ padding: "12px 16px", maxWidth: 1800, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginBottom: 14,
            background: "#fff",
            padding: 10,
            borderRadius: 8,
            border: "1px solid #d0d8e4",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              paddingBottom: 8,
              borderBottom: "1px solid #e8ecf2",
            }}
          >
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #d0d8e4", cursor: "pointer" }}
            >
              ◀ {year - 1}
            </button>
            <span style={{ fontWeight: 700, color: "#1565c0", fontFamily: "IBM Plex Mono, monospace" }}>{year}年</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #d0d8e4", cursor: "pointer" }}
            >
              {year + 1} ▶
            </button>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {MONTH_NAMES.map((mn, i) => (
                <button
                  key={mn}
                  type="button"
                  onClick={() => setMonth(i)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: `1px solid ${i === month ? "#1565c0" : "#d0d8e4"}`,
                    background: i === month ? "#e3f2fd" : "#fff",
                    color: i === month ? "#1565c0" : "#4a6280",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {mn}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: "#4a6280", marginLeft: 4 }}>表示幅</span>
            <select
              value={rangeMonths}
              onChange={(e) => setRangeMonths(Number(e.target.value) as 1 | 3 | 6 | 12)}
              style={{
                padding: "6px 10px",
                borderRadius: 4,
                border: "1px solid #d0d8e4",
                fontSize: 12,
                fontFamily: "inherit",
                background: "#fff",
                color: T.tx,
                cursor: "pointer",
              }}
              aria-label="表示する月の幅"
            >
              <option value={1}>1か月</option>
              <option value={3}>3か月</option>
              <option value={6}>半年（6か月）</option>
              <option value={12}>1年（12か月）</option>
            </select>
            <span style={{ fontSize: 11, color: "#90a4ae", marginLeft: 4, marginRight: 2 }}>|</span>
            {compactListButton}
          </div>
        </div>

        <p style={{ fontSize: 12, color: "#4a6280", marginBottom: 12, lineHeight: 1.5 }}>
          カテゴリが「工事」の案件のみ表示します。新しい工事案件は、初回アクセス時に1行自動で追加されます。
          工程名は自由に入力してください。横軸は<strong>選択した開始月から</strong>1か月・3か月・半年・1年分を、各月3区間（各約10日）で並べます。列が多いときは横スクロールしてください。
        </p>

        {!loading && !loadError && visibleProjects.length > 0 && (
          <div
            style={{
              marginBottom: 14,
              background: "#fff",
              border: "1px solid #d0d8e4",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setProjectFilterOpen((o) => !o)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                border: "none",
                background: "#f8fafc",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 700,
                color: "#1565c0",
                textAlign: "left",
              }}
            >
              <span>
                表示する工事案件（{selectedProjectIds.size} / {visibleProjects.length} 件選択）
              </span>
              <span style={{ fontSize: 12, color: "#4a6280" }}>{projectFilterOpen ? "▼ 閉じる" : "▶ 開く"}</span>
            </button>
            {projectFilterOpen && (
              <div style={{ padding: "10px 12px 12px", borderTop: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => setSelectedProjectIds(new Set(visibleProjects.map((p) => p.id)))}
                    style={{
                      padding: "4px 10px",
                      fontSize: 11,
                      borderRadius: 4,
                      border: "1px solid #1565c0",
                      background: "#fff",
                      color: "#1565c0",
                      cursor: "pointer",
                    }}
                  >
                    すべて選択
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedProjectIds(new Set())}
                    style={{
                      padding: "4px 10px",
                      fontSize: 11,
                      borderRadius: 4,
                      border: "1px solid #90a4ae",
                      background: "#fff",
                      color: "#546e7a",
                      cursor: "pointer",
                    }}
                  >
                    すべて解除
                  </button>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: 6,
                    maxHeight: 220,
                    overflowY: "auto",
                  }}
                >
                  {visibleProjects.map((p) => {
                    const checked = selectedProjectIds.has(p.id);
                    return (
                      <label
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          padding: "6px 8px",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: 12,
                          background: checked ? "#e3f2fd" : "transparent",
                          border: `1px solid ${checked ? "#90caf9" : "#eceff1"}`,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setSelectedProjectIds((prev) => {
                              const n = new Set(prev);
                              if (on) n.add(p.id);
                              else n.delete(p.id);
                              return n;
                            });
                          }}
                          style={{ marginTop: 2 }}
                        />
                        <span>
                          <span style={{ fontFamily: "monospace", fontSize: 10, color: "#4a6280" }}>
                            {p.managementNumber ?? "—"}
                          </span>{" "}
                          {p.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {loading && <p style={{ fontSize: 13 }}>読み込み中…</p>}
        {loadError && (
          <p style={{ fontSize: 13, color: "#c62828", whiteSpace: "pre-wrap" }}>{loadError}</p>
        )}

        {!loading && !loadError && visibleProjects.length === 0 && (
          <p style={{ fontSize: 13, color: "#4a6280" }}>
            表示する工事案件がありません（未登録、またはすべて「ボードから外しています」）。
          </p>
        )}

        {!loading && !loadError && visibleProjects.length > 0 && selectedProjectIds.size === 0 && (
          <p style={{ fontSize: 13, color: "#c62828" }}>
            表示する案件が0件です。上の「表示する工事案件」で1件以上チェックしてください。
          </p>
        )}
      </div>

      <div
        ref={pdfAreaRef}
        className={compactBoard ? "process-meeting-compact" : undefined}
        style={{
          padding: "12px 16px",
          maxWidth: 1800,
          margin: "0 auto",
          background: "#f5f7fa",
        }}
      >
        {!loading && !loadError && (
          <div
            style={{
              marginBottom: 14,
              paddingBottom: 10,
              borderBottom: "1px solid #d0d8e4",
            }}
          >
            <div style={{ fontSize: presentationMode ? 18 : 16, fontWeight: 700 }}>工程会議ボード</div>
            <div style={{ fontSize: presentationMode ? 13 : 12, color: "#4a6280", marginTop: 4 }}>
              {rangeTitle} · 10日区切り
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginTop: 8,
                fontSize: presentationMode ? 11 : 10,
                color: "#546e7a",
              }}
            >
              <span>
                <span style={{ color: "#1565c0" }}>■</span> 予定
              </span>
              <span>
                <span style={{ color: "#c62828" }}>■</span> 実施・遅れ
              </span>
              <span>
                <span style={{ color: "#2e7d32" }}>■</span> 実施・前倒し
              </span>
              <span>
                <span style={{ color: "#00897b" }}>■</span> 実施・順調
              </span>
              <span>
                <span style={{ color: "#e65100" }}>■</span> 実施・未確定／予定超過
              </span>
            </div>
          </div>
        )}

        {!loading &&
          !loadError &&
          displayedProjects.map((proj) => {
            const prRows = rowsByProject.get(proj.id) ?? [];
            return (
              <section
                key={proj.id}
                className={compactBoard ? "process-meeting-compact" : undefined}
                style={{
                  background: "#fff",
                  border: "1px solid #d0d8e4",
                  borderRadius: compactBoard ? 8 : 10,
                  marginBottom: compactBoard ? 8 : 16,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                    padding: compactBoard ? "6px 10px" : "10px 12px",
                    background: "#eef1f6",
                    borderBottom: "1px solid #d0d8e4",
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: compactBoard ? 10 : 11,
                        fontFamily: "monospace",
                        color: "#4a6280",
                        marginRight: 8,
                      }}
                    >
                      {proj.managementNumber ?? "—"}
                    </span>
                    <span style={{ fontSize: compactBoard ? 13 : 14, fontWeight: 700 }}>{proj.name}</span>
                  </div>
                  <div className="process-meeting-no-print" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => addRow(proj.id)}
                      style={{
                        padding: "4px 10px",
                        fontSize: 11,
                        borderRadius: 4,
                        border: "1px solid #1565c0",
                        background: "#fff",
                        color: "#1565c0",
                        cursor: "pointer",
                      }}
                    >
                      ＋ 工程を追加
                    </button>
                    <button
                      type="button"
                      onClick={() => hideProject(proj.id)}
                      style={{
                        padding: "4px 10px",
                        fontSize: 11,
                        borderRadius: 4,
                        border: "1px solid #90a4ae",
                        background: "#fff",
                        color: "#546e7a",
                        cursor: "pointer",
                      }}
                    >
                      案件をボードから外す
                    </button>
                  </div>
                </div>

                <div style={{ padding: compactBoard ? 4 : 8, overflowX: "auto" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: rowGridCols,
                      gap: compactBoard ? 6 : 8,
                      fontSize: presentationMode ? 12 : compactBoard ? 9 : 10,
                      color: "#4a6280",
                      marginBottom: compactBoard ? 4 : 6,
                      paddingLeft: 4,
                      minWidth: Math.max(480, 200 + periods.length * 22),
                    }}
                  >
                    <span>{compactBoard ? "工程名" : "工程名 / 日付"}</span>
                    <div style={{ minWidth: periods.length * 18 }}>
                      {rangeMonths > 1 && (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: `repeat(${periods.length}, minmax(10px, 1fr))`,
                            gap: 4,
                            marginBottom: 4,
                          }}
                        >
                          {monthHeaders.map(({ year: y, month: mo }) => (
                            <div
                              key={`${y}-${mo}-hdr`}
                              style={{
                                gridColumn: `span 3`,
                                textAlign: "center",
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#1565c0",
                                padding: "2px 0",
                                borderBottom: "1px solid #d0d8e4",
                              }}
                            >
                              {y}年{mo + 1}月
                            </div>
                          ))}
                        </div>
                      )}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: `repeat(${periods.length}, minmax(10px, 1fr))`,
                          gap: 4,
                          textAlign: "center",
                        }}
                      >
                        {periods.map((p) => (
                          <span key={p.start} style={{ fontSize: rangeMonths > 1 ? 8 : 10, lineHeight: 1.2 }}>
                            {p.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {prRows.map((row) => {
                    const variance = getProcessRowVariance(row);
                    const leftBorder =
                      variance.kind === "delay" || variance.kind === "overdue"
                        ? "3px solid #e57373"
                        : variance.kind === "early"
                          ? "3px solid #81c784"
                          : variance.kind === "ok"
                            ? "3px solid #4db6ac"
                            : "3px solid transparent";
                    return (
                    <div
                      key={row.id}
                      style={{
                        borderTop: "1px solid #eceff1",
                        padding: compactBoard ? "4px 6px" : "8px 6px",
                        display: "grid",
                        gridTemplateColumns: rowGridCols,
                        gap: compactBoard ? 6 : 10,
                        alignItems: "start",
                        minWidth: Math.max(480, 200 + periods.length * 22),
                        borderLeft: leftBorder,
                        marginLeft: 0,
                        paddingLeft: variance.kind === "unknown" ? 10 : 7,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            marginBottom: compactBoard ? 0 : 4,
                            flexWrap: "wrap",
                          }}
                        >
                          <input
                            type="text"
                            value={row.processName}
                            placeholder="例: 清掃工・前処理工"
                            onChange={(e) => updateRow(row.id, { processName: e.target.value })}
                            style={{
                              flex: 1,
                              minWidth: 120,
                              padding: "5px 8px",
                              fontSize: presentationMode ? 14 : 12,
                              border: `1px solid ${T.bd}`,
                              borderRadius: 4,
                              fontFamily: "inherit",
                            }}
                          />
                          <VarianceBadge row={row} large={presentationMode} compact={compactBoard} />
                          <button
                            type="button"
                            onClick={() => removeRow(row.id, proj.id)}
                            className="process-meeting-no-print"
                            style={{
                              padding: "3px 8px",
                              fontSize: 10,
                              borderRadius: 4,
                              border: "1px solid #ffcdd2",
                              background: "#fff",
                              color: "#c62828",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            削除
                          </button>
                        </div>
                        <div
                          className="process-meeting-date-strip"
                          style={{ display: compactBoard ? "none" : "block" }}
                          aria-hidden={compactBoard}
                        >
                            <div className="pm-date-line">
                              <span
                                style={{
                                  flex: "0 0 30px",
                                  fontSize: presentationMode ? 11 : 10,
                                  fontWeight: 700,
                                  color: "#1565c0",
                                  letterSpacing: "0.02em",
                                }}
                              >
                                予定
                              </span>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  flexWrap: "nowrap",
                                  minWidth: 0,
                                }}
                              >
                                {dateInput(row.plannedStart, (v) => updateRow(row.id, { plannedStart: v }))}
                                <span style={{ color: "#90a4ae", fontSize: 11, userSelect: "none" }}>〜</span>
                                {dateInput(row.plannedEnd, (v) => updateRow(row.id, { plannedEnd: v }))}
                              </div>
                            </div>
                            <div className="pm-date-line">
                              <span
                                style={{
                                  flex: "0 0 30px",
                                  fontSize: presentationMode ? 11 : 10,
                                  fontWeight: 700,
                                  color: "#00897b",
                                  letterSpacing: "0.02em",
                                }}
                              >
                                実施
                              </span>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  flexWrap: "nowrap",
                                  minWidth: 0,
                                }}
                              >
                                {dateInput(row.actualStart, (v) => updateRow(row.id, { actualStart: v }))}
                                <span style={{ color: "#90a4ae", fontSize: 11, userSelect: "none" }}>〜</span>
                                {dateInput(row.actualEnd, (v) => updateRow(row.id, { actualEnd: v }))}
                              </div>
                            </div>
                        </div>
                        {!compactBoard && (
                          <div
                            className="process-meeting-no-print process-meeting-bar-color-strip"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                              marginTop: 8,
                              fontSize: 11,
                              color: "#607d8b",
                            }}
                            title="各行の帯グラフの塗り色を変更できます"
                          >
                            <span style={{ fontWeight: 700 }}>帯色</span>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                              予定
                              <input
                                type="color"
                                value={row.plannedBarColor?.trim() || DEFAULT_PLANNED_BAR}
                                onChange={(e) => updateRow(row.id, { plannedBarColor: e.target.value })}
                                style={{
                                  width: 30,
                                  height: 24,
                                  padding: 0,
                                  border: "1px solid #cfd8dc",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  verticalAlign: "middle",
                                }}
                                aria-label="予定帯の色"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => updateRow(row.id, { plannedBarColor: null })}
                              style={{
                                padding: "2px 6px",
                                fontSize: 10,
                                borderRadius: 4,
                                border: "1px solid #cfd8dc",
                                background: "#fff",
                                color: "#546e7a",
                                cursor: "pointer",
                              }}
                            >
                              既定
                            </button>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                              実施
                              <input
                                type="color"
                                value={row.actualBarColor?.trim() || defaultActualBarColor(variance.kind)}
                                onChange={(e) => updateRow(row.id, { actualBarColor: e.target.value })}
                                style={{
                                  width: 30,
                                  height: 24,
                                  padding: 0,
                                  border: "1px solid #cfd8dc",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  verticalAlign: "middle",
                                }}
                                aria-label="実施帯の色"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => updateRow(row.id, { actualBarColor: null })}
                              style={{
                                padding: "2px 6px",
                                fontSize: 10,
                                borderRadius: 4,
                                border: "1px solid #cfd8dc",
                                background: "#fff",
                                color: "#546e7a",
                                cursor: "pointer",
                              }}
                              title="遅れ・前倒しに応じた自動色に戻します"
                            >
                              自動
                            </button>
                          </div>
                        )}
                      </div>
                      <div>
                        <PeriodBar
                          kind="planned"
                          periods={periods}
                          rangeStart={row.plannedStart}
                          rangeEnd={row.plannedEnd}
                          barHeight={pmBarH}
                          compact={compactBoard}
                          plannedColorOverride={row.plannedBarColor}
                        />
                        <PeriodBar
                          kind="actual"
                          periods={periods}
                          rangeStart={row.actualStart}
                          rangeEnd={row.actualEnd}
                          barHeight={pmBarH}
                          actualVariance={variance.kind}
                          compact={compactBoard}
                          actualColorOverride={row.actualBarColor}
                        />
                      </div>
                    </div>
                  );
                  })}
                </div>
              </section>
            );
          })}
      </div>

      <div className="process-meeting-no-print" style={{ padding: "12px 16px", maxWidth: 1800, margin: "0 auto" }}>
        {!loading && !loadError && hiddenProjects.length > 0 && (
          <div
            style={{
              marginTop: 20,
              padding: 12,
              background: "#fffde7",
              border: "1px solid #ffe082",
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8, color: "#f57f17" }}>ボードから外した案件</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#4a6280" }}>
              {hiddenProjects.map((p) => (
                <li key={p.id} style={{ marginBottom: 6 }}>
                  <span style={{ marginRight: 8 }}>{p.managementNumber ?? ""} {p.name}</span>
                  <button
                    type="button"
                    onClick={() => unhideProject(p.id)}
                    style={{
                      padding: "2px 8px",
                      fontSize: 11,
                      borderRadius: 4,
                      border: "1px solid #1565c0",
                      background: "#fff",
                      color: "#1565c0",
                      cursor: "pointer",
                    }}
                  >
                    再表示
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
