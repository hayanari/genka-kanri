"use client";

import { useState } from "react";
import { STATUS_MAP, Icons } from "@/lib/constants";
import { fmtDate } from "@/lib/constants";
import { projStats } from "@/lib/utils";
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
}) {
  const [sortBy, setSortBy] = useState("date_desc");

  const filtered = projects.filter((p) => {
    const ms = !sq || p.name.includes(sq) || p.client.includes(sq);
    const mf = !sf || p.status === sf;
    return ms && mf;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "mgmt":
        return (a.managementNumber ?? "").localeCompare(b.managementNumber ?? "");
      case "date_desc":
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      case "date_asc":
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      case "cat_koji":
        if (a.category !== b.category) {
          return a.category === "工事" ? -1 : 1;
        }
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      case "cat_gyomu":
        if (a.category !== b.category) {
          return a.category === "業務" ? -1 : 1;
        }
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
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
            {title}
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: T.ts }}>
            {filtered.length}件
          </p>
        </div>
        {showAddButton && onAdd && (
          <Btn v="primary" onClick={onAdd}>
            {Icons.plus} 新規案件
          </Btn>
        )}
      </div>
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "16px",
          flexWrap: "wrap",
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
            placeholder="案件名・顧客名で検索..."
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
            minWidth: "160px",
          }}
        >
          <option value="mgmt">管理番号</option>
          <option value="date_desc">登録年月（新しい順）</option>
          <option value="date_asc">登録年月（古い順）</option>
          <option value="cat_koji">区分：工事→業務</option>
          <option value="cat_gyomu">区分：業務→工事</option>
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
                    {p.client} ｜ {fmtDate(p.startDate)} 〜 {fmtDate(p.endDate)}
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
                      style={{ fontSize: "11px", color: "#6b9fff" }}
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
