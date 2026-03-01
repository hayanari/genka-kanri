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
import type {
  Project,
  Cost,
  Quantity,
  Vehicle,
  ProcessMaster,
  ProjectProcess,
  ProjectSection,
  ProjectSubtask,
} from "@/lib/utils";
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
  vehicles = [],
  processMasters = [],
  onBack,
  onUpdateProject,
  onDeleteProject,
  onArchiveProject,
  onUnarchiveProject,
  onRestoreProject,
  onAddCost,
  onUpdateCost,
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
  vehicles?: Vehicle[];
  processMasters?: ProcessMaster[];
  onBack: () => void;
  onUpdateProject: (u: Project) => void;
  onDeleteProject: (pid: string) => void;
  onArchiveProject: (pid: string, archiveYear: string) => void;
  onUnarchiveProject: (pid: string) => void;
  onRestoreProject?: (pid: string) => void;
  onAddCost: (c: Cost) => void;
  onUpdateCost: (c: Cost) => void;
  onDeleteCost: (id: string) => void;
  onAddQty: (q: Quantity) => void;
  onDeleteQty: (id: string) => void;
  onAddPayment: (pid: string, pay: { id: string; date: string; amount: number; note: string }) => void;
  onDeletePayment: (pid: string, payId: string) => void;
  onAddChange: (pid: string, ch: { id: string; date: string; type: string; amount: number; description: string }) => void;
  onDeleteChange: (pid: string, chId: string) => void;
}) {
  const isSubcontract = p.mode === "subcontract";
  const defaultTab = "costs";
  const [tab, setTab] = useState(defaultTab);
  const [costModal, setCostModal] = useState(false);
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [qtyModal, setQtyModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [changeModal, setChangeModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState(false);
  const [archiveModal, setArchiveModal] = useState(false);
  const [unarchiveConfirmModal, setUnarchiveConfirmModal] = useState(false);
  const [processAddModal, setProcessAddModal] = useState(false);
  const [expandedProcId, setExpandedProcId] = useState<string | null>(null);
  const [expandedSecId, setExpandedSecId] = useState<string | null>(null);
  const [addSectionProcId, setAddSectionProcId] = useState<string | null>(null);
  const [addSectionName, setAddSectionName] = useState("");
  const [addSubtaskSecId, setAddSubtaskSecId] = useState<string | null>(null);
  const [addSubtaskName, setAddSubtaskName] = useState("");
  const [archiveYear, setArchiveYear] = useState(
    () => new Date().getFullYear().toString()
  );
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
    vehicleId: "",
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
    if (editingCostId) {
      onUpdateCost({
        id: editingCostId,
        projectId: p.id,
        ...cf,
        amount: Number(cf.amount),
      });
    } else {
      onAddCost({
        id: genId(),
        projectId: p.id,
        ...cf,
        amount: Number(cf.amount),
      });
    }
    setCostModal(false);
    setEditingCostId(null);
    setCf({
      category: "material",
      description: "",
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      vendor: "",
    });
  };

  const openCostEdit = (c: Cost) => {
    setEditingCostId(c.id);
    setCf({
      category: c.category,
      description: c.description,
      amount: String(c.amount),
      date: c.date,
      vendor: c.vendor,
    });
    setCostModal(true);
  };
  const handleAddQty = () => {
    const isVehicle = qf.category === "vehicle";
    if (isVehicle && !qf.vehicleId) return; // 車両種別は選択必須
    if (!isVehicle && !qf.description.trim()) return; // 人工は内容入力必須
    const vehicle = isVehicle && qf.vehicleId ? vehicles.find((v) => v.id === qf.vehicleId) : null;
    // 車両: 表示用に「ナンバー（内容）」形式、人工: 内容のみ
    const displayDesc = isVehicle && vehicle
      ? (qf.description.trim() ? `${vehicle.registration}（${qf.description.trim()}）` : vehicle.registration)
      : qf.description;
    onAddQty({
      id: genId(),
      projectId: p.id,
      category: qf.category,
      description: displayDesc,
      vehicleId: isVehicle ? qf.vehicleId || undefined : undefined,
      quantity: Number(qf.quantity),
      date: qf.date,
      note: qf.note,
    });
    setQtyModal(false);
    setQf({
      category: "labor",
      description: "",
      vehicleId: "",
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
  const updateProjectProcesses = (next: ProjectProcess[]) => {
    onUpdateProject({ ...p, projectProcesses: next });
  };

  const handleAddProcess = (processMasterId: string) => {
    const master = getProcessMaster(processMasterId);
    if (!master) return;
    const sorted = [...(p.projectProcesses ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );
    const maxOrder = sorted.length ? sorted[sorted.length - 1].sortOrder : 0;
    updateProjectProcesses([
      ...(p.projectProcesses ?? []),
      {
        id: genId(),
        processMasterId,
        status: "pending",
        sortOrder: maxOrder + 1,
        sections: [],
      },
    ]);
    setProcessAddModal(false);
  };

  const handleAddSection = (procId: string) => {
    const name = addSectionName.trim();
    if (!name) return;
    const master = (p.projectProcesses ?? []).find((x) => x.id === procId);
    const pm = master ? getProcessMaster(master.processMasterId) : null;
    const defaultSubs = (pm?.defaultSubs ?? []).map((n, i) => ({
      id: genId(),
      name: n,
      done: false,
      sortOrder: i,
    }));
    updateProjectProcesses(
      (p.projectProcesses ?? []).map((proc) =>
        proc.id === procId
          ? {
              ...proc,
              sections: [
                ...proc.sections,
                {
                  id: genId(),
                  name,
                  sortOrder: proc.sections.length,
                  subtasks: defaultSubs,
                },
              ],
            }
          : proc
      )
    );
    setAddSectionProcId(null);
    setAddSectionName("");
  };

  const handleAddSubtask = (secId: string, procId: string) => {
    const name = addSubtaskName.trim();
    if (!name) return;
    updateProjectProcesses(
      (p.projectProcesses ?? []).map((proc) =>
        proc.id === procId
          ? {
              ...proc,
              sections: proc.sections.map((sec) =>
                sec.id === secId
                  ? {
                      ...sec,
                      subtasks: [
                        ...sec.subtasks,
                        {
                          id: genId(),
                          name,
                          done: false,
                          sortOrder: sec.subtasks.length,
                        },
                      ],
                }
                  : sec
              ),
            }
          : proc
      )
    );
    setAddSubtaskSecId(null);
    setAddSubtaskName("");
  };

  const handleToggleSubtask = (
    procId: string,
    secId: string,
    subId: string
  ) => {
    updateProjectProcesses(
      (p.projectProcesses ?? []).map((proc) =>
        proc.id === procId
          ? {
              ...proc,
              sections: proc.sections.map((sec) =>
                sec.id === secId
                  ? {
                      ...sec,
                      subtasks: sec.subtasks.map((s) =>
                        s.id === subId ? { ...s, done: !s.done } : s
                      ),
                    }
                  : sec
              ),
            }
          : proc
      )
    );
  };

  const handleDeleteProcess = (procId: string) => {
    if (!confirm("この工程を削除しますか？")) return;
    updateProjectProcesses(
      (p.projectProcesses ?? []).filter((x) => x.id !== procId)
    );
  };

  const handleSyncProgress = () => {
    onUpdateProject({ ...p, progress: processProgressPct });
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
        { id: "costs", label: "💰 原価明細" },
        { id: "labor", label: "👷 人工・車両" },
        { id: "process", label: "📋 工程管理" },
        { id: "payments", label: "🏦 入金管理" },
        { id: "changes", label: "📝 増減額" },
        { id: "summary", label: "📊 収支サマリー" },
      ]
    : [
        { id: "costs", label: "💰 原価明細" },
        { id: "labor", label: "👷 人工・車両" },
        { id: "process", label: "📋 工程管理" },
        { id: "payments", label: "🏦 入金管理" },
        { id: "changes", label: "📝 増減額" },
        { id: "summary", label: "📊 サマリー" },
      ];

  const procs = p.projectProcesses ?? [];
  const calcProcessProgress = () => {
    let total = 0;
    let done = 0;
    procs.forEach((proc) => {
      proc.sections?.forEach((sec) => {
        sec.subtasks?.forEach((s) => {
          total++;
          if (s.done) done++;
        });
      });
    });
    return total > 0 ? Math.round((done / total) * 100) : 0;
  };
  const processProgressPct = calcProcessProgress();
  const getProcessMaster = (id: string) =>
    processMasters.find((m) => m.id === id);

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
              {p.managementNumber && (
                <span
                  style={{
                    fontSize: "13px",
                    fontFamily: "monospace",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    background: T.s2,
                    color: T.ts,
                    fontWeight: 600,
                  }}
                >
                  {p.managementNumber}
                </span>
              )}
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
              {p.archived && p.archiveYear && (
                <span
                  style={{
                    fontSize: "10px",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    background: "#6b728018",
                    color: T.ts,
                  }}
                >
                  📦 アーカイブ ({p.archiveYear}年度)
                </span>
              )}
              {p.deleted && (
                <span
                  style={{
                    fontSize: "10px",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    background: T.dg + "18",
                    color: T.dg,
                  }}
                >
                  🗑️ 削除済み
                  {p.deletedAt && (
                    <span style={{ marginLeft: "4px", opacity: 0.9 }}>
                      ({new Date(p.deletedAt).toLocaleDateString("ja-JP")})
                    </span>
                  )}
                </span>
              )}
            </div>
            <div style={{ fontSize: "13px", color: T.ts }}>
              顧客: {p.client} ｜ 工期: {fmtDate(p.startDate)} 〜{" "}
              {fmtDate(p.endDate)}
              {p.notes && ` ｜ ${p.notes}`}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {p.deleted && onRestoreProject ? (
              <Btn
                sm
                v="success"
                onClick={() => onRestoreProject(p.id)}
              >
                {Icons.restore} 復元
              </Btn>
            ) : (
              <>
            <Btn
              sm
              onClick={() => {
                setEf({ ...p });
                setEditModal(true);
              }}
            >
              {Icons.edit} 編集
            </Btn>
            {p.archived ? (
              <Btn
                sm
                v="warning"
                onClick={() => setUnarchiveConfirmModal(true)}
              >
                {Icons.unarchive} アーカイブ解除
              </Btn>
            ) : (
              <Btn
                sm
                v="ghost"
                onClick={() => {
                  setArchiveYear(new Date().getFullYear().toString());
                  setArchiveModal(true);
                }}
              >
                {Icons.archive} アーカイブ
              </Btn>
            )}
            <Btn
              sm
              v="danger"
              onClick={() => setDeleteConfirmModal(true)}
            >
              {Icons.trash} 削除
            </Btn>
              </>
            )}
          </div>
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
                <span style={{ fontSize: "12px", color: T.ts }}>
                  進捗
                  {procs.length > 0 && (
                    <span
                      style={{
                        marginLeft: "8px",
                        fontSize: "11px",
                        color: T.ts,
                        opacity: 0.8,
                      }}
                    >
                      （手入力）
                    </span>
                  )}
                </span>
                <span
                  style={{ fontSize: "12px", fontWeight: 600, color: T.tx }}
                >
                  {p.progress}%
                  {procs.length > 0 && processProgressPct > 0 && (
                    <span
                      style={{
                        marginLeft: "6px",
                        fontSize: "11px",
                        color: T.ac,
                        fontWeight: 500,
                      }}
                    >
                      工程: {processProgressPct}%
                    </span>
                  )}
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

      {tab === "costs" && (
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
              原価明細（実費）
              {isSubcontract ? " ※打合せ等" : ""} {st.costs.length}件
            </h4>
            <Btn
              v="primary"
              sm
              onClick={() => {
                setEditingCostId(null);
                setCf({
                  category: "material",
                  description: "",
                  amount: "",
                  date: new Date().toISOString().slice(0, 10),
                  vendor: "",
                });
                setCostModal(true);
              }}
            >
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
            <div className="table-scroll">
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
                          <span style={{ display: "flex", gap: "4px" }}>
                            <button
                              onClick={() => openCostEdit(c)}
                              style={{
                                background: "none",
                                border: "none",
                                color: T.ts,
                                cursor: "pointer",
                                opacity: 0.6,
                              }}
                              title="編集"
                            >
                              {Icons.edit}
                            </button>
                            <button
                              onClick={() => onDeleteCost(c.id)}
                              style={{
                                background: "none",
                                border: "none",
                                color: T.ts,
                                cursor: "pointer",
                                opacity: 0.6,
                              }}
                              title="削除"
                            >
                              {Icons.trash}
                            </button>
                          </span>
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
            </div>
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

      {tab === "labor" && (
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
              人工・車両記録
              {isSubcontract ? " ※打合せ等" : ""} {st.quantities.length}件
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
            <div className="table-scroll">
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
                            fontFamily: q.vehicleId ? "monospace" : "inherit",
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
            </div>
          )}
        </Card>
      )}

      {tab === "process" && (
        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h4 style={{ margin: 0, fontSize: "14px", color: T.tx }}>
                工程管理
              </h4>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: T.ts }}>
                {procs.length === 0
                  ? "工程を追加して進捗を管理"
                  : `工程進捗: ${processProgressPct}%（${procs.reduce((s, pr) => s + pr.sections.reduce((a, sec) => a + sec.subtasks.length, 0), 0)}項目中${procs.reduce((s, pr) => s + pr.sections.reduce((a, sec) => a + sec.subtasks.filter((x) => x.done).length, 0), 0)}完了）`}
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {procs.length > 0 && processProgressPct > 0 && (
                <Btn v="default" sm onClick={handleSyncProgress}>
                  工程進捗を手入力進捗に反映
                </Btn>
              )}
              <Btn v="primary" sm onClick={() => setProcessAddModal(true)}>
                {Icons.plus} 工程追加
              </Btn>
            </div>
          </div>

          {procs.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px",
                color: T.ts,
                fontSize: "13px",
              }}
            >
              工程がありません。「工程追加」から工程マスタの工程を選んで追加してください。
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[...procs]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((proc) => {
                  const pm = getProcessMaster(proc.processMasterId);
                  const totalSubs = proc.sections.reduce(
                    (s, sec) => s + sec.subtasks.length,
                    0
                  );
                  const doneSubs = proc.sections.reduce(
                    (s, sec) =>
                      s + sec.subtasks.filter((x) => x.done).length,
                    0
                  );
                  const procPct =
                    totalSubs > 0 ? Math.round((doneSubs / totalSubs) * 100) : 0;
                  const isExpanded = expandedProcId === proc.id;
                  return (
                    <div
                      key={proc.id}
                      style={{
                        border: `1px solid ${T.bd}`,
                        borderRadius: "8px",
                        overflow: "hidden",
                        background: T.s2,
                      }}
                    >
                      <div
                        onClick={() =>
                          setExpandedProcId(isExpanded ? null : proc.id)
                        }
                        style={{
                          padding: "12px 16px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontSize: "18px" }}>
                          {pm?.icon ?? "📌"}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            fontSize: "14px",
                            fontWeight: 600,
                            color: T.tx,
                          }}
                        >
                          {pm?.name ?? proc.processMasterId}
                        </span>
                        <span
                          style={{
                            fontSize: "12px",
                            color: T.ts,
                          }}
                        >
                          {proc.sections.length}区間 {doneSubs}/{totalSubs} 完了（{procPct}%）
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProcess(proc.id);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: T.dg,
                            cursor: "pointer",
                            opacity: 0.7,
                            padding: "4px",
                          }}
                          title="削除"
                        >
                          {Icons.trash}
                        </button>
                      </div>
                      {isExpanded && (
                        <div
                          style={{
                            padding: "0 16px 16px",
                            borderTop: `1px solid ${T.bd}`,
                          }}
                        >
                          {proc.sections.length === 0 ? (
                            <div
                              style={{
                                padding: "12px 0",
                                fontSize: "12px",
                                color: T.ts,
                              }}
                            >
                              区間がありません。
                              {addSectionProcId === proc.id ? (
                                <div
                                  style={{
                                    marginTop: "8px",
                                    display: "flex",
                                    gap: "8px",
                                    alignItems: "center",
                                  }}
                                >
                                  <input
                                    value={addSectionName}
                                    onChange={(e) =>
                                      setAddSectionName(e.target.value)
                                    }
                                    placeholder="区間名（例: φ300 MH1〜MH2）"
                                    style={{
                                      flex: 1,
                                      padding: "8px 12px",
                                      border: `1px solid ${T.bd}`,
                                      borderRadius: "6px",
                                      background: T.s,
                                      color: T.tx,
                                      fontSize: "13px",
                                    }}
                                    onKeyDown={(e) =>
                                      e.key === "Enter" &&
                                      handleAddSection(proc.id)
                                    }
                                  />
                                  <Btn sm onClick={() => handleAddSection(proc.id)}>追加</Btn>
                                  <Btn
                                    sm
                                    v="ghost"
                                    onClick={() => {
                                      setAddSectionProcId(null);
                                      setAddSectionName("");
                                    }}
                                  >
                                    キャンセル
                                  </Btn>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setAddSectionProcId(proc.id)}
                                  style={{
                                    marginLeft: "8px",
                                    color: T.ac,
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    fontSize: "12px",
                                  }}
                                >
                                  + 区間を追加
                                </button>
                              )}
                            </div>
                          ) : (
                            proc.sections.map((sec) => {
                              const secExpanded =
                                expandedSecId === sec.id;
                              const secDone = sec.subtasks.filter(
                                (s) => s.done
                              ).length;
                              const secTotal = sec.subtasks.length;
                              const secPct =
                                secTotal > 0
                                  ? Math.round((secDone / secTotal) * 100)
                                  : 0;
                              return (
                                <div
                                  key={sec.id}
                                  style={{
                                    marginTop: "12px",
                                    border: `1px solid ${T.bd}44`,
                                    borderRadius: "6px",
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    onClick={() =>
                                      setExpandedSecId(
                                        secExpanded ? null : sec.id
                                      )
                                    }
                                    style={{
                                      padding: "10px 12px",
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      justifyContent: "space-between",
                                      background: T.s,
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "13px",
                                        color: T.tx,
                                      }}
                                    >
                                      {sec.name}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: "11px",
                                        color: T.ts,
                                      }}
                                    >
                                      {secDone}/{secTotal}（{secPct}%）
                                    </span>
                                  </div>
                                  {secExpanded && (
                                    <div
                                      style={{
                                        padding: "12px",
                                        background: T.bg,
                                      }}
                                    >
                                      {sec.subtasks.map((sub) => (
                                        <label
                                          key={sub.id}
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "8px",
                                            padding: "6px 0",
                                            cursor: "pointer",
                                            fontSize: "13px",
                                            color: T.tx,
                                          }}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={sub.done}
                                            onChange={() =>
                                              handleToggleSubtask(
                                                proc.id,
                                                sec.id,
                                                sub.id
                                              )
                                            }
                                          />
                                          <span
                                            style={{
                                              textDecoration: sub.done
                                                ? "line-through"
                                                : "none",
                                              color: sub.done
                                                ? T.ts
                                                : T.tx,
                                            }}
                                          >
                                            {sub.name}
                                          </span>
                                        </label>
                                      ))}
                                      {addSubtaskSecId === sec.id ? (
                                        <div
                                          style={{
                                            display: "flex",
                                            gap: "8px",
                                            marginTop: "8px",
                                          }}
                                        >
                                          <input
                                            value={addSubtaskName}
                                            onChange={(e) =>
                                              setAddSubtaskName(e.target.value)
                                            }
                                            placeholder="作業項目名"
                                            style={{
                                              flex: 1,
                                              padding: "8px",
                                              border: `1px solid ${T.bd}`,
                                              borderRadius: "6px",
                                              background: T.s,
                                              color: T.tx,
                                              fontSize: "12px",
                                            }}
                                            onKeyDown={(e) =>
                                              e.key === "Enter" &&
                                              handleAddSubtask(
                                                sec.id,
                                                proc.id
                                              )
                                            }
                                          />
                                          <Btn
                                            sm
                                            onClick={() =>
                                              handleAddSubtask(
                                                sec.id,
                                                proc.id
                                              )
                                            }
                                          >
                                            追加
                                          </Btn>
                                          <Btn
                                            sm
                                            v="ghost"
                                            onClick={() => {
                                              setAddSubtaskSecId(null);
                                              setAddSubtaskName("");
                                            }}
                                          >
                                            キャンセル
                                          </Btn>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() =>
                                            setAddSubtaskSecId(sec.id)
                                          }
                                          style={{
                                            marginTop: "8px",
                                            color: T.ac,
                                            background: "none",
                                            border: "none",
                                            cursor: "pointer",
                                            fontSize: "11px",
                                          }}
                                        >
                                          + 作業項目を追加
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                          {proc.sections.length > 0 &&
                            addSectionProcId === proc.id && (
                              <div
                                style={{
                                  marginTop: "12px",
                                  display: "flex",
                                  gap: "8px",
                                  alignItems: "center",
                                }}
                              >
                                <input
                                  value={addSectionName}
                                  onChange={(e) =>
                                    setAddSectionName(e.target.value)
                                  }
                                  placeholder="区間名（例: φ300 MH1〜MH2）"
                                  style={{
                                    flex: 1,
                                    padding: "8px 12px",
                                    border: `1px solid ${T.bd}`,
                                    borderRadius: "6px",
                                    background: T.s,
                                    color: T.tx,
                                    fontSize: "13px",
                                  }}
                                  onKeyDown={(e) =>
                                    e.key === "Enter" &&
                                    handleAddSection(proc.id)
                                  }
                                />
                                <Btn sm onClick={() => handleAddSection(proc.id)}>区間追加</Btn>
                                <Btn
                                  sm
                                  v="ghost"
                                  onClick={() => {
                                    setAddSectionProcId(null);
                                    setAddSectionName("");
                                  }}
                                >
                                  キャンセル
                                </Btn>
                              </div>
                            )}
                          {proc.sections.length > 0 &&
                            addSectionProcId !== proc.id && (
                              <button
                                onClick={() => setAddSectionProcId(proc.id)}
                                style={{
                                  marginTop: "12px",
                                  color: T.ac,
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                }}
                              >
                                + 区間を追加
                              </button>
                            )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {processAddModal && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px",
              }}
              onClick={() => setProcessAddModal(false)}
            >
              <div
                style={{
                  background: T.bg,
                  borderRadius: "12px",
                  padding: "20px",
                  maxWidth: "400px",
                  width: "100%",
                  maxHeight: "80vh",
                  overflowY: "auto",
                  border: `1px solid ${T.bd}`,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h4 style={{ margin: "0 0 16px", fontSize: "16px", color: T.tx }}>
                  工程を追加
                </h4>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {processMasters
                    .filter(
                      (m) =>
                        !(p.projectProcesses ?? []).some(
                          (pr) => pr.processMasterId === m.id
                        )
                    )
                    .map((m) => (
                      <button
                        key={m.id}
                        onClick={() => handleAddProcess(m.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "12px",
                          border: `1px solid ${T.bd}`,
                          borderRadius: "8px",
                          background: T.s,
                          color: T.tx,
                          fontSize: "13px",
                          fontFamily: "inherit",
                          cursor: "pointer",
                          textAlign: "left",
                          width: "100%",
                        }}
                      >
                        <span style={{ fontSize: "18px" }}>{m.icon}</span>
                        <span>{m.name}</span>
                      </button>
                    ))}
                  {processMasters.filter(
                    (m) =>
                      !(p.projectProcesses ?? []).some(
                        (pr) => pr.processMasterId === m.id
                      )
                  ).length === 0 && (
                    <div
                      style={{
                        padding: "24px",
                        textAlign: "center",
                        color: T.ts,
                        fontSize: "13px",
                      }}
                    >
                      追加できる工程がありません
                    </div>
                  )}
                </div>
                <Btn
                  onClick={() => setProcessAddModal(false)}
                  style={{ marginTop: "16px", width: "100%" }}
                >
                  閉じる
                </Btn>
              </div>
            </div>
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
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
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
            <div className="table-scroll">
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
            </div>
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
            <div className="table-scroll">
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
            </div>
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
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
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
                          {cat.icon} {cat.label}（打合せ等）
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
          {st.laborDays > 0 && (
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

      <Modal
        open={costModal}
        onClose={() => {
          setCostModal(false);
          setEditingCostId(null);
        }}
        title={editingCostId ? "原価編集（実費）" : "原価追加（実費）"}
        w={480}
      >
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
            <Btn
              onClick={() => {
                setCostModal(false);
                setEditingCostId(null);
              }}
            >
              キャンセル
            </Btn>
            <Btn v="primary" onClick={handleAddCost}>
              {editingCostId ? "更新" : "追加"}
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
              setQf((f) => ({
                ...f,
                category: e.target.value,
                vehicleId: e.target.value === "vehicle" ? f.vehicleId : "",
                description: e.target.value === "labor" ? f.description : "",
              }))
            }
          >
            {Object.entries(QUANTITY_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.icon} {v.label}（{v.unit}）
              </option>
            ))}
          </Sel>
          {qf.category === "vehicle" ? (
            vehicles.length > 0 ? (
              <Sel
                label="車両種別"
                value={qf.vehicleId}
                onChange={(e) =>
                  setQf((f) => ({ ...f, vehicleId: e.target.value }))
                }
              >
                <option value="">選択してください</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registration}
                  </option>
                ))}
              </Sel>
            ) : (
              <p style={{ fontSize: "12px", color: T.wn }}>
                車両マスタに車両を登録してください
              </p>
            )
          ) : null}
          <Inp
            label="内容"
            placeholder={
              qf.category === "vehicle"
                ? "例: 資材運搬"
                : "例: 大工、手元"
            }
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
            <Btn
              v="primary"
              onClick={handleAddQty}
              disabled={
                !Number(qf.quantity) ||
                (qf.category === "vehicle" && !qf.vehicleId) ||
                (qf.category === "labor" && !qf.description.trim())
              }
            >
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

      <Modal open={deleteConfirmModal} onClose={() => setDeleteConfirmModal(false)} title="案件の削除" w={420}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ margin: 0, fontSize: "14px", color: T.tx, lineHeight: 1.6 }}>
            この案件を削除済みにしますか？削除済み欄に移動しますが、後から復元できます。
          </p>
          <div
            style={{
              padding: "12px 14px",
              background: T.s2,
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              color: T.tx,
            }}
          >
            {p.name}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "8px",
            }}
          >
            <Btn onClick={() => setDeleteConfirmModal(false)}>キャンセル</Btn>
            <Btn
              v="danger"
              onClick={() => {
                setDeleteConfirmModal(false);
                onDeleteProject(p.id);
              }}
            >
              {Icons.trash} 削除する
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={archiveModal} onClose={() => setArchiveModal(false)} title="案件のアーカイブ" w={420}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ margin: 0, fontSize: "14px", color: T.tx, lineHeight: 1.6 }}>
            決算に合わせてこの案件をアーカイブします。アーカイブすると案件一覧から非表示になり、アーカイブ一覧でのみ確認できます。必要に応じて解除できます。
          </p>
          <div
            style={{
              padding: "12px 14px",
              background: T.s2,
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              color: T.tx,
            }}
          >
            {p.name}
          </div>
          <div>
            <label style={{ fontSize: "12px", color: T.ts, fontWeight: 500, marginBottom: "6px", display: "block" }}>
              アーカイブ対象年度
            </label>
            <select
              value={archiveYear}
              onChange={(e) => setArchiveYear(e.target.value)}
              style={{
                padding: "9px 12px",
                background: T.s,
                border: `1px solid ${T.bd}`,
                borderRadius: "8px",
                color: T.tx,
                fontSize: "13px",
                fontFamily: "inherit",
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              {[0, 1, 2, 3, 4, 5].map((i) => {
                const y = new Date().getFullYear() - i;
                return (
                  <option key={y} value={String(y)}>
                    {y}年度
                  </option>
                );
              })}
            </select>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "8px",
            }}
          >
            <Btn onClick={() => setArchiveModal(false)}>キャンセル</Btn>
            <Btn
              v="primary"
              onClick={() => {
                setArchiveModal(false);
                onArchiveProject(p.id, archiveYear);
              }}
            >
              {Icons.archive} {archiveYear}年度でアーカイブ
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={unarchiveConfirmModal} onClose={() => setUnarchiveConfirmModal(false)} title="アーカイブ解除" w={420}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ margin: 0, fontSize: "14px", color: T.tx, lineHeight: 1.6 }}>
            この案件をアーカイブから解除し、案件一覧に戻しますか？
          </p>
          <div
            style={{
              padding: "12px 14px",
              background: T.s2,
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              color: T.tx,
            }}
          >
            {p.name}
            {p.archiveYear && (
              <span style={{ fontSize: "12px", color: T.ts, fontWeight: 400, marginLeft: "8px" }}>
                ({p.archiveYear}年度)
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "8px",
            }}
          >
            <Btn onClick={() => setUnarchiveConfirmModal(false)}>キャンセル</Btn>
            <Btn
              v="warning"
              onClick={() => {
                setUnarchiveConfirmModal(false);
                onUnarchiveProject(p.id);
              }}
            >
              {Icons.unarchive} 解除する
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
