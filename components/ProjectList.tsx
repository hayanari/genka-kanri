"use client";

import { useState, useRef } from "react";
import { STATUS_MAP, Icons } from "@/lib/constants";
import { parseExcelImportJson } from "@/lib/importExcel";
import { fmtDate } from "@/lib/constants";
import { projStats, normalizePersonName } from "@/lib/utils";
import type { Project, Cost, Quantity } from "@/lib/utils";
import { Badge, ModeBadge, Card, Bar, Btn } from "./ui/primitives";
import { T } from "@/lib/constants";
import { fmt } from "@/lib/constants";

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default function ProjectList({
  projects,
  costs,
  quantities,
  onSelect,
  onAdd,
  sq,
  setSq,
  sf,
  setSf,
  title = "案件一覧",
  showAddButton = true,
  showArchiveYear = false,
  showRestoreButton = false,
  showDeletedAt = false,
  onRestore,
  onImport,
  expectedPaymentMonthFilter,
  onClearExpectedPaymentMonthFilter,
  personInChargeFilter,
  onClearPersonInChargeFilter,
  isMobile,
}: {
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
  onSelect: (id: string) => void;
  onAdd?: () => void;
  onRestore?: (id: string) => void;
  sq: string;
  setSq: (v: string) => void;
  sf: string;
  setSf: (v: string) => void;
  title?: string;
  showAddButton?: boolean;
  showArchiveYear?: boolean;
  showRestoreButton?: boolean;
  showDeletedAt?: boolean;
  onImport?: (projects: Project[]) => void;
  expectedPaymentMonthFilter?: string | null;
  onClearExpectedPaymentMonthFilter?: () => void;
  personInChargeFilter?: string | null;
  onClearPersonInChargeFilter?: () => void;
  isMobile?: boolean;
}) {
  const [sortBy, setSortBy] = useState("updated_desc");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onImport) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const projects = parseExcelImportJson(text);
        onImport(projects);
      } catch (err) {
        alert("ファイルの読み込みに失敗しました。JSON形式を確認してください。");
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const statusFilter = sf;

  const monthFiltered = expectedPaymentMonthFilter
    ? projects.filter(
        (p) =>
          p.expectedPaymentDate &&
          p.expectedPaymentDate.startsWith(expectedPaymentMonthFilter)
      )
    : projects;

  const personFiltered = personInChargeFilter
    ? monthFiltered.filter((p) => {
        const pc = normalizePersonName(p.personInCharge) || "未定";
        return pc === personInChargeFilter;
      })
    : monthFiltered;

  const isCatOnlySort =
    sortBy === "cat_koji" || sortBy === "cat_gyomu";
  const categoryFilter = isCatOnlySort
    ? sortBy === "cat_koji"
      ? "工事"
      : "業務"
    : "";

  const filtered = personFiltered.filter((p) => {
    const ms =
      !sq ||
      p.name.includes(sq) ||
      p.client.includes(sq) ||
      (p.personInCharge ?? "").includes(sq);
    const mf = !statusFilter || p.status === statusFilter;
    const mcat = !categoryFilter || p.category === categoryFilter;
    return ms && mf && mcat;
  });

  const STATUS_ORDER = ["estimate", "ordered", "in_progress", "completed", "doc_completed", "billed", "paid"];
  const statusRank = (s: string) => {
    const i = STATUS_ORDER.indexOf(s);
    return i >= 0 ? i : 999;
  };

  const sorted = [...filtered].sort((a, b) => {
    const dateCmp = (x: Project, y: Project) =>
      new Date(y.startDate).getTime() - new Date(x.startDate).getTime();
    const updatedCmp = (x: Project, y: Project) => {
      const xT = x.updatedAt ? new Date(x.updatedAt).getTime() : new Date(x.startDate).getTime();
      const yT = y.updatedAt ? new Date(y.updatedAt).getTime() : new Date(y.startDate).getTime();
      return yT - xT;
    };
    switch (sortBy) {
      case "mgmt":
        return (a.managementNumber ?? "").localeCompare(b.managementNumber ?? "");
      case "updated_desc":
        return updatedCmp(a, b);
      case "date_desc":
        return dateCmp(a, b);
      case "date_asc":
        return -dateCmp(a, b);
      case "cat_koji":
      case "cat_gyomu":
        return updatedCmp(a, b);
      case "status_flow":
        if (statusRank(a.status) !== statusRank(b.status)) {
          return statusRank(a.status) - statusRank(b.status);
        }
        return updatedCmp(a, b);
      default:
        return 0;
    }
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "22px",
              color: T.tx,
              fontWeight: 700,
            }}
          >
            {expectedPaymentMonthFilter
              ? (() => {
                  const [y, m] = expectedPaymentMonthFilter.split("-");
                  return `${y}年${parseInt(m, 10)}月 入金予定の案件`;
                })()
              : personInChargeFilter
                ? `${personInChargeFilter} 担当案件`
                : title}
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: T.ts }}>
            {filtered.length}件
            {(expectedPaymentMonthFilter || personInChargeFilter) &&
              (onClearExpectedPaymentMonthFilter || onClearPersonInChargeFilter) && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => {
                    onClearExpectedPaymentMonthFilter?.();
                    onClearPersonInChargeFilter?.();
                  }}
                  style={{
                    marginLeft: "8px",
                    padding: "2px 8px",
                    fontSize: "11px",
                    color: T.ac,
                    background: "transparent",
                    border: `1px solid ${T.ac}`,
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  フィルタ解除
                </button>
              </>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {onImport && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              <Btn v="default" onClick={handleImportClick}>
                📥 Excel取込
              </Btn>
            </>
          )}
          {showAddButton && onAdd && (
            <Btn v="primary" onClick={onAdd}>
              {Icons.plus} 新規案件
            </Btn>
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "16px",
          flexWrap: "wrap",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            position: "relative",
            flex: 1,
            minWidth: "200px",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: T.ts,
            }}
          >
            {Icons.search}
          </div>
          <input
            placeholder="案件名・顧客名・担当者名で検索..."
            value={sq}
            onChange={(e) => setSq(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px 9px 36px",
              background: T.s,
              border: `1px solid ${T.bd}`,
              borderRadius: "8px",
              color: T.tx,
              fontSize: "13px",
              fontFamily: "inherit",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <select
          value={sf}
          onChange={(e) => setSf(e.target.value)}
          style={{
            padding: "9px 14px",
            background: T.s,
            border: `1px solid ${T.bd}`,
            borderRadius: "8px",
            color: T.tx,
            fontSize: "13px",
            fontFamily: "inherit",
          }}
        >
          <option value="">全ステータス</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{
            padding: "9px 14px",
            background: T.s,
            border: `1px solid ${T.bd}`,
            borderRadius: "8px",
            color: T.tx,
            fontSize: "13px",
            fontFamily: "inherit",
            minWidth: isMobile ? undefined : "200px",
            width: isMobile ? "100%" : undefined,
          }}
        >
          <option value="updated_desc">最新の更新順</option>
          <option value="mgmt">管理番号</option>
          <option value="date_desc">登録年月（新しい順）</option>
          <option value="date_asc">登録年月（古い順）</option>
          <option value="cat_koji">工事のみ</option>
          <option value="cat_gyomu">業務のみ</option>
          <option value="status_flow">ステータス（進捗順）</option>
        </select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {sorted.map((p) => {
          const st = projStats(p, costs, quantities);
          const hasChanges = (p.changes || []).length > 0;
          return (
            <Card
              key={p.id}
              onClick={() => onSelect(p.id)}
              style={{ cursor: "pointer" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "12px",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "6px",
                      flexWrap: "wrap",
                    }}
                  >
                    {p.managementNumber && (
                      <span
                        style={{
                          fontSize: "12px",
                          fontFamily: "monospace",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: T.s2,
                          color: T.ts,
                        }}
                      >
                        {p.managementNumber}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: T.tx,
                      }}
                    >
                      {p.name}
                    </span>
                    <Badge status={p.status} />
                    <ModeBadge mode={p.mode} />
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: T.s2,
                        color: T.ts,
                      }}
                    >
                      {p.category}
                    </span>
                    {hasChanges && (
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: "#f59e0b18",
                          color: "#f59e0b",
                        }}
                      >
                        増減あり
                      </span>
                    )}
                    {showArchiveYear && p.archiveYear && (
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: "#6b728018",
                          color: T.ts,
                        }}
                      >
                        {p.archiveYear}年度
                      </span>
                    )}
                    {showDeletedAt && p.deletedAt && (
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: T.dg + "18",
                          color: T.dg,
                        }}
                      >
                        削除: {new Date(p.deletedAt).toLocaleDateString("ja-JP")}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "12px", color: T.ts }}>
                    {p.client}
                    {p.personInCharge && ` ｜ 担当: ${p.personInCharge}`} ｜{" "}
                    {fmtDate(p.startDate)} 〜 {fmtDate(p.endDate)}
                  </div>
                </div>
                <div
                  style={{
                    textAlign: "right",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: "8px",
                  }}
                >
                  {showRestoreButton && onRestore && (
                    <Btn
                      sm
                      v="success"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestore(p.id);
                      }}
                    >
                      {Icons.restore} 復元
                    </Btn>
                  )}
                  <div>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: 700,
                        color: T.tx,
                      }}
                    >
                      ¥{fmt(st.effectiveContract)}
                    </div>
                    {st.effectiveContract !== p.originalAmount && (
                      <div
                        style={{
                          fontSize: "10px",
                          color: T.ts,
                          textDecoration: "line-through",
                        }}
                      >
                        当初 ¥{fmt(p.originalAmount)}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: "11px",
                        color: st.profitRate >= 20 ? T.ok : T.dg,
                      }}
                    >
                      粗利 ¥{fmt(st.profit)}（{st.profitRate}%）
                    </div>
                  </div>
                </div>
              </div>
              {p.mode === "subcontract" ? (
                <div
                  style={{
                    display: "flex",
                    gap: "20px",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: "12px", color: T.ts }}>
                    外注先:{" "}
                    <span style={{ color: T.tx }}>
                      {p.subcontractVendor || "未定"}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: T.ts }}>
                    マージン:{" "}
                    <span style={{ color: T.wn, fontWeight: 600 }}>
                      {p.marginRate}%
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: T.ts }}>
                    外注額:{" "}
                    <span
                      style={{
                        color: T.tx,
                        fontWeight: 600,
                      }}
                    >
                      ¥{fmt(st.subcontractAmount || p.subcontractAmount || 0)}
                    </span>
                  </div>
                  <div style={{ flex: 1 }} />
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "4px",
                      }}
                    >
                      <span style={{ fontSize: "11px", color: T.ts }}>
                        入金
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: T.tx,
                        }}
                      >
                        {pct(p.paidAmount, st.effectiveContract)}%
                      </span>
                    </div>
                    <Bar
                      value={pct(p.paidAmount, st.effectiveContract)}
                      color={T.ok}
                    />
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr auto",
                    gap: "14px",
                    alignItems: "end",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "4px",
                      }}
                    >
                      <span style={{ fontSize: "11px", color: T.ts }}>
                        進捗
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: T.tx,
                        }}
                      >
                        {p.progress}%
                      </span>
                    </div>
                    <Bar value={p.progress} />
                  </div>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "4px",
                      }}
                    >
                      <span style={{ fontSize: "11px", color: T.ts }}>
                        予算消化
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: st.budgetUsed > 90 ? T.dg : T.tx,
                        }}
                      >
                        {st.budgetUsed}%
                      </span>
                    </div>
                    <Bar
                      value={st.budgetUsed}
                      color={st.budgetUsed > 90 ? T.dg : T.wn}
                    />
                  </div>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "4px",
                      }}
                    >
                      <span style={{ fontSize: "11px", color: T.ts }}>
                        入金
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: T.tx,
                        }}
                      >
                        {pct(p.paidAmount, st.effectiveContract)}%
                      </span>
                    </div>
                    <Bar
                      value={pct(p.paidAmount, st.effectiveContract)}
                      color={T.ok}
                    />
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      minWidth: "100px",
                    }}
                  >
                    <div
                      style={{ fontSize: "11px", color: "#1d4ed8" }}
                    >
                      👷 {st.laborDays}人日 🚛 {st.vehicleDays}台日
                    </div>
                    {st.laborDays > 0 && (
                      <div style={{ fontSize: "11px", color: T.ts }}>
                        売上/人工 ¥{fmt(st.revenuePerLabor)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
