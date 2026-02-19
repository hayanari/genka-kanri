"use client";

import { useState } from "react";
import {
  genId,
  fmt,
  fmtDate,
  COST_CATEGORIES,
  QUANTITY_CATEGORIES,
  STATUS_MAP,
  PAYMENT_STATUS,
  CHANGE_TYPES,
  Icons,
  T,
} from "@/lib/constants";
import { getEffectiveContract, projStats } from "@/lib/utils";
import type { Project, Cost, Quantity } from "@/lib/utils";
import {
  Badge,
  ModeBadge,
  Card,
  Bar,
  Btn,
  Inp,
  Sel,
  Txt,
  Modal,
  Metric,
} from "./ui/primitives";

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default function ProjectDetail({
  project: p,
  costs: allCosts,
  quantities: allQty,
  onBack,
  onUpdateProject,
  onAddCost,
  onDeleteCost,
  onAddQty,
  onDeleteQty,
  onAddPayment,
  onDeletePayment,
  onAddChange,
  onDeleteChange,
}: {
  project: Project;
  costs: Cost[];
  quantities: Quantity[];
  onBack: () => void;
  onUpdateProject: (u: Project) => void;
  onAddCost: (c: Cost) => void;
  onDeleteCost: (id: string) => void;
  onAddQty: (q: Quantity) => void;
  onDeleteQty: (id: string) => void;
  onAddPayment: (pid: string, pay: { id: string; date: string; amount: number; note: string }) => void;
  onDeletePayment: (pid: string, payId: string) => void;
  onAddChange: (pid: string, ch: { id: string; date: string; type: string; amount: number; description: string }) => void;
  onDeleteChange: (pid: string, chId: string) => void;
}) {
  const isSubcontract = p.mode === "subcontract";
  const defaultTab = isSubcontract ? "payments" : "costs";
  const [tab, setTab] = useState(defaultTab);
  const [costModal, setCostModal] = useState(false);
  const [qtyModal, setQtyModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [changeModal, setChangeModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [cf, setCf] = useState({
    category: "material",
    description: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    vendor: "",
  });
  const [qf, setQf] = useState({
    category: "labor",
    description: "",
    quantity: "",
    date: new Date().toISOString().slice(0, 10),
    note: "",
  });
  const [pf, setPf] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    note: "",
  });
  const [chf, setChf] = useState({
    type: "increase",
    amount: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [ef, setEf] = useState<Project | null>(null);

  const st = projStats(p, allCosts, allQty);
  const payStatus =
    p.paidAmount >= st.effectiveContract
      ? "full"
      : p.paidAmount > 0
        ? "partial"
        : "unpaid";
  const costByCat: Record<string, number> = {};
  st.costs.forEach((c) => {
    costByCat[c.category] = (costByCat[c.category] || 0) + c.amount;
  });

  const handleAddCost = () => {
    onAddCost({
      id: genId(),
      projectId: p.id,
      ...cf,
      amount: Number(cf.amount),
    });
    setCostModal(false);
    setCf({
      category: "material",
      description: "",
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      vendor: "",
    });
  };
  const handleAddQty = () => {
    onAddQty({
      id: genId(),
      projectId: p.id,
      ...qf,
      quantity: Number(qf.quantity),
    });
    setQtyModal(false);
    setQf({
      category: "labor",
      description: "",
      quantity: "",
      date: new Date().toISOString().slice(0, 10),
      note: "",
    });
  };
  const handleAddPay = () => {
    onAddPayment(p.id, {
      id: genId(),
      date: pf.date,
      amount: Number(pf.amount),
      note: pf.note,
    });
    setPayModal(false);
    setPf({
      date: new Date().toISOString().slice(0, 10),
      amount: "",
      note: "",
    });
  };
  const handleAddChange = () => {
    onAddChange(p.id, {
      id: genId(),
      ...chf,
      amount: Number(chf.amount),
    });
    setChangeModal(false);
    setChf({
      type: "increase",
      amount: "",
      description: "",
      date: new Date().toISOString().slice(0, 10),
    });
  };

  const tabs = isSubcontract
    ? [
        { id: "payments", label: "🏦 入金管理" },
        { id: "changes", label: "📝 増減額" },
        { id: "summary", label: "📊 収支サマリー" },
      ]
    : [
        { id: "costs", label: "💰 原価明細" },
        { id: "labor", label: "👷 人工・車両" },
        { id: "payments", label: "🏦 入金管理" },
        { id: "changes", label: "📝 増減額" },
        { id: "summary", label: "📊 サマリー" },
      ];

  return (
    <div>
      <Btn v="ghost" onClick={onBack} sm style={{ marginBottom: "16px" }}>
        {Icons.back} 戻る
      </Btn>

      <Card style={{ marginBottom: "16px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "8px",
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "20px", color: T.tx }}>
                {p.name}
              </h2>
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
            </div>
            <div style={{ fontSize: "13px", color: T.ts }}>
              顧客: {p.client} ｜ 工期: {fmtDate(p.startDate)} 〜{" "}
              {fmtDate(p.endDate)}
              {p.notes && ` ｜ ${p.notes}`}
            </div>
          </div>
          <Btn
            sm
            onClick={() => {
              setEf({ ...p });
              setEditModal(true);
            }}
          >
            {Icons.edit} 編集
          </Btn>
        </div>

        {st.effectiveContract !== p.originalAmount && (
          <div
            style={{
              marginTop: "12px",
              padding: "10px 14px",
              background: "#f59e0b10",
              borderRadius: "8px",
              border: "1px solid #f59e0b22",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: "12px", color: T.wn }}>📝 契約変更あり</span>
            <span style={{ fontSize: "12px", color: T.ts }}>
              当初: ¥{fmt(p.originalAmount)}
            </span>
            <span style={{ fontSize: "12px", color: T.tx }}>→</span>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 700,
                color: T.tx,
              }}
            >
              現在: ¥{fmt(st.effectiveContract)}
            </span>
            <span
              style={{
                fontSize: "12px",
                color: st.effectiveContract > p.originalAmount ? T.ok : T.dg,
              }}
            >
              ({st.effectiveContract > p.originalAmount ? "+" : ""}¥
              {fmt(st.effectiveContract - p.originalAmount)})
            </span>
          </div>
        )}

        {isSubcontract ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              marginTop: "20px",
            }}
          >
            <Metric
              label="受注額（増減後）"
              value={`¥${fmt(st.effectiveContract)}`}
            />
            <Metric label="マージン率" value={`${p.marginRate}%`} color={T.wn} />
            <Metric
              label="外注額"
              value={`¥${fmt(st.subcontractAmount || p.subcontractAmount)}`}
              sub={`外注先: ${p.subcontractVendor || "未定"}`}
            />
            <Metric
              label="粗利"
              value={`¥${fmt(st.profit)}`}
              sub={`利益率 ${st.profitRate}%`}
              color={st.profitRate >= 5 ? T.ok : T.dg}
            />
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                marginTop: "20px",
              }}
            >
              <Metric
                label="受注額（増減後）"
                value={`¥${fmt(st.effectiveContract)}`}
              />
              <Metric
                label="実行予算"
                value={`¥${fmt(p.budget)}`}
                sub={`消化 ${st.budgetUsed}%`}
                color={st.budgetUsed > 90 ? T.dg : T.tx}
              />
              <Metric
                label="原価合計"
                value={`¥${fmt(st.totalCost)}`}
                sub={`残予算 ¥${fmt(p.budget - st.totalCost)}`}
                color={st.totalCost > p.budget ? T.dg : T.tx}
              />
              <Metric
                label="粗利"
                value={`¥${fmt(st.profit)}`}
                sub={`利益率 ${st.profitRate}%`}
                color={st.profitRate >= 20 ? T.ok : T.dg}
              />
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                marginTop: "10px",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  background: "#1a2744",
                  borderRadius: "8px",
                  border: "1px solid #253a5e",
                  display: "flex",
                  gap: "24px",
                  flex: 1,
                  minWidth: "300px",
                }}
              >
                <div>
                  <div style={{ fontSize: "10px", color: "#6b9fff" }}>人工</div>
                  <div
                    style={{ fontSize: "17px", fontWeight: 700, color: T.tx }}
                  >
                    {st.laborDays}
                    <span style={{ fontSize: "11px", color: T.ts }}> 人日</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "#6b9fff" }}>車両</div>
                  <div
                    style={{ fontSize: "17px", fontWeight: 700, color: T.tx }}
                  >
                    {st.vehicleDays}
                    <span style={{ fontSize: "11px", color: T.ts }}> 台日</span>
                  </div>
                </div>
                <div
                  style={{
                    borderLeft: "1px solid #253a5e",
                    paddingLeft: "16px",
                  }}
                >
                  <div style={{ fontSize: "10px", color: "#6b9fff" }}>
                    売上/人工
                  </div>
                  <div
                    style={{
                      fontSize: "17px",
                      fontWeight: 700,
                      color: "#60a5fa",
                    }}
                  >
                    {st.laborDays ? `¥${fmt(st.revenuePerLabor)}` : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "#6b9fff" }}>
                    粗利/人工
                  </div>
                  <div
                    style={{
                      fontSize: "17px",
                      fontWeight: 700,
                      color:
                        st.profitPerLabor >= 30000 ? T.ok : T.wn,
                    }}
                  >
                    {st.laborDays ? `¥${fmt(st.profitPerLabor)}` : "—"}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: "16px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "6px",
                }}
              >
                <span style={{ fontSize: "12px", color: T.ts }}>進捗</span>
                <span
                  style={{ fontSize: "12px", fontWeight: 600, color: T.tx }}
                >
                  {p.progress}%
                </span>
              </div>
              <Bar value={p.progress} h={8} />
            </div>
          </>
        )}
      </Card>

      <div
        style={{
          display: "flex",
          gap: "2px",
          marginBottom: "16px",
          background: T.s,
          borderRadius: "10px",
          padding: "3px",
          border: `1px solid ${T.bd}`,
        }}
      >
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            style={{
              flex: 1,
              padding: "10px",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "11px",
              fontWeight: 600,
              background: tab === tb.id ? T.ac : "transparent",
              color: tab === tb.id ? "#fff" : T.ts,
              transition: "all .15s",
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "costs" && !isSubcontract && (
        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h4 style={{ margin: 0, fontSize: "14px", color: T.tx }}>
              原価明細（実費） {st.costs.length}件
            </h4>
            <Btn v="primary" sm onClick={() => setCostModal(true)}>
              {Icons.plus} 原価追加
            </Btn>
          </div>
          {st.costs.length === 0 ? (
            <div
              style={{ textAlign: "center", padding: "40px", color: T.ts }}
            >
              まだ原価が登録されていません
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.bd}` }}>
                  {["日付", "区分", "内容", "業者", "金額", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px",
                        fontSize: "11px",
                        color: T.ts,
                        fontWeight: 500,
                        textAlign: h === "金額" ? "right" : "left",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...st.costs]
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() - new Date(a.date).getTime()
                  )
                  .map((c) => {
                    const cat = COST_CATEGORIES[c.category];
                    return (
                      <tr
                        key={c.id}
                        style={{ borderBottom: `1px solid ${T.bd}22` }}
                      >
                        <td
                          style={{
                            padding: "10px 8px",
                            fontSize: "12px",
                            color: T.ts,
                          }}
                        >
                          {fmtDate(c.date)}
                        </td>
                        <td style={{ padding: "10px 8px" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              background: cat.color + "18",
                              color: cat.color,
                            }}
                          >
                            {cat.icon} {cat.label}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            fontSize: "12px",
                            color: T.tx,
                          }}
                        >
                          {c.description}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            fontSize: "12px",
                            color: T.ts,
                          }}
                        >
                          {c.vendor}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            fontSize: "13px",
                            fontWeight: 600,
                            color: T.tx,
                            textAlign: "right",
                          }}
                        >
                          ¥{fmt(c.amount)}
                        </td>
                        <td style={{ padding: "10px 4px" }}>
                          <button
                            onClick={() => onDeleteCost(c.id)}
                            style={{
                              background: "none",
                              border: "none",
                              color: T.ts,
                              cursor: "pointer",
                              opacity: 0.6,
                            }}
                          >
                            {Icons.trash}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                <tr style={{ borderTop: `2px solid ${T.bd}` }}>
                  <td
                    colSpan={4}
                    style={{
                      padding: "12px 8px",
                      fontSize: "13px",
                      fontWeight: 700,
                      color: T.tx,
                    }}
                  >
                    合計
                  </td>
                  <td
                    style={{
                      padding: "12px 8px",
                      fontSize: "15px",
                      fontWeight: 700,
                      color: T.tx,
                      textAlign: "right",
                    }}
                  >
                    ¥{fmt(st.totalCost)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
          <div
            style={{
              marginTop: "20px",
              padding: "16px",
              background: T.s2,
              borderRadius: "10px",
            }}
          >
            <h5
              style={{ margin: "0 0 12px", fontSize: "12px", color: T.ts }}
            >
              カテゴリ別内訳
            </h5>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "10px",
              }}
            >
              {Object.entries(COST_CATEGORIES).map(([k, cat]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: "12px", color: T.ts }}>
                    {cat.icon} {cat.label}
                  </span>
                  <span
                    style={{ fontSize: "12px", fontWeight: 600, color: T.tx }}
                  >
                    ¥{fmt(costByCat[k] || 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {tab === "labor" && !isSubcontract && (
        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h4 style={{ margin: 0, fontSize: "14px", color: T.tx }}>
              人工・車両記録 {st.quantities.length}件
            </h4>
            <Btn v="primary" sm onClick={() => setQtyModal(true)}>
              {Icons.plus} 記録追加
            </Btn>
          </div>
          <div
            style={{
              padding: "16px",
              background: "#1a2744",
              borderRadius: "10px",
              border: "1px solid #253a5e",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                color: T.ts,
                marginBottom: "12px",
              }}
            >
              ※ 人工・車両は数量のみ記録。生産性を「売上÷人工」「粗利÷人工」で評価します。
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "16px",
              }}
            >
              <div>
                <div style={{ fontSize: "10px", color: "#6b9fff" }}>
                  👷 人工合計
                </div>
                <div
                  style={{ fontSize: "20px", fontWeight: 700, color: T.tx }}
                >
                  {st.laborDays}
                  <span style={{ fontSize: "11px", color: T.ts }}> 人日</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#6b9fff" }}>
                  🚛 車両合計
                </div>
                <div
                  style={{ fontSize: "20px", fontWeight: 700, color: T.tx }}
                >
                  {st.vehicleDays}
                  <span style={{ fontSize: "11px", color: T.ts }}> 台日</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#6b9fff" }}>
                  売上/人工
                </div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "#60a5fa",
                  }}
                >
                  {st.laborDays ? `¥${fmt(st.revenuePerLabor)}` : "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#6b9fff" }}>
                  粗利/人工
                </div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    color:
                      st.profitPerLabor >= 30000 ? T.ok : T.wn,
                  }}
                >
                  {st.laborDays ? `¥${fmt(st.profitPerLabor)}` : "—"}
                </div>
              </div>
            </div>
          </div>
          {st.quantities.length === 0 ? (
            <div
              style={{ textAlign: "center", padding: "40px", color: T.ts }}
            >
              まだ記録がありません
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.bd}` }}>
                  {["日付", "区分", "内容", "数量", "備考", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px",
                        fontSize: "11px",
                        color: T.ts,
                        fontWeight: 500,
                        textAlign: h === "数量" ? "right" : "left",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...st.quantities]
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() - new Date(a.date).getTime()
                  )
                  .map((q) => {
                    const cat = QUANTITY_CATEGORIES[q.category];
                    return (
                      <tr
                        key={q.id}
                        style={{ borderBottom: `1px solid ${T.bd}22` }}
                      >
                        <td
                          style={{
                            padding: "10px 8px",
                            fontSize: "12px",
                            color: T.ts,
                          }}
                        >
                          {fmtDate(q.date)}
                        </td>
                        <td style={{ padding: "10px 8px" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              background: cat.color + "18",
                              color: cat.color,
                            }}
                          >
                            {cat.icon} {cat.label}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            fontSize: "12px",
                            color: T.tx,
                          }}
                        >
                          {q.description}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            fontSize: "13px",
                            fontWeight: 600,
                            color: T.tx,
                            textAlign: "right",
                          }}
                        >
                          {q.quantity} {cat.unit}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            fontSize: "12px",
                            color: T.ts,
                          }}
                        >
                          {q.note}
                        </td>
                        <td style={{ padding: "10px 4px" }}>
                          <button
                            onClick={() => onDeleteQty(q.id)}
                            style={{
                              background: "none",
                              border: "none",
                              color: T.ts,
                              cursor: "pointer",
                              opacity: 0.6,
                            }}
                          >
                            {Icons.trash}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "changes" && (
        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h4 style={{ margin: 0, fontSize: "14px", color: T.tx }}>
              増減額履歴
            </h4>
            <Btn v="warning" sm onClick={() => setChangeModal(true)}>
              {Icons.plus} 増減額登録
            </Btn>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <Metric
              label="当初契約額"
              value={`¥${fmt(p.originalAmount)}`}
              color={T.ts}
            />
            <Metric
              label="増減合計"
              value={`${st.effectiveContract >= p.originalAmount ? "+" : ""}¥${fmt(st.effectiveContract - p.originalAmount)}`}
              color={st.effectiveContract >= p.originalAmount ? T.ok : T.dg}
            />
            <Metric
              label="現契約額"
              value={`¥${fmt(st.effectiveContract)}`}
              color={T.ac}
            />
          </div>

          {(p.changes || []).length === 0 ? (
            <div
              style={{ textAlign: "center", padding: "40px", color: T.ts }}
            >
              増減額の変更履歴はありません
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.bd}` }}>
                  {["日付", "種別", "金額", "内容", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px",
                        fontSize: "11px",
                        color: T.ts,
                        fontWeight: 500,
                        textAlign: h === "金額" ? "right" : "left",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...(p.changes || [])]
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() - new Date(a.date).getTime()
                  )
                  .map((ch) => {
                    const ct = CHANGE_TYPES[ch.type];
                    return (
                      <tr
                        key={ch.id}
                        style={{ borderBottom: `1px solid ${T.bd}22` }}
                      >
                        <td
                          style={{
                            padding: "10px 8px",
                            fontSize: "12px",
                            color: T.ts,
                          }}
                        >
                          {fmtDate(ch.date)}
                        </td>
                        <td style={{ padding: "10px 8px" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              background: ct.color + "18",
                              color: ct.color,
                              fontWeight: 600,
                            }}
                          >
                            {ct.label}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            fontSize: "13px",
                            fontWeight: 600,
                            color: ct.color,
                            textAlign: "right",
                          }}
                        >
                          {ct.sign}¥{fmt(ch.amount)}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            fontSize: "12px",
                            color: T.tx,
                          }}
                        >
                          {ch.description}
                        </td>
                        <td style={{ padding: "10px 4px" }}>
                          <button
                            onClick={() => onDeleteChange(p.id, ch.id)}
                            style={{
                              background: "none",
                              border: "none",
                              color: T.ts,
                              cursor: "pointer",
                              opacity: 0.6,
                            }}
                          >
                            {Icons.trash}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "payments" && (
        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <h4 style={{ margin: 0, fontSize: "14px", color: T.tx }}>
                入金管理
              </h4>
              <Badge status={payStatus} map={PAYMENT_STATUS} />
            </div>
            <Btn v="primary" sm onClick={() => setPayModal(true)}>
              {Icons.plus} 入金登録
            </Btn>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <Metric label="請求額" value={`¥${fmt(p.billedAmount)}`} />
            <Metric
              label="入金済"
              value={`¥${fmt(p.paidAmount)}`}
              color={T.ok}
            />
            <Metric
              label="未入金"
              value={`¥${fmt(p.billedAmount - p.paidAmount)}`}
              color={p.billedAmount - p.paidAmount > 0 ? T.dg : T.tx}
            />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <span style={{ fontSize: "12px", color: T.ts }}>入金進捗</span>
              <span
                style={{ fontSize: "12px", fontWeight: 600, color: T.tx }}
              >
                {pct(p.paidAmount, st.effectiveContract)}%
              </span>
            </div>
            <Bar
              value={pct(p.paidAmount, st.effectiveContract)}
              color={T.ok}
              h={8}
            />
          </div>
          {p.payments.length === 0 ? (
            <div
              style={{ textAlign: "center", padding: "40px", color: T.ts }}
            >
              まだ入金記録がありません
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.bd}` }}>
                  {["日付", "金額", "摘要", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 10px",
                        fontSize: "11px",
                        color: T.ts,
                        fontWeight: 500,
                        textAlign: h === "金額" ? "right" : "left",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...p.payments]
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() - new Date(a.date).getTime()
                  )
                  .map((pay) => (
                    <tr
                      key={pay.id}
                      style={{ borderBottom: `1px solid ${T.bd}22` }}
                    >
                      <td
                        style={{
                          padding: "10px",
                          fontSize: "12px",
                          color: T.ts,
                        }}
                      >
                        {fmtDate(pay.date)}
                      </td>
                      <td
                        style={{
                          padding: "10px",
                          fontSize: "13px",
                          fontWeight: 600,
                          color: T.ok,
                          textAlign: "right",
                        }}
                      >
                        ¥{fmt(pay.amount)}
                      </td>
                      <td
                        style={{
                          padding: "10px",
                          fontSize: "12px",
                          color: T.tx,
                        }}
                      >
                        {pay.note}
                      </td>
                      <td style={{ padding: "10px 4px" }}>
                        <button
                          onClick={() => onDeletePayment(p.id, pay.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: T.ts,
                            cursor: "pointer",
                            opacity: 0.6,
                          }}
                        >
                          {Icons.trash}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "summary" && (
        <Card>
          <h4
            style={{ margin: "0 0 20px", fontSize: "14px", color: T.tx }}
          >
            収支サマリー
          </h4>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
            }}
          >
            <div>
              <h5
                style={{
                  fontSize: "12px",
                  color: T.ts,
                  margin: "0 0 12px",
                }}
              >
                収入
              </h5>
              {[
                ["当初契約額", p.originalAmount, T.ts],
                ["増減後受注額", st.effectiveContract, T.ac],
                ["請求済", p.billedAmount, T.tx],
                ["入金済", p.paidAmount, T.ok],
              ].map(([l, v, c]) => (
                <div
                  key={String(l)}
                  style={{
                    padding: "12px",
                    background: T.s2,
                    borderRadius: "8px",
                    marginBottom: "8px",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: "13px", color: T.tx }}>{l}</span>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: c as string,
                    }}
                  >
                    ¥{fmt(v as number)}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <h5
                style={{
                  fontSize: "12px",
                  color: T.ts,
                  margin: "0 0 12px",
                }}
              >
                支出
              </h5>
              {isSubcontract ? (
                <>
                  <div
                    style={{
                      padding: "12px",
                      background: T.s2,
                      borderRadius: "8px",
                      marginBottom: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: "13px", color: T.tx }}>
                      🏗️ 外注費（{p.subcontractVendor || "未定"}）
                    </span>
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: T.tx,
                      }}
                    >
                      ¥{fmt(st.subcontractAmount || p.subcontractAmount)}
                    </span>
                  </div>
                  <div
                    style={{
                      padding: "10px 12px",
                      background: T.s2,
                      borderRadius: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span style={{ fontSize: "12px", color: T.ts }}>
                      マージン率
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: T.wn,
                      }}
                    >
                      {p.marginRate}%
                    </span>
                  </div>
                </>
              ) : (
                <>
                  {Object.entries(COST_CATEGORIES).map(([k, cat]) => {
                    const v = costByCat[k] || 0;
                    if (!v) return null;
                    return (
                      <div
                        key={k}
                        style={{
                          padding: "10px 12px",
                          background: T.s2,
                          borderRadius: "8px",
                          marginBottom: "6px",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ fontSize: "12px", color: T.tx }}>
                          {cat.icon} {cat.label}
                        </span>
                        <span
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: T.tx,
                          }}
                        >
                          ¥{fmt(v)}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
              <div
                style={{
                  padding: "12px",
                  background: T.bd,
                  borderRadius: "8px",
                  marginTop: "8px",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: T.tx,
                  }}
                >
                  原価合計
                </span>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    color: T.tx,
                  }}
                >
                  ¥{fmt(st.totalCost)}
                </span>
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: "24px",
              padding: "20px",
              background:
                st.profitRate >= 15 ? T.ok + "10" : T.dg + "10",
              borderRadius: "12px",
              border: `1px solid ${st.profitRate >= 15 ? T.ok : T.dg}33`,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "20px",
                textAlign: "center",
              }}
            >
              <div>
                <div
                  style={{ fontSize: "11px", color: T.ts, marginBottom: "6px" }}
                >
                  粗利益
                </div>
                <div
                  style={{
                    fontSize: "22px",
                    fontWeight: 700,
                    color: st.profitRate >= 15 ? T.ok : T.dg,
                  }}
                >
                  ¥{fmt(st.profit)}
                </div>
              </div>
              <div>
                <div
                  style={{ fontSize: "11px", color: T.ts, marginBottom: "6px" }}
                >
                  利益率
                </div>
                <div
                  style={{
                    fontSize: "22px",
                    fontWeight: 700,
                    color: st.profitRate >= 15 ? T.ok : T.dg,
                  }}
                >
                  {st.profitRate}%
                </div>
              </div>
              <div>
                <div
                  style={{ fontSize: "11px", color: T.ts, marginBottom: "6px" }}
                >
                  {isSubcontract ? "マージン" : "予算残"}
                </div>
                <div
                  style={{
                    fontSize: "22px",
                    fontWeight: 700,
                    color: T.tx,
                  }}
                >
                  {isSubcontract
                    ? `${p.marginRate}%`
                    : `¥${fmt(p.budget - st.totalCost)}`}
                </div>
              </div>
            </div>
          </div>
          {!isSubcontract && st.laborDays > 0 && (
            <div
              style={{
                marginTop: "16px",
                padding: "20px",
                background: "#1a2744",
                borderRadius: "12px",
                border: "1px solid #253a5e",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  color: "#6b9fff",
                  fontWeight: 600,
                  marginBottom: "14px",
                }}
              >
                👷 生産性指標
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  gap: "20px",
                  textAlign: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: T.ts,
                      marginBottom: "6px",
                    }}
                  >
                    投入人工
                  </div>
                  <div
                    style={{
                      fontSize: "20px",
                      fontWeight: 700,
                      color: T.tx,
                    }}
                  >
                    {st.laborDays} 人日
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: T.ts,
                      marginBottom: "6px",
                    }}
                  >
                    車両稼働
                  </div>
                  <div
                    style={{
                      fontSize: "20px",
                      fontWeight: 700,
                      color: T.tx,
                    }}
                  >
                    {st.vehicleDays} 台日
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: T.ts,
                      marginBottom: "6px",
                    }}
                  >
                    売上/人工
                  </div>
                  <div
                    style={{
                      fontSize: "20px",
                      fontWeight: 700,
                      color: "#60a5fa",
                    }}
                  >
                    ¥{fmt(st.revenuePerLabor)}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: T.ts,
                      marginBottom: "6px",
                    }}
                  >
                    粗利/人工
                  </div>
                  <div
                    style={{
                      fontSize: "20px",
                      fontWeight: 700,
                      color:
                        st.profitPerLabor >= 30000 ? T.ok : T.wn,
                    }}
                  >
                    ¥{fmt(st.profitPerLabor)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      <Modal open={costModal} onClose={() => setCostModal(false)} title="原価追加（実費）" w={480}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <Sel
            label="区分"
            value={cf.category}
            onChange={(e) =>
              setCf((f) => ({ ...f, category: e.target.value }))
            }
          >
            {Object.entries(COST_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.icon} {v.label}
              </option>
            ))}
          </Sel>
          <Inp
            label="内容"
            placeholder="例: 木材一式"
            value={cf.description}
            onChange={(e) =>
              setCf((f) => ({ ...f, description: e.target.value }))
            }
          />
          <Inp
            label="業者名"
            placeholder="例: ○○木材店"
            value={cf.vendor}
            onChange={(e) => setCf((f) => ({ ...f, vendor: e.target.value }))}
          />
          <Inp
            label="金額 (¥)"
            type="number"
            placeholder="1200000"
            value={cf.amount}
            onChange={(e) => setCf((f) => ({ ...f, amount: e.target.value }))}
          />
          <Inp
            label="日付"
            type="date"
            value={cf.date}
            onChange={(e) => setCf((f) => ({ ...f, date: e.target.value }))}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "8px",
            }}
          >
            <Btn onClick={() => setCostModal(false)}>キャンセル</Btn>
            <Btn v="primary" onClick={handleAddCost}>
              追加
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={qtyModal} onClose={() => setQtyModal(false)} title="人工・車両記録追加" w={480}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <Sel
            label="区分"
            value={qf.category}
            onChange={(e) =>
              setQf((f) => ({ ...f, category: e.target.value }))
            }
          >
            {Object.entries(QUANTITY_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.icon} {v.label}（{v.unit}）
              </option>
            ))}
          </Sel>
          <Inp
            label="内容"
            placeholder="例: 大工、2tトラック"
            value={qf.description}
            onChange={(e) =>
              setQf((f) => ({ ...f, description: e.target.value }))
            }
          />
          <Inp
            label={`数量（${QUANTITY_CATEGORIES[qf.category].unit}）`}
            type="number"
            placeholder="例: 50"
            value={qf.quantity}
            onChange={(e) =>
              setQf((f) => ({ ...f, quantity: e.target.value }))
            }
          />
          <Inp
            label="日付"
            type="date"
            value={qf.date}
            onChange={(e) => setQf((f) => ({ ...f, date: e.target.value }))}
          />
          <Inp
            label="備考"
            placeholder="例: 5人×10日"
            value={qf.note}
            onChange={(e) => setQf((f) => ({ ...f, note: e.target.value }))}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "8px",
            }}
          >
            <Btn onClick={() => setQtyModal(false)}>キャンセル</Btn>
            <Btn v="primary" onClick={handleAddQty}>
              追加
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={payModal} onClose={() => setPayModal(false)} title="入金登録" w={420}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <Inp
            label="入金日"
            type="date"
            value={pf.date}
            onChange={(e) =>
              setPf((f) => ({ ...f, date: e.target.value }))
            }
          />
          <Inp
            label="金額 (¥)"
            type="number"
            placeholder="入金額"
            value={pf.amount}
            onChange={(e) =>
              setPf((f) => ({ ...f, amount: e.target.value }))
            }
          />
          <Inp
            label="摘要"
            placeholder="例: 着手金"
            value={pf.note}
            onChange={(e) =>
              setPf((f) => ({ ...f, note: e.target.value }))
            }
          />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "8px",
            }}
          >
            <Btn onClick={() => setPayModal(false)}>キャンセル</Btn>
            <Btn v="primary" onClick={handleAddPay}>
              登録
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={changeModal} onClose={() => setChangeModal(false)} title="増減額登録" w={480}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div
            style={{
              padding: "12px",
              background: T.s2,
              borderRadius: "8px",
              fontSize: "12px",
              color: T.ts,
            }}
          >
            現在の契約額:{" "}
            <span style={{ color: T.tx, fontWeight: 700 }}>
              ¥{fmt(st.effectiveContract)}
            </span>
          </div>
          <Sel
            label="種別"
            value={chf.type}
            onChange={(e) =>
              setChf((f) => ({ ...f, type: e.target.value }))
            }
          >
            <option value="increase">
              ➕ 増額（追加工事・設計変更等）
            </option>
            <option value="decrease">
              ➖ 減額（仕様変更・範囲縮小等）
            </option>
          </Sel>
          <Inp
            label="金額 (¥)"
            type="number"
            placeholder="例: 500000"
            value={chf.amount}
            onChange={(e) =>
              setChf((f) => ({ ...f, amount: e.target.value }))
            }
          />
          <Inp
            label="理由・内容"
            placeholder="例: 追加工事 ウッドデッキ設置"
            value={chf.description}
            onChange={(e) =>
              setChf((f) => ({ ...f, description: e.target.value }))
            }
          />
          <Inp
            label="日付"
            type="date"
            value={chf.date}
            onChange={(e) =>
              setChf((f) => ({ ...f, date: e.target.value }))
            }
          />
          {chf.amount && (
            <div
              style={{
                padding: "12px",
                background:
                  chf.type === "increase" ? T.ok + "10" : T.dg + "10",
                borderRadius: "8px",
                fontSize: "13px",
              }}
            >
              変更後:{" "}
              <span style={{ fontWeight: 700, color: T.tx }}>
                ¥
                {fmt(
                  st.effectiveContract +
                    (chf.type === "increase" ? 1 : -1) * Number(chf.amount)
                )}
              </span>
              <span
                style={{
                  color: chf.type === "increase" ? T.ok : T.dg,
                  marginLeft: "8px",
                }}
              >
                ({chf.type === "increase" ? "+" : "−"}¥
                {fmt(Number(chf.amount))})
              </span>
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "8px",
            }}
          >
            <Btn onClick={() => setChangeModal(false)}>キャンセル</Btn>
            <Btn v="primary" onClick={handleAddChange}>
              登録
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={editModal} onClose={() => setEditModal(false)} title="案件編集" w={600}>
        {ef && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <Inp
              label="案件名"
              value={ef.name}
              onChange={(e) =>
                setEf((f) => ({ ...f!, name: e.target.value }))
              }
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
              }}
            >
              <Inp
                label="顧客名"
                value={ef.client}
                onChange={(e) =>
                  setEf((f) => ({ ...f!, client: e.target.value }))
                }
              />
              <Sel
                label="区分"
                value={ef.category}
                onChange={(e) =>
                  setEf((f) => ({ ...f!, category: e.target.value }))
                }
              >
                <option value="工事">工事</option>
                <option value="業務">業務</option>
              </Sel>
            </div>

            <div>
              <label
                style={{
                  fontSize: "12px",
                  color: T.ts,
                  fontWeight: 500,
                  marginBottom: "6px",
                  display: "block",
                }}
              >
                施工形態
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setEf((f) => ({ ...f!, mode: "normal" }))}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "8px",
                    border: `2px solid ${ef.mode === "normal" ? T.ac : T.bd}`,
                    background: ef.mode === "normal" ? T.al : T.s2,
                    color: ef.mode === "normal" ? T.ac : T.ts,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  🔧 自社施工
                </button>
                <button
                  onClick={() =>
                    setEf((f) => ({ ...f!, mode: "subcontract" }))
                  }
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "8px",
                    border: `2px solid ${ef.mode === "subcontract" ? T.wn : T.bd}`,
                    background:
                      ef.mode === "subcontract" ? T.wn + "15" : T.s2,
                    color: ef.mode === "subcontract" ? T.wn : T.ts,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  📋 一括外注
                </button>
              </div>
            </div>

            <Inp
              label="当初契約額 (¥)"
              type="number"
              value={ef.originalAmount}
              onChange={(e) =>
                setEf((f) => ({
                  ...f!,
                  originalAmount: Number(e.target.value),
                }))
              }
            />

            {ef.mode === "subcontract" ? (
              <>
                <div
                  style={{
                    padding: "12px",
                    background: T.wn + "10",
                    borderRadius: "8px",
                    border: `1px solid ${T.wn}22`,
                    fontSize: "12px",
                    color: T.ts,
                  }}
                >
                  受注額から指定％を抜いて残りを外注に出す形式です。原価は外注費のみになります。
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "10px",
                  }}
                >
                  <Inp
                    label="マージン率 (%)"
                    type="number"
                    placeholder="例: 10"
                    value={ef.marginRate}
                    onChange={(e) => {
                      const rate = Number(e.target.value);
                      const eff = getEffectiveContract({
                        ...ef,
                        marginRate: rate,
                      });
                      setEf((f) => ({
                        ...f!,
                        marginRate: rate,
                        subcontractAmount: Math.round(
                          eff * (1 - rate / 100)
                        ),
                      }));
                    }}
                  />
                  <Inp
                    label="外注額 (¥)（自動計算）"
                    type="number"
                    value={
                      ef.subcontractAmount ||
                      Math.round(
                        getEffectiveContract(ef) *
                          (1 - (ef.marginRate || 0) / 100)
                      )
                    }
                    onChange={(e) =>
                      setEf((f) => ({
                        ...f!,
                        subcontractAmount: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <Inp
                  label="外注先"
                  placeholder="例: ○○建設"
                  value={ef.subcontractVendor}
                  onChange={(e) =>
                    setEf((f) => ({
                      ...f!,
                      subcontractVendor: e.target.value,
                    }))
                  }
                />
              </>
            ) : (
              <Inp
                label="実行予算 (¥)"
                type="number"
                value={ef.budget}
                onChange={(e) =>
                  setEf((f) => ({ ...f!, budget: Number(e.target.value) }))
                }
              />
            )}

            <Sel
              label="ステータス"
              value={ef.status}
              onChange={(e) =>
                setEf((f) => ({ ...f!, status: e.target.value }))
              }
            >
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Sel>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
              }}
            >
              <Inp
                label="開始日"
                type="date"
                value={ef.startDate}
                onChange={(e) =>
                  setEf((f) => ({ ...f!, startDate: e.target.value }))
                }
              />
              <Inp
                label="完了予定日"
                type="date"
                value={ef.endDate}
                onChange={(e) =>
                  setEf((f) => ({ ...f!, endDate: e.target.value }))
                }
              />
            </div>
            <Inp
              label="進捗 (%)"
              type="number"
              min={0}
              max={100}
              value={ef.progress}
              onChange={(e) =>
                setEf((f) => ({ ...f!, progress: Number(e.target.value) }))
              }
            />
            <Inp
              label="請求額 (¥)"
              type="number"
              value={ef.billedAmount}
              onChange={(e) =>
                setEf((f) => ({ ...f!, billedAmount: Number(e.target.value) }))
              }
            />
            <Txt
              label="備考"
              value={ef.notes}
              onChange={(e) =>
                setEf((f) => ({ ...f!, notes: e.target.value }))
              }
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "8px",
              }}
            >
              <Btn onClick={() => setEditModal(false)}>キャンセル</Btn>
              <Btn
                v="primary"
                onClick={() => {
                  onUpdateProject(ef);
                  setEditModal(false);
                }}
              >
                保存
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
