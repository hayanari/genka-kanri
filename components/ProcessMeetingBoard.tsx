"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Project } from "@/lib/utils";
import { loadData } from "@/lib/supabase/data";
import { genId, T } from "@/lib/constants";
import {
  fillRatesForRange,
  isConstructionProject,
  monthPeriods,
  type MonthPeriod,
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

function PeriodBar({
  kind,
  periods,
  rangeStart,
  rangeEnd,
}: {
  kind: "planned" | "actual";
  periods: MonthPeriod[];
  rangeStart: string | null;
  rangeEnd: string | null;
}) {
  const rates = fillRatesForRange(periods, rangeStart, rangeEnd);
  const label = kind === "planned" ? "予定" : "実施";
  const color = kind === "planned" ? "#1565c0" : "#e65100";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
      <span
        style={{
          width: 32,
          fontSize: 10,
          fontWeight: 700,
          color: kind === "planned" ? "#1565c0" : "#e65100",
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 4,
          minWidth: 120,
        }}
      >
        {rates.map((r, i) => (
          <div
            key={i}
            title={`${periods[i].label} ${Math.round(r * 100)}%`}
            style={{
              background: "#eceff1",
              borderRadius: 4,
              height: 14,
              overflow: "hidden",
              position: "relative",
              border: "1px solid #cfd8dc",
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
                opacity: r > 0 ? 0.85 : 0,
                transition: "width .2s",
              }}
            />
          </div>
        ))}
      </div>
    </div>
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowsRef = useRef<ProcessMeetingRow[]>([]);
  rowsRef.current = rows;

  const periods = useMemo(() => monthPeriods(year, month), [year, month]);

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
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? e.target.value : null)}
      style={{
        padding: "4px 6px",
        fontSize: 11,
        border: `1px solid ${T.bd}`,
        borderRadius: 4,
        fontFamily: "inherit",
        color: T.tx,
        background: T.s,
        maxWidth: 132,
      }}
    />
  );

  return (
    <div style={{ fontFamily: "'Noto Sans JP', sans-serif", background: "#f5f7fa", minHeight: "100vh", color: "#1a2535" }}>
      <div
        style={{
          background: "#fff",
          borderBottom: "2px solid #1565c0",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          position: "sticky",
          top: 0,
          zIndex: 20,
          boxShadow: "0 2px 6px rgba(0,0,0,.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link
            href="/"
            style={{
              fontSize: 12,
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
              width: 34,
              height: 34,
              background: "#1565c0",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 14,
              color: "#fff",
            }}
          >
            程
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>工程会議ボード</div>
            <div style={{ fontSize: 10, color: "#4a6280" }}>工事案件 × 手入力工程 · 10日区切り</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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

      <div style={{ padding: "12px 16px", maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 14,
            background: "#fff",
            padding: 10,
            borderRadius: 8,
            border: "1px solid #d0d8e4",
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
        </div>

        <p style={{ fontSize: 12, color: "#4a6280", marginBottom: 12, lineHeight: 1.5 }}>
          カテゴリが「工事」の案件のみ表示します。新しい工事案件は、初回アクセス時に1行自動で追加されます。
          工程名は自由に入力してください。横軸は当月を3区間（各約10日）に分けたものです。
        </p>

        {loading && <p style={{ fontSize: 13 }}>読み込み中…</p>}
        {loadError && (
          <p style={{ fontSize: 13, color: "#c62828", whiteSpace: "pre-wrap" }}>{loadError}</p>
        )}

        {!loading && !loadError && visibleProjects.length === 0 && (
          <p style={{ fontSize: 13, color: "#4a6280" }}>
            表示する工事案件がありません（未登録、またはすべて「ボードから外しています」）。
          </p>
        )}

        {!loading &&
          !loadError &&
          visibleProjects.map((proj) => {
            const prRows = rowsByProject.get(proj.id) ?? [];
            return (
              <section
                key={proj.id}
                style={{
                  background: "#fff",
                  border: "1px solid #d0d8e4",
                  borderRadius: 10,
                  marginBottom: 16,
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
                    padding: "10px 12px",
                    background: "#eef1f6",
                    borderBottom: "1px solid #d0d8e4",
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "monospace",
                        color: "#4a6280",
                        marginRight: 8,
                      }}
                    >
                      {proj.managementNumber ?? "—"}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{proj.name}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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

                <div style={{ padding: 8, overflowX: "auto" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(160px,1fr) minmax(280px,2.2fr)",
                      gap: 8,
                      fontSize: 10,
                      color: "#4a6280",
                      marginBottom: 6,
                      paddingLeft: 4,
                      minWidth: 480,
                    }}
                  >
                    <span>工程名 / 日付</span>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, textAlign: "center" }}>
                      {periods.map((p) => (
                        <span key={p.start}>{p.label}</span>
                      ))}
                    </div>
                  </div>

                  {prRows.map((row) => (
                    <div
                      key={row.id}
                      style={{
                        borderTop: "1px solid #eceff1",
                        padding: "10px 6px",
                        display: "grid",
                        gridTemplateColumns: "minmax(160px,1fr) minmax(280px,2.2fr)",
                        gap: 10,
                        alignItems: "start",
                        minWidth: 480,
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6 }}>
                          <input
                            type="text"
                            value={row.processName}
                            placeholder="例: 清掃工・前処理工"
                            onChange={(e) => updateRow(row.id, { processName: e.target.value })}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: "6px 8px",
                              fontSize: 12,
                              border: `1px solid ${T.bd}`,
                              borderRadius: 4,
                              fontFamily: "inherit",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeRow(row.id, proj.id)}
                            style={{
                              padding: "4px 8px",
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
                          style={{
                            display: "grid",
                            gridTemplateColumns: "auto 1fr",
                            gap: 4,
                            alignItems: "center",
                            fontSize: 10,
                            color: "#546e7a",
                          }}
                        >
                          <span>予定</span>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                            {dateInput(row.plannedStart, (v) => updateRow(row.id, { plannedStart: v }))}
                            <span>〜</span>
                            {dateInput(row.plannedEnd, (v) => updateRow(row.id, { plannedEnd: v }))}
                          </div>
                          <span>実施</span>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                            {dateInput(row.actualStart, (v) => updateRow(row.id, { actualStart: v }))}
                            <span>〜</span>
                            {dateInput(row.actualEnd, (v) => updateRow(row.id, { actualEnd: v }))}
                          </div>
                        </div>
                      </div>
                      <div>
                        <PeriodBar kind="planned" periods={periods} rangeStart={row.plannedStart} rangeEnd={row.plannedEnd} />
                        <PeriodBar kind="actual" periods={periods} rangeStart={row.actualStart} rangeEnd={row.actualEnd} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

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
