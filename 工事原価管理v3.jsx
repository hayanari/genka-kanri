import { useState, useCallback } from "react";

const genId = () => Math.random().toString(36).slice(2, 10);
const fmt = (n) => new Intl.NumberFormat("ja-JP").format(Math.round(n || 0));
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("ja-JP") : "—";
const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;
const div = (a, b) => b ? Math.round(a / b) : 0;

const STATUS_MAP = {
  estimate: { label: "見積中", color: "#94a3b8", bg: "#f1f5f9" },
  ordered: { label: "受注済", color: "#3b82f6", bg: "#eff6ff" },
  in_progress: { label: "施工中", color: "#f59e0b", bg: "#fffbeb" },
  completed: { label: "完了", color: "#10b981", bg: "#ecfdf5" },
  billed: { label: "請求済", color: "#8b5cf6", bg: "#f5f3ff" },
  paid: { label: "入金済", color: "#059669", bg: "#d1fae5" },
};

const COST_CATEGORIES = {
  material: { label: "材料費", icon: "🧱", color: "#ef4444" },
  outsource: { label: "外注費", icon: "🏗️", color: "#f59e0b" },
  equipment: { label: "機材費", icon: "⚙️", color: "#06b6d4" },
  other: { label: "その他経費", icon: "📦", color: "#6b7280" },
};

const QUANTITY_CATEGORIES = {
  labor: { label: "人工", unit: "人日", icon: "👷", color: "#3b82f6" },
  vehicle: { label: "車両", unit: "台日", icon: "🚛", color: "#8b5cf6" },
};

const PAYMENT_STATUS = {
  unpaid: { label: "未入金", color: "#ef4444" },
  partial: { label: "一部入金", color: "#f59e0b" },
  full: { label: "入金済", color: "#10b981" },
};

const CHANGE_TYPES = {
  increase: { label: "増額", color: "#10b981", sign: "+" },
  decrease: { label: "減額", color: "#ef4444", sign: "−" },
};

const createSampleData = () => ({
  projects: [
    {
      id: "p1", name: "○○邸 新築工事", client: "山田太郎", category: "工事",
      contractAmount: 15000000, originalAmount: 15000000, budget: 10500000,
      status: "in_progress", startDate: "2025-01-15", endDate: "2025-06-30", progress: 45,
      billedAmount: 7500000, paidAmount: 5000000, notes: "木造2階建て",
      mode: "normal", marginRate: 0, subcontractAmount: 0, subcontractVendor: "",
      payments: [{ id: "pay1", date: "2025-02-01", amount: 5000000, note: "着手金" }],
      changes: [{ id: "ch1", date: "2025-03-10", type: "increase", amount: 500000, description: "追加工事：ウッドデッキ設置" }],
    },
    {
      id: "p2", name: "△△ビル 外壁改修", client: "株式会社ABC", category: "工事",
      contractAmount: 8500000, originalAmount: 8500000, budget: 5950000,
      status: "ordered", startDate: "2025-03-01", endDate: "2025-05-15", progress: 10,
      billedAmount: 0, paidAmount: 0, notes: "外壁塗装・防水工事",
      mode: "subcontract", marginRate: 12, subcontractAmount: 7480000, subcontractVendor: "○○塗装工業",
      payments: [],
      changes: [],
    },
    {
      id: "p3", name: "□□マンション 設計業務", client: "株式会社XYZ", category: "業務",
      contractAmount: 3200000, originalAmount: 3500000, budget: 2240000,
      status: "completed", startDate: "2024-10-01", endDate: "2025-01-31", progress: 100,
      billedAmount: 3200000, paidAmount: 3200000, notes: "設計監理業務",
      mode: "normal", marginRate: 0, subcontractAmount: 0, subcontractVendor: "",
      payments: [
        { id: "pay2", date: "2024-11-01", amount: 1600000, note: "中間金" },
        { id: "pay3", date: "2025-02-15", amount: 1600000, note: "完了金" },
      ],
      changes: [{ id: "ch2", date: "2024-12-15", type: "decrease", amount: 300000, description: "設計範囲縮小" }],
    },
  ],
  costs: [
    { id: "c1", projectId: "p1", category: "material", description: "木材一式", amount: 1200000, date: "2025-02-10", vendor: "○○木材店" },
    { id: "c2", projectId: "p1", category: "material", description: "金物類", amount: 350000, date: "2025-02-15", vendor: "△△金物" },
    { id: "c3", projectId: "p1", category: "outsource", description: "基礎工事", amount: 1800000, date: "2025-01-20", vendor: "□□建設" },
    { id: "c4", projectId: "p1", category: "equipment", description: "足場リース", amount: 280000, date: "2025-02-05", vendor: "○○リース" },
    { id: "c5", projectId: "p3", category: "other", description: "印刷費・交通費", amount: 85000, date: "2025-01-20", vendor: "各種" },
  ],
  quantities: [
    { id: "q1", projectId: "p1", category: "labor", description: "大工", quantity: 50, date: "2025-03-01", note: "5人×10日" },
    { id: "q2", projectId: "p1", category: "labor", description: "手元", quantity: 20, date: "2025-03-01", note: "2人×10日" },
    { id: "q3", projectId: "p1", category: "vehicle", description: "2tトラック", quantity: 12, date: "2025-02-20", note: "" },
    { id: "q4", projectId: "p1", category: "vehicle", description: "ユニック車", quantity: 3, date: "2025-02-25", note: "" },
    { id: "q5", projectId: "p3", category: "labor", description: "設計担当", quantity: 60, date: "2025-01-15", note: "2人×30日" },
  ],
});

// ─── Icons ───
const I = {
  dash: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  list: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>,
  plus: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  back: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>,
  close: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  edit: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  dl: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  search: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
};

const T = {
  bg: "#0c0e14", s: "#161923", s2: "#1e2231", bd: "#282d3e",
  tx: "#e4e7ef", ts: "#7c84a0", ac: "#4f8cff", al: "#4f8cff20",
  dg: "#ef4444", ok: "#10b981", wn: "#f59e0b",
};

// ─── UI Primitives ───
const Badge = ({ status, map = STATUS_MAP }) => { const s = map[status]; if (!s) return null; return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, color: s.color, background: s.bg || s.color + "18" }}>{s.label}</span>; };
const ModeBadge = ({ mode }) => mode === "subcontract" ? <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, color: "#f59e0b", background: "#f59e0b18" }}>📋 一括外注</span> : <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, color: "#4f8cff", background: "#4f8cff18" }}>🔧 自社施工</span>;
const Bar = ({ value, h = 6, color = T.ac }) => (<div style={{ width: "100%", height: h, background: T.s2, borderRadius: h }}><div style={{ width: `${Math.min(100, value)}%`, height: "100%", borderRadius: h, background: value > 100 ? T.dg : color, transition: "width 0.4s" }} /></div>);
const Btn = ({ children, onClick, v = "default", sm, style: sx, ...p }) => {
  const base = { display: "inline-flex", alignItems: "center", gap: "6px", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontFamily: "inherit", transition: "all .15s", whiteSpace: "nowrap", padding: sm ? "6px 12px" : "9px 18px", fontSize: sm ? "12px" : "13px" };
  const vs = { default: { background: T.s2, color: T.tx, border: `1px solid ${T.bd}` }, primary: { background: T.ac, color: "#fff" }, danger: { background: T.dg + "18", color: T.dg }, ghost: { background: "transparent", color: T.ts }, success: { background: T.ok, color: "#fff" }, warning: { background: T.wn + "18", color: T.wn, border: `1px solid ${T.wn}33` } };
  return <button onClick={onClick} style={{ ...base, ...vs[v], ...sx }} {...p}>{children}</button>;
};
const Inp = ({ label, ...p }) => (<div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>{label && <label style={{ fontSize: "12px", color: T.ts, fontWeight: 500 }}>{label}</label>}<input {...p} style={{ padding: "9px 12px", background: T.s, border: `1px solid ${T.bd}`, borderRadius: "8px", color: T.tx, fontSize: "13px", fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", ...p.style }} /></div>);
const Sel = ({ label, children, ...p }) => (<div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>{label && <label style={{ fontSize: "12px", color: T.ts, fontWeight: 500 }}>{label}</label>}<select {...p} style={{ padding: "9px 12px", background: T.s, border: `1px solid ${T.bd}`, borderRadius: "8px", color: T.tx, fontSize: "13px", fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", ...p.style }}>{children}</select></div>);
const Txt = ({ label, ...p }) => (<div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>{label && <label style={{ fontSize: "12px", color: T.ts, fontWeight: 500 }}>{label}</label>}<textarea {...p} style={{ padding: "9px 12px", background: T.s, border: `1px solid ${T.bd}`, borderRadius: "8px", color: T.tx, fontSize: "13px", fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: "56px", ...p.style }} /></div>);
const Card = ({ children, style: sx, onClick }) => (<div onClick={onClick} style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: "12px", padding: "20px", cursor: onClick ? "pointer" : "default", transition: "all .15s", ...sx }}>{children}</div>);
const Modal = ({ open, onClose, title, children, w = 560 }) => { if (!open) return null; return (<div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.7)", backdropFilter: "blur(4px)" }} onClick={onClose}><div onClick={e => e.stopPropagation()} style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: "16px", width: `min(${w}px, 92vw)`, maxHeight: "85vh", overflow: "auto", padding: "28px" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}><h3 style={{ margin: 0, fontSize: "17px", color: T.tx }}>{title}</h3><button onClick={onClose} style={{ background: "none", border: "none", color: T.ts, cursor: "pointer" }}>{I.close}</button></div>{children}</div></div>); };
const Metric = ({ label, value, sub, color = T.ac, big }) => (<div style={{ padding: big ? "18px" : "14px", background: T.s2, borderRadius: "10px", flex: 1, minWidth: big ? "200px" : "140px" }}><div style={{ fontSize: "11px", color: T.ts, marginBottom: "4px", letterSpacing: ".03em" }}>{label}</div><div style={{ fontSize: big ? "22px" : "17px", fontWeight: 700, color }}>{value}</div>{sub && <div style={{ fontSize: "11px", color: T.ts, marginTop: "3px" }}>{sub}</div>}</div>);

// ─── Helpers ───
const getEffectiveContract = (p) => {
  const changeTotal = (p.changes || []).reduce((s, c) => s + (c.type === "increase" ? c.amount : -c.amount), 0);
  return p.originalAmount + changeTotal;
};

const projStats = (p, costs, quantities) => {
  const effectiveContract = getEffectiveContract(p);
  if (p.mode === "subcontract") {
    const subAmt = p.subcontractAmount || Math.round(effectiveContract * (1 - (p.marginRate || 0) / 100));
    const profit = effectiveContract - subAmt;
    const profitRate = pct(profit, effectiveContract);
    return { totalCost: subAmt, laborDays: 0, vehicleDays: 0, profit, profitRate, revenuePerLabor: 0, profitPerLabor: 0, budgetUsed: 100, costs: [], quantities: [], effectiveContract, subcontractAmount: subAmt };
  }
  const pc = costs.filter(c => c.projectId === p.id);
  const pq = quantities.filter(q => q.projectId === p.id);
  const totalCost = pc.reduce((s, c) => s + c.amount, 0);
  const laborDays = pq.filter(q => q.category === "labor").reduce((s, q) => s + q.quantity, 0);
  const vehicleDays = pq.filter(q => q.category === "vehicle").reduce((s, q) => s + q.quantity, 0);
  const profit = effectiveContract - totalCost;
  const profitRate = pct(profit, effectiveContract);
  const revenuePerLabor = div(effectiveContract, laborDays);
  const profitPerLabor = div(profit, laborDays);
  const budgetUsed = pct(totalCost, p.budget);
  return { totalCost, laborDays, vehicleDays, profit, profitRate, revenuePerLabor, profitPerLabor, budgetUsed, costs: pc, quantities: pq, effectiveContract };
};

// ═══════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════
const Dashboard = ({ projects, costs, quantities, onNav }) => {
  const allStats = projects.map(p => projStats(p, costs, quantities));
  const totalContract = allStats.reduce((s, st) => s + st.effectiveContract, 0);
  const totalCost = allStats.reduce((s, st) => s + st.totalCost, 0);
  const totalLabor = allStats.reduce((s, st) => s + st.laborDays, 0);
  const totalVehicle = allStats.reduce((s, st) => s + st.vehicleDays, 0);
  const totalPaid = projects.reduce((s, p) => s + p.paidAmount, 0);
  const totalBilled = projects.reduce((s, p) => s + p.billedAmount, 0);
  const grossProfit = totalContract - totalCost;
  const profitRate = pct(grossProfit, totalContract);
  const normalProjects = projects.filter(p => p.mode !== "subcontract");
  const subProjects = projects.filter(p => p.mode === "subcontract");

  const costByCat = {};
  costs.forEach(c => { costByCat[c.category] = (costByCat[c.category] || 0) + c.amount; });
  const maxCat = Math.max(...Object.values(costByCat), 1);

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h2 style={{ margin: 0, fontSize: "22px", color: T.tx, fontWeight: 700 }}>ダッシュボード</h2>
        <p style={{ margin: "6px 0 0", fontSize: "13px", color: T.ts }}>全案件概要 — 自社施工 {normalProjects.length}件 ／ 一括外注 {subProjects.length}件</p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "14px" }}>
        <Metric big label="総受注額（増減後）" value={`¥${fmt(totalContract)}`} />
        <Metric big label="総原価" value={`¥${fmt(totalCost)}`} color={T.wn} />
        <Metric big label="粗利" value={`¥${fmt(grossProfit)}`} sub={`利益率 ${profitRate}%`} color={profitRate >= 20 ? T.ok : T.dg} />
        <Metric big label="入金済" value={`¥${fmt(totalPaid)}`} sub={`未入金 ¥${fmt(totalBilled - totalPaid)}`} color={T.ok} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
        <Card style={{ flex: 1, minWidth: "280px", background: "#1a2744", borderColor: "#253a5e" }}>
          <div style={{ fontSize: "11px", color: T.ts, marginBottom: "10px" }}>👷 生産性指標（自社施工案件）</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
            <div><div style={{ fontSize: "10px", color: "#6b9fff" }}>総人工</div><div style={{ fontSize: "20px", fontWeight: 700, color: T.tx }}>{fmt(totalLabor)}<span style={{ fontSize: "11px", color: T.ts }}> 人日</span></div></div>
            <div><div style={{ fontSize: "10px", color: "#6b9fff" }}>売上/人工</div><div style={{ fontSize: "20px", fontWeight: 700, color: "#60a5fa" }}>¥{fmt(div(totalContract, totalLabor))}</div></div>
            <div><div style={{ fontSize: "10px", color: "#6b9fff" }}>粗利/人工</div><div style={{ fontSize: "20px", fontWeight: 700, color: grossProfit / (totalLabor || 1) >= 30000 ? T.ok : T.wn }}>¥{fmt(div(grossProfit, totalLabor))}</div></div>
          </div>
        </Card>
        <Card style={{ flex: "0 0 160px", background: "#1f1a3d", borderColor: "#33285e" }}>
          <div style={{ fontSize: "11px", color: T.ts, marginBottom: "10px" }}>🚛 車両稼働</div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: T.tx }}>{fmt(totalVehicle)}<span style={{ fontSize: "12px", color: T.ts }}> 台日</span></div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "24px" }}>
        <Card>
          <h4 style={{ margin: "0 0 16px", fontSize: "14px", color: T.tx }}>原価内訳（自社施工分）</h4>
          {Object.entries(COST_CATEGORIES).map(([k, cat]) => {
            const v = costByCat[k] || 0;
            return (<div key={k} style={{ marginBottom: "12px" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}><span style={{ fontSize: "12px", color: T.ts }}>{cat.icon} {cat.label}</span><span style={{ fontSize: "12px", fontWeight: 600, color: T.tx }}>¥{fmt(v)}</span></div><Bar value={pct(v, maxCat)} color={cat.color} h={5} /></div>);
          })}
        </Card>
        <Card>
          <h4 style={{ margin: "0 0 16px", fontSize: "14px", color: T.tx }}>案件別 生産性ランキング</h4>
          <div style={{ fontSize: "10px", color: T.ts, display: "grid", gridTemplateColumns: "1fr 55px 75px 75px", gap: "4px", padding: "0 0 8px", borderBottom: `1px solid ${T.bd}` }}>
            <span>案件名</span><span style={{ textAlign: "right" }}>人工</span><span style={{ textAlign: "right" }}>売上/人工</span><span style={{ textAlign: "right" }}>粗利/人工</span>
          </div>
          {projects.map(p => {
            const st = projStats(p, costs, quantities);
            if (p.mode === "subcontract") {
              return (<div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 55px 75px 75px", gap: "4px", padding: "10px 0", borderBottom: `1px solid ${T.bd}22`, cursor: "pointer" }} onClick={() => onNav("detail", p.id)}>
                <span style={{ fontSize: "12px", color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                <span style={{ fontSize: "11px", color: T.wn, textAlign: "right" }}>外注</span>
                <span style={{ fontSize: "12px", color: T.ts, textAlign: "right" }}>—</span>
                <span style={{ fontSize: "12px", fontWeight: 600, color: T.ok, textAlign: "right" }}>¥{fmt(st.profit)}</span>
              </div>);
            }
            if (st.laborDays === 0) return null;
            return (<div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 55px 75px 75px", gap: "4px", padding: "10px 0", borderBottom: `1px solid ${T.bd}22`, cursor: "pointer" }} onClick={() => onNav("detail", p.id)}>
              <span style={{ fontSize: "12px", color: T.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span style={{ fontSize: "12px", color: T.ts, textAlign: "right" }}>{st.laborDays}人日</span>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#60a5fa", textAlign: "right" }}>¥{fmt(st.revenuePerLabor)}</span>
              <span style={{ fontSize: "12px", fontWeight: 600, color: st.profitPerLabor >= 30000 ? T.ok : T.wn, textAlign: "right" }}>¥{fmt(st.profitPerLabor)}</span>
            </div>);
          })}
        </Card>
      </div>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h4 style={{ margin: 0, fontSize: "14px", color: T.tx }}>案件ステータス</h4>
          <Btn sm v="ghost" onClick={() => onNav("list")}>全案件を見る →</Btn>
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {Object.entries(STATUS_MAP).map(([k, s]) => {
            const c = projects.filter(p => p.status === k).length;
            return (<div key={k} style={{ padding: "10px 16px", background: T.s2, borderRadius: "8px", display: "flex", alignItems: "center", gap: "8px" }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} /><span style={{ fontSize: "12px", color: T.ts }}>{s.label}</span><span style={{ fontSize: "16px", fontWeight: 700, color: T.tx }}>{c}</span></div>);
          })}
        </div>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════
// Project List
// ═══════════════════════════════════════
const ProjectList = ({ projects, costs, quantities, onSelect, onAdd, sq, setSq, sf, setSf }) => {
  const filtered = projects.filter(p => {
    const ms = !sq || p.name.includes(sq) || p.client.includes(sq);
    const mf = !sf || p.status === sf;
    return ms && mf;
  });
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div><h2 style={{ margin: 0, fontSize: "22px", color: T.tx, fontWeight: 700 }}>案件一覧</h2><p style={{ margin: "6px 0 0", fontSize: "13px", color: T.ts }}>{filtered.length}件</p></div>
        <Btn v="primary" onClick={onAdd}>{I.plus} 新規案件</Btn>
      </div>
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.ts }}>{I.search}</div>
          <input placeholder="案件名・顧客名で検索..." value={sq} onChange={e => setSq(e.target.value)} style={{ width: "100%", padding: "9px 12px 9px 36px", background: T.s, border: `1px solid ${T.bd}`, borderRadius: "8px", color: T.tx, fontSize: "13px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
        </div>
        <select value={sf} onChange={e => setSf(e.target.value)} style={{ padding: "9px 14px", background: T.s, border: `1px solid ${T.bd}`, borderRadius: "8px", color: T.tx, fontSize: "13px", fontFamily: "inherit" }}>
          <option value="">全ステータス</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {filtered.map(p => {
          const st = projStats(p, costs, quantities);
          const hasChanges = (p.changes || []).length > 0;
          return (
            <Card key={p.id} onClick={() => onSelect(p.id)} style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "15px", fontWeight: 600, color: T.tx }}>{p.name}</span>
                    <Badge status={p.status} />
                    <ModeBadge mode={p.mode} />
                    <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", background: T.s2, color: T.ts }}>{p.category}</span>
                    {hasChanges && <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: "#f59e0b18", color: "#f59e0b" }}>増減あり</span>}
                  </div>
                  <div style={{ fontSize: "12px", color: T.ts }}>{p.client} ｜ {fmtDate(p.startDate)} 〜 {fmtDate(p.endDate)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: T.tx }}>¥{fmt(st.effectiveContract)}</div>
                  {st.effectiveContract !== p.originalAmount && <div style={{ fontSize: "10px", color: T.ts, textDecoration: "line-through" }}>当初 ¥{fmt(p.originalAmount)}</div>}
                  <div style={{ fontSize: "11px", color: st.profitRate >= 20 ? T.ok : T.dg }}>粗利 ¥{fmt(st.profit)}（{st.profitRate}%）</div>
                </div>
              </div>
              {p.mode === "subcontract" ? (
                <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                  <div style={{ fontSize: "12px", color: T.ts }}>外注先: <span style={{ color: T.tx }}>{p.subcontractVendor || "未定"}</span></div>
                  <div style={{ fontSize: "12px", color: T.ts }}>マージン: <span style={{ color: T.wn, fontWeight: 600 }}>{p.marginRate}%</span></div>
                  <div style={{ fontSize: "12px", color: T.ts }}>外注額: <span style={{ color: T.tx, fontWeight: 600 }}>¥{fmt(st.subcontractAmount || p.subcontractAmount)}</span></div>
                  <div style={{ flex: 1 }} />
                  <div><div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}><span style={{ fontSize: "11px", color: T.ts }}>入金</span><span style={{ fontSize: "11px", fontWeight: 600, color: T.tx }}>{pct(p.paidAmount, st.effectiveContract)}%</span></div><Bar value={pct(p.paidAmount, st.effectiveContract)} color={T.ok} /></div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "14px", alignItems: "end" }}>
                  <div><div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}><span style={{ fontSize: "11px", color: T.ts }}>進捗</span><span style={{ fontSize: "11px", fontWeight: 600, color: T.tx }}>{p.progress}%</span></div><Bar value={p.progress} /></div>
                  <div><div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}><span style={{ fontSize: "11px", color: T.ts }}>予算消化</span><span style={{ fontSize: "11px", fontWeight: 600, color: st.budgetUsed > 90 ? T.dg : T.tx }}>{st.budgetUsed}%</span></div><Bar value={st.budgetUsed} color={st.budgetUsed > 90 ? T.dg : T.wn} /></div>
                  <div><div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}><span style={{ fontSize: "11px", color: T.ts }}>入金</span><span style={{ fontSize: "11px", fontWeight: 600, color: T.tx }}>{pct(p.paidAmount, st.effectiveContract)}%</span></div><Bar value={pct(p.paidAmount, st.effectiveContract)} color={T.ok} /></div>
                  <div style={{ textAlign: "right", minWidth: "100px" }}>
                    <div style={{ fontSize: "11px", color: "#6b9fff" }}>👷 {st.laborDays}人日 🚛 {st.vehicleDays}台日</div>
                    {st.laborDays > 0 && <div style={{ fontSize: "11px", color: T.ts }}>売上/人工 ¥{fmt(st.revenuePerLabor)}</div>}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════
// Project Detail
// ═══════════════════════════════════════
const Detail = ({ project: p, costs: allCosts, quantities: allQty, onBack, onUpdateProject, onAddCost, onDeleteCost, onAddQty, onDeleteQty, onAddPayment, onDeletePayment, onAddChange, onDeleteChange }) => {
  const isSubcontract = p.mode === "subcontract";
  const defaultTab = isSubcontract ? "payments" : "costs";
  const [tab, setTab] = useState(defaultTab);
  const [costModal, setCostModal] = useState(false);
  const [qtyModal, setQtyModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [changeModal, setChangeModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [cf, setCf] = useState({ category: "material", description: "", amount: "", date: new Date().toISOString().slice(0, 10), vendor: "" });
  const [qf, setQf] = useState({ category: "labor", description: "", quantity: "", date: new Date().toISOString().slice(0, 10), note: "" });
  const [pf, setPf] = useState({ date: new Date().toISOString().slice(0, 10), amount: "", note: "" });
  const [chf, setChf] = useState({ type: "increase", amount: "", description: "", date: new Date().toISOString().slice(0, 10) });
  const [ef, setEf] = useState(null);

  const st = projStats(p, allCosts, allQty);
  const payStatus = p.paidAmount >= st.effectiveContract ? "full" : p.paidAmount > 0 ? "partial" : "unpaid";
  const costByCat = {};
  st.costs.forEach(c => { costByCat[c.category] = (costByCat[c.category] || 0) + c.amount; });

  const handleAddCost = () => { onAddCost({ id: genId(), projectId: p.id, ...cf, amount: Number(cf.amount) }); setCostModal(false); setCf({ category: "material", description: "", amount: "", date: new Date().toISOString().slice(0, 10), vendor: "" }); };
  const handleAddQty = () => { onAddQty({ id: genId(), projectId: p.id, ...qf, quantity: Number(qf.quantity) }); setQtyModal(false); setQf({ category: "labor", description: "", quantity: "", date: new Date().toISOString().slice(0, 10), note: "" }); };
  const handleAddPay = () => { onAddPayment(p.id, { id: genId(), date: pf.date, amount: Number(pf.amount), note: pf.note }); setPayModal(false); setPf({ date: new Date().toISOString().slice(0, 10), amount: "", note: "" }); };
  const handleAddChange = () => { onAddChange(p.id, { id: genId(), ...chf, amount: Number(chf.amount) }); setChangeModal(false); setChf({ type: "increase", amount: "", description: "", date: new Date().toISOString().slice(0, 10) }); };

  const tabs = isSubcontract
    ? [{ id: "payments", label: "🏦 入金管理" }, { id: "changes", label: "📝 増減額" }, { id: "summary", label: "📊 収支サマリー" }]
    : [{ id: "costs", label: "💰 原価明細" }, { id: "labor", label: "👷 人工・車両" }, { id: "payments", label: "🏦 入金管理" }, { id: "changes", label: "📝 増減額" }, { id: "summary", label: "📊 サマリー" }];

  return (
    <div>
      <Btn v="ghost" onClick={onBack} sm style={{ marginBottom: "16px" }}>{I.back} 戻る</Btn>

      {/* Header */}
      <Card style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: "20px", color: T.tx }}>{p.name}</h2>
              <Badge status={p.status} />
              <ModeBadge mode={p.mode} />
              <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", background: T.s2, color: T.ts }}>{p.category}</span>
            </div>
            <div style={{ fontSize: "13px", color: T.ts }}>顧客: {p.client} ｜ 工期: {fmtDate(p.startDate)} 〜 {fmtDate(p.endDate)}{p.notes && ` ｜ ${p.notes}`}</div>
          </div>
          <Btn sm onClick={() => { setEf({ ...p }); setEditModal(true); }}>{I.edit} 編集</Btn>
        </div>

        {/* Contract amount with change history indicator */}
        {st.effectiveContract !== p.originalAmount && (
          <div style={{ marginTop: "12px", padding: "10px 14px", background: "#f59e0b10", borderRadius: "8px", border: "1px solid #f59e0b22", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", color: T.wn }}>📝 契約変更あり</span>
            <span style={{ fontSize: "12px", color: T.ts }}>当初: ¥{fmt(p.originalAmount)}</span>
            <span style={{ fontSize: "12px", color: T.tx }}>→</span>
            <span style={{ fontSize: "13px", fontWeight: 700, color: T.tx }}>現在: ¥{fmt(st.effectiveContract)}</span>
            <span style={{ fontSize: "12px", color: st.effectiveContract > p.originalAmount ? T.ok : T.dg }}>
              ({st.effectiveContract > p.originalAmount ? "+" : ""}¥{fmt(st.effectiveContract - p.originalAmount)})
            </span>
          </div>
        )}

        {/* Key metrics */}
        {isSubcontract ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "20px" }}>
            <Metric label="受注額（増減後）" value={`¥${fmt(st.effectiveContract)}`} />
            <Metric label="マージン率" value={`${p.marginRate}%`} color={T.wn} />
            <Metric label="外注額" value={`¥${fmt(st.subcontractAmount || p.subcontractAmount)}`} sub={`外注先: ${p.subcontractVendor || "未定"}`} />
            <Metric label="粗利" value={`¥${fmt(st.profit)}`} sub={`利益率 ${st.profitRate}%`} color={st.profitRate >= 5 ? T.ok : T.dg} />
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "20px" }}>
              <Metric label="受注額（増減後）" value={`¥${fmt(st.effectiveContract)}`} />
              <Metric label="実行予算" value={`¥${fmt(p.budget)}`} sub={`消化 ${st.budgetUsed}%`} color={st.budgetUsed > 90 ? T.dg : T.tx} />
              <Metric label="原価合計" value={`¥${fmt(st.totalCost)}`} sub={`残予算 ¥${fmt(p.budget - st.totalCost)}`} color={st.totalCost > p.budget ? T.dg : T.tx} />
              <Metric label="粗利" value={`¥${fmt(st.profit)}`} sub={`利益率 ${st.profitRate}%`} color={st.profitRate >= 20 ? T.ok : T.dg} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "10px" }}>
              <div style={{ padding: "12px 16px", background: "#1a2744", borderRadius: "8px", border: "1px solid #253a5e", display: "flex", gap: "24px", flex: 1, minWidth: "300px" }}>
                <div><div style={{ fontSize: "10px", color: "#6b9fff" }}>人工</div><div style={{ fontSize: "17px", fontWeight: 700, color: T.tx }}>{st.laborDays}<span style={{ fontSize: "11px", color: T.ts }}> 人日</span></div></div>
                <div><div style={{ fontSize: "10px", color: "#6b9fff" }}>車両</div><div style={{ fontSize: "17px", fontWeight: 700, color: T.tx }}>{st.vehicleDays}<span style={{ fontSize: "11px", color: T.ts }}> 台日</span></div></div>
                <div style={{ borderLeft: "1px solid #253a5e", paddingLeft: "16px" }}><div style={{ fontSize: "10px", color: "#6b9fff" }}>売上/人工</div><div style={{ fontSize: "17px", fontWeight: 700, color: "#60a5fa" }}>{st.laborDays ? `¥${fmt(st.revenuePerLabor)}` : "—"}</div></div>
                <div><div style={{ fontSize: "10px", color: "#6b9fff" }}>粗利/人工</div><div style={{ fontSize: "17px", fontWeight: 700, color: st.profitPerLabor >= 30000 ? T.ok : T.wn }}>{st.laborDays ? `¥${fmt(st.profitPerLabor)}` : "—"}</div></div>
              </div>
            </div>
            <div style={{ marginTop: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}><span style={{ fontSize: "12px", color: T.ts }}>進捗</span><span style={{ fontSize: "12px", fontWeight: 600, color: T.tx }}>{p.progress}%</span></div>
              <Bar value={p.progress} h={8} />
            </div>
          </>
        )}
      </Card>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "2px", marginBottom: "16px", background: T.s, borderRadius: "10px", padding: "3px", border: `1px solid ${T.bd}` }}>
        {tabs.map(tb => (<button key={tb.id} onClick={() => setTab(tb.id)} style={{ flex: 1, padding: "10px", border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", fontWeight: 600, background: tab === tb.id ? T.ac : "transparent", color: tab === tb.id ? "#fff" : T.ts, transition: "all .15s" }}>{tb.label}</button>))}
      </div>

      {/* ── Costs Tab ── */}
      {tab === "costs" && !isSubcontract && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h4 style={{ margin: 0, fontSize: "14px", color: T.tx }}>原価明細（実費） {st.costs.length}件</h4>
            <Btn v="primary" sm onClick={() => setCostModal(true)}>{I.plus} 原価追加</Btn>
          </div>
          {st.costs.length === 0 ? <div style={{ textAlign: "center", padding: "40px", color: T.ts }}>まだ原価が登録されていません</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: `1px solid ${T.bd}` }}>{["日付","区分","内容","業者","金額",""].map(h => <th key={h} style={{ padding: "8px", fontSize: "11px", color: T.ts, fontWeight: 500, textAlign: h==="金額"?"right":"left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {st.costs.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(c => { const cat = COST_CATEGORIES[c.category]; return (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${T.bd}22` }}>
                    <td style={{ padding: "10px 8px", fontSize: "12px", color: T.ts }}>{fmtDate(c.date)}</td>
                    <td style={{ padding: "10px 8px" }}><span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", background: cat.color+"18", color: cat.color }}>{cat.icon} {cat.label}</span></td>
                    <td style={{ padding: "10px 8px", fontSize: "12px", color: T.tx }}>{c.description}</td>
                    <td style={{ padding: "10px 8px", fontSize: "12px", color: T.ts }}>{c.vendor}</td>
                    <td style={{ padding: "10px 8px", fontSize: "13px", fontWeight: 600, color: T.tx, textAlign: "right" }}>¥{fmt(c.amount)}</td>
                    <td style={{ padding: "10px 4px" }}><button onClick={() => onDeleteCost(c.id)} style={{ background: "none", border: "none", color: T.ts, cursor: "pointer", opacity: .6 }}>{I.trash}</button></td>
                  </tr>); })}
                <tr style={{ borderTop: `2px solid ${T.bd}` }}><td colSpan={4} style={{ padding: "12px 8px", fontSize: "13px", fontWeight: 700, color: T.tx }}>合計</td><td style={{ padding: "12px 8px", fontSize: "15px", fontWeight: 700, color: T.tx, textAlign: "right" }}>¥{fmt(st.totalCost)}</td><td/></tr>
              </tbody>
            </table>
          )}
          <div style={{ marginTop: "20px", padding: "16px", background: T.s2, borderRadius: "10px" }}>
            <h5 style={{ margin: "0 0 12px", fontSize: "12px", color: T.ts }}>カテゴリ別内訳</h5>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
              {Object.entries(COST_CATEGORIES).map(([k, cat]) => (<div key={k} style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: "12px", color: T.ts }}>{cat.icon} {cat.label}</span><span style={{ fontSize: "12px", fontWeight: 600, color: T.tx }}>¥{fmt(costByCat[k]||0)}</span></div>))}
            </div>
          </div>
        </Card>
      )}

      {/* ── Labor / Vehicle Tab ── */}
      {tab === "labor" && !isSubcontract && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h4 style={{ margin: 0, fontSize: "14px", color: T.tx }}>人工・車両記録 {st.quantities.length}件</h4>
            <Btn v="primary" sm onClick={() => setQtyModal(true)}>{I.plus} 記録追加</Btn>
          </div>
          <div style={{ padding: "16px", background: "#1a2744", borderRadius: "10px", border: "1px solid #253a5e", marginBottom: "20px" }}>
            <div style={{ fontSize: "11px", color: T.ts, marginBottom: "12px" }}>※ 人工・車両は数量のみ記録。生産性を「売上÷人工」「粗利÷人工」で評価します。</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
              <div><div style={{ fontSize: "10px", color: "#6b9fff" }}>👷 人工合計</div><div style={{ fontSize: "20px", fontWeight: 700, color: T.tx }}>{st.laborDays}<span style={{ fontSize: "11px", color: T.ts }}> 人日</span></div></div>
              <div><div style={{ fontSize: "10px", color: "#6b9fff" }}>🚛 車両合計</div><div style={{ fontSize: "20px", fontWeight: 700, color: T.tx }}>{st.vehicleDays}<span style={{ fontSize: "11px", color: T.ts }}> 台日</span></div></div>
              <div><div style={{ fontSize: "10px", color: "#6b9fff" }}>売上/人工</div><div style={{ fontSize: "20px", fontWeight: 700, color: "#60a5fa" }}>{st.laborDays ? `¥${fmt(st.revenuePerLabor)}` : "—"}</div></div>
              <div><div style={{ fontSize: "10px", color: "#6b9fff" }}>粗利/人工</div><div style={{ fontSize: "20px", fontWeight: 700, color: st.profitPerLabor >= 30000 ? T.ok : T.wn }}>{st.laborDays ? `¥${fmt(st.profitPerLabor)}` : "—"}</div></div>
            </div>
          </div>
          {st.quantities.length === 0 ? <div style={{ textAlign: "center", padding: "40px", color: T.ts }}>まだ記録がありません</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: `1px solid ${T.bd}` }}>{["日付","区分","内容","数量","備考",""].map(h => <th key={h} style={{ padding: "8px", fontSize: "11px", color: T.ts, fontWeight: 500, textAlign: h==="数量"?"right":"left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {st.quantities.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(q => { const cat = QUANTITY_CATEGORIES[q.category]; return (
                  <tr key={q.id} style={{ borderBottom: `1px solid ${T.bd}22` }}>
                    <td style={{ padding: "10px 8px", fontSize: "12px", color: T.ts }}>{fmtDate(q.date)}</td>
                    <td style={{ padding: "10px 8px" }}><span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", background: cat.color+"18", color: cat.color }}>{cat.icon} {cat.label}</span></td>
                    <td style={{ padding: "10px 8px", fontSize: "12px", color: T.tx }}>{q.description}</td>
                    <td style={{ padding: "10px 8px", fontSize: "13px", fontWeight: 600, color: T.tx, textAlign: "right" }}>{q.quantity} {cat.unit}</td>
                    <td style={{ padding: "10px 8px", fontSize: "12px", color: T.ts }}>{q.note}</td>
                    <td style={{ padding: "10px 4px" }}><button onClick={() => onDeleteQty(q.id)} style={{ background: "none", border: "none", color: T.ts, cursor: "pointer", opacity: .6 }}>{I.trash}</button></td>
                  </tr>); })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ── Changes Tab ── */}
      {tab === "changes" && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h4 style={{ margin: 0, fontSize: "14px", color: T.tx }}>増減額履歴</h4>
            <Btn v="warning" sm onClick={() => setChangeModal(true)}>{I.plus} 増減額登録</Btn>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "20px" }}>
            <Metric label="当初契約額" value={`¥${fmt(p.originalAmount)}`} color={T.ts} />
            <Metric label="増減合計" value={`${st.effectiveContract >= p.originalAmount ? "+" : ""}¥${fmt(st.effectiveContract - p.originalAmount)}`} color={st.effectiveContract >= p.originalAmount ? T.ok : T.dg} />
            <Metric label="現契約額" value={`¥${fmt(st.effectiveContract)}`} color={T.ac} />
          </div>

          {(p.changes || []).length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: T.ts }}>増減額の変更履歴はありません</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: `1px solid ${T.bd}` }}>
                {["日付","種別","金額","内容",""].map(h => <th key={h} style={{ padding: "8px", fontSize: "11px", color: T.ts, fontWeight: 500, textAlign: h==="金額"?"right":"left" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {(p.changes || []).sort((a,b) => new Date(b.date) - new Date(a.date)).map(ch => {
                  const ct = CHANGE_TYPES[ch.type];
                  return (
                    <tr key={ch.id} style={{ borderBottom: `1px solid ${T.bd}22` }}>
                      <td style={{ padding: "10px 8px", fontSize: "12px", color: T.ts }}>{fmtDate(ch.date)}</td>
                      <td style={{ padding: "10px 8px" }}><span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", background: ct.color + "18", color: ct.color, fontWeight: 600 }}>{ct.label}</span></td>
                      <td style={{ padding: "10px 8px", fontSize: "13px", fontWeight: 600, color: ct.color, textAlign: "right" }}>{ct.sign}¥{fmt(ch.amount)}</td>
                      <td style={{ padding: "10px 8px", fontSize: "12px", color: T.tx }}>{ch.description}</td>
                      <td style={{ padding: "10px 4px" }}><button onClick={() => onDeleteChange(p.id, ch.id)} style={{ background: "none", border: "none", color: T.ts, cursor: "pointer", opacity: .6 }}>{I.trash}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ── Payments Tab ── */}
      {tab === "payments" && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}><h4 style={{ margin: 0, fontSize: "14px", color: T.tx }}>入金管理</h4><Badge status={payStatus} map={PAYMENT_STATUS} /></div>
            <Btn v="primary" sm onClick={() => setPayModal(true)}>{I.plus} 入金登録</Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "20px" }}>
            <Metric label="請求額" value={`¥${fmt(p.billedAmount)}`} />
            <Metric label="入金済" value={`¥${fmt(p.paidAmount)}`} color={T.ok} />
            <Metric label="未入金" value={`¥${fmt(p.billedAmount - p.paidAmount)}`} color={p.billedAmount - p.paidAmount > 0 ? T.dg : T.tx} />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}><span style={{ fontSize: "12px", color: T.ts }}>入金進捗</span><span style={{ fontSize: "12px", fontWeight: 600, color: T.tx }}>{pct(p.paidAmount, st.effectiveContract)}%</span></div>
            <Bar value={pct(p.paidAmount, st.effectiveContract)} color={T.ok} h={8} />
          </div>
          {p.payments.length === 0 ? <div style={{ textAlign: "center", padding: "40px", color: T.ts }}>まだ入金記録がありません</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: `1px solid ${T.bd}` }}>{["日付","金額","摘要",""].map(h => <th key={h} style={{ padding: "8px 10px", fontSize: "11px", color: T.ts, fontWeight: 500, textAlign: h==="金額"?"right":"left" }}>{h}</th>)}</tr></thead>
              <tbody>{p.payments.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(pay => (
                <tr key={pay.id} style={{ borderBottom: `1px solid ${T.bd}22` }}>
                  <td style={{ padding: "10px", fontSize: "12px", color: T.ts }}>{fmtDate(pay.date)}</td>
                  <td style={{ padding: "10px", fontSize: "13px", fontWeight: 600, color: T.ok, textAlign: "right" }}>¥{fmt(pay.amount)}</td>
                  <td style={{ padding: "10px", fontSize: "12px", color: T.tx }}>{pay.note}</td>
                  <td style={{ padding: "10px 4px" }}><button onClick={() => onDeletePayment(p.id, pay.id)} style={{ background: "none", border: "none", color: T.ts, cursor: "pointer", opacity: .6 }}>{I.trash}</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      )}

      {/* ── Summary Tab ── */}
      {tab === "summary" && (
        <Card>
          <h4 style={{ margin: "0 0 20px", fontSize: "14px", color: T.tx }}>収支サマリー</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <h5 style={{ fontSize: "12px", color: T.ts, margin: "0 0 12px" }}>収入</h5>
              {[["当初契約額", p.originalAmount, T.ts], ["増減後受注額", st.effectiveContract, T.ac], ["請求済", p.billedAmount, T.tx], ["入金済", p.paidAmount, T.ok]].map(([l,v,c]) => (
                <div key={l} style={{ padding: "12px", background: T.s2, borderRadius: "8px", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "13px", color: T.tx }}>{l}</span>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: c }}>¥{fmt(v)}</span>
                </div>
              ))}
            </div>
            <div>
              <h5 style={{ fontSize: "12px", color: T.ts, margin: "0 0 12px" }}>支出</h5>
              {isSubcontract ? (
                <>
                  <div style={{ padding: "12px", background: T.s2, borderRadius: "8px", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "13px", color: T.tx }}>🏗️ 外注費（{p.subcontractVendor || "未定"}）</span>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: T.tx }}>¥{fmt(st.subcontractAmount || p.subcontractAmount)}</span>
                  </div>
                  <div style={{ padding: "10px 12px", background: T.s2, borderRadius: "8px", display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", color: T.ts }}>マージン率</span>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: T.wn }}>{p.marginRate}%</span>
                  </div>
                </>
              ) : (
                <>
                  {Object.entries(COST_CATEGORIES).map(([k, cat]) => { const v = costByCat[k] || 0; if (!v) return null; return (
                    <div key={k} style={{ padding: "10px 12px", background: T.s2, borderRadius: "8px", marginBottom: "6px", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", color: T.tx }}>{cat.icon} {cat.label}</span>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: T.tx }}>¥{fmt(v)}</span>
                    </div>); })}
                </>
              )}
              <div style={{ padding: "12px", background: T.bd, borderRadius: "8px", marginTop: "8px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: T.tx }}>原価合計</span>
                <span style={{ fontSize: "14px", fontWeight: 700, color: T.tx }}>¥{fmt(st.totalCost)}</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: "24px", padding: "20px", background: st.profitRate >= 15 ? T.ok+"10" : T.dg+"10", borderRadius: "12px", border: `1px solid ${st.profitRate >= 15 ? T.ok : T.dg}33` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", textAlign: "center" }}>
              <div><div style={{ fontSize: "11px", color: T.ts, marginBottom: "6px" }}>粗利益</div><div style={{ fontSize: "22px", fontWeight: 700, color: st.profitRate >= 15 ? T.ok : T.dg }}>¥{fmt(st.profit)}</div></div>
              <div><div style={{ fontSize: "11px", color: T.ts, marginBottom: "6px" }}>利益率</div><div style={{ fontSize: "22px", fontWeight: 700, color: st.profitRate >= 15 ? T.ok : T.dg }}>{st.profitRate}%</div></div>
              <div><div style={{ fontSize: "11px", color: T.ts, marginBottom: "6px" }}>{isSubcontract ? "マージン" : "予算残"}</div><div style={{ fontSize: "22px", fontWeight: 700, color: T.tx }}>{isSubcontract ? `${p.marginRate}%` : `¥${fmt(p.budget - st.totalCost)}`}</div></div>
            </div>
          </div>
          {!isSubcontract && st.laborDays > 0 && (
            <div style={{ marginTop: "16px", padding: "20px", background: "#1a2744", borderRadius: "12px", border: "1px solid #253a5e" }}>
              <div style={{ fontSize: "12px", color: "#6b9fff", fontWeight: 600, marginBottom: "14px" }}>👷 生産性指標</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "20px", textAlign: "center" }}>
                <div><div style={{ fontSize: "11px", color: T.ts, marginBottom: "6px" }}>投入人工</div><div style={{ fontSize: "20px", fontWeight: 700, color: T.tx }}>{st.laborDays} 人日</div></div>
                <div><div style={{ fontSize: "11px", color: T.ts, marginBottom: "6px" }}>車両稼働</div><div style={{ fontSize: "20px", fontWeight: 700, color: T.tx }}>{st.vehicleDays} 台日</div></div>
                <div><div style={{ fontSize: "11px", color: T.ts, marginBottom: "6px" }}>売上/人工</div><div style={{ fontSize: "20px", fontWeight: 700, color: "#60a5fa" }}>¥{fmt(st.revenuePerLabor)}</div></div>
                <div><div style={{ fontSize: "11px", color: T.ts, marginBottom: "6px" }}>粗利/人工</div><div style={{ fontSize: "20px", fontWeight: 700, color: st.profitPerLabor >= 30000 ? T.ok : T.wn }}>¥{fmt(st.profitPerLabor)}</div></div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Modals ── */}
      <Modal open={costModal} onClose={() => setCostModal(false)} title="原価追加（実費）" w={480}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <Sel label="区分" value={cf.category} onChange={e => setCf(f=>({...f, category: e.target.value}))}>{Object.entries(COST_CATEGORIES).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</Sel>
          <Inp label="内容" placeholder="例: 木材一式" value={cf.description} onChange={e => setCf(f=>({...f, description: e.target.value}))} />
          <Inp label="業者名" placeholder="例: ○○木材店" value={cf.vendor} onChange={e => setCf(f=>({...f, vendor: e.target.value}))} />
          <Inp label="金額 (¥)" type="number" placeholder="1200000" value={cf.amount} onChange={e => setCf(f=>({...f, amount: e.target.value}))} />
          <Inp label="日付" type="date" value={cf.date} onChange={e => setCf(f=>({...f, date: e.target.value}))} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}><Btn onClick={() => setCostModal(false)}>キャンセル</Btn><Btn v="primary" onClick={handleAddCost}>追加</Btn></div>
        </div>
      </Modal>

      <Modal open={qtyModal} onClose={() => setQtyModal(false)} title="人工・車両記録追加" w={480}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <Sel label="区分" value={qf.category} onChange={e => setQf(f=>({...f, category: e.target.value}))}>{Object.entries(QUANTITY_CATEGORIES).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}（{v.unit}）</option>)}</Sel>
          <Inp label="内容" placeholder="例: 大工、2tトラック" value={qf.description} onChange={e => setQf(f=>({...f, description: e.target.value}))} />
          <Inp label={`数量（${QUANTITY_CATEGORIES[qf.category].unit}）`} type="number" placeholder="例: 50" value={qf.quantity} onChange={e => setQf(f=>({...f, quantity: e.target.value}))} />
          <Inp label="日付" type="date" value={qf.date} onChange={e => setQf(f=>({...f, date: e.target.value}))} />
          <Inp label="備考" placeholder="例: 5人×10日" value={qf.note} onChange={e => setQf(f=>({...f, note: e.target.value}))} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}><Btn onClick={() => setQtyModal(false)}>キャンセル</Btn><Btn v="primary" onClick={handleAddQty}>追加</Btn></div>
        </div>
      </Modal>

      <Modal open={payModal} onClose={() => setPayModal(false)} title="入金登録" w={420}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <Inp label="入金日" type="date" value={pf.date} onChange={e => setPf(f=>({...f, date: e.target.value}))} />
          <Inp label="金額 (¥)" type="number" placeholder="入金額" value={pf.amount} onChange={e => setPf(f=>({...f, amount: e.target.value}))} />
          <Inp label="摘要" placeholder="例: 着手金" value={pf.note} onChange={e => setPf(f=>({...f, note: e.target.value}))} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}><Btn onClick={() => setPayModal(false)}>キャンセル</Btn><Btn v="primary" onClick={handleAddPay}>登録</Btn></div>
        </div>
      </Modal>

      <Modal open={changeModal} onClose={() => setChangeModal(false)} title="増減額登録" w={480}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ padding: "12px", background: T.s2, borderRadius: "8px", fontSize: "12px", color: T.ts }}>
            現在の契約額: <span style={{ color: T.tx, fontWeight: 700 }}>¥{fmt(st.effectiveContract)}</span>
          </div>
          <Sel label="種別" value={chf.type} onChange={e => setChf(f=>({...f, type: e.target.value}))}>
            <option value="increase">➕ 増額（追加工事・設計変更等）</option>
            <option value="decrease">➖ 減額（仕様変更・範囲縮小等）</option>
          </Sel>
          <Inp label="金額 (¥)" type="number" placeholder="例: 500000" value={chf.amount} onChange={e => setChf(f=>({...f, amount: e.target.value}))} />
          <Inp label="理由・内容" placeholder="例: 追加工事 ウッドデッキ設置" value={chf.description} onChange={e => setChf(f=>({...f, description: e.target.value}))} />
          <Inp label="日付" type="date" value={chf.date} onChange={e => setChf(f=>({...f, date: e.target.value}))} />
          {chf.amount && (
            <div style={{ padding: "12px", background: chf.type === "increase" ? T.ok+"10" : T.dg+"10", borderRadius: "8px", fontSize: "13px" }}>
              変更後: <span style={{ fontWeight: 700, color: T.tx }}>¥{fmt(st.effectiveContract + (chf.type === "increase" ? 1 : -1) * Number(chf.amount))}</span>
              <span style={{ color: chf.type === "increase" ? T.ok : T.dg, marginLeft: "8px" }}>
                ({chf.type === "increase" ? "+" : "−"}¥{fmt(Number(chf.amount))})
              </span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}><Btn onClick={() => setChangeModal(false)}>キャンセル</Btn><Btn v="primary" onClick={handleAddChange}>登録</Btn></div>
        </div>
      </Modal>

      <Modal open={editModal} onClose={() => setEditModal(false)} title="案件編集" w={600}>
        {ef && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <Inp label="案件名" value={ef.name} onChange={e => setEf(f=>({...f, name: e.target.value}))} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <Inp label="顧客名" value={ef.client} onChange={e => setEf(f=>({...f, client: e.target.value}))} />
              <Sel label="区分" value={ef.category} onChange={e => setEf(f=>({...f, category: e.target.value}))}><option value="工事">工事</option><option value="業務">業務</option></Sel>
            </div>

            {/* Mode selection */}
            <div>
              <label style={{ fontSize: "12px", color: T.ts, fontWeight: 500, marginBottom: "6px", display: "block" }}>施工形態</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => setEf(f=>({...f, mode: "normal"}))} style={{ flex: 1, padding: "12px", borderRadius: "8px", border: `2px solid ${ef.mode === "normal" ? T.ac : T.bd}`, background: ef.mode === "normal" ? T.al : T.s2, color: ef.mode === "normal" ? T.ac : T.ts, cursor: "pointer", fontFamily: "inherit", fontSize: "13px", fontWeight: 600 }}>🔧 自社施工</button>
                <button onClick={() => setEf(f=>({...f, mode: "subcontract"}))} style={{ flex: 1, padding: "12px", borderRadius: "8px", border: `2px solid ${ef.mode === "subcontract" ? T.wn : T.bd}`, background: ef.mode === "subcontract" ? T.wn+"15" : T.s2, color: ef.mode === "subcontract" ? T.wn : T.ts, cursor: "pointer", fontFamily: "inherit", fontSize: "13px", fontWeight: 600 }}>📋 一括外注</button>
              </div>
            </div>

            <Inp label="当初契約額 (¥)" type="number" value={ef.originalAmount} onChange={e => setEf(f=>({...f, originalAmount: Number(e.target.value)}))} />

            {ef.mode === "subcontract" ? (
              <>
                <div style={{ padding: "12px", background: T.wn+"10", borderRadius: "8px", border: `1px solid ${T.wn}22`, fontSize: "12px", color: T.ts }}>
                  受注額から指定％を抜いて残りを外注に出す形式です。原価は外注費のみになります。
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <Inp label="マージン率 (%)" type="number" placeholder="例: 10" value={ef.marginRate} onChange={e => {
                    const rate = Number(e.target.value);
                    const eff = getEffectiveContract({...ef, marginRate: rate});
                    setEf(f => ({...f, marginRate: rate, subcontractAmount: Math.round(eff * (1 - rate / 100))}));
                  }} />
                  <Inp label="外注額 (¥)（自動計算）" type="number" value={ef.subcontractAmount || Math.round(getEffectiveContract(ef) * (1 - (ef.marginRate || 0) / 100))} onChange={e => setEf(f=>({...f, subcontractAmount: Number(e.target.value)}))} />
                </div>
                <Inp label="外注先" placeholder="例: ○○建設" value={ef.subcontractVendor} onChange={e => setEf(f=>({...f, subcontractVendor: e.target.value}))} />
              </>
            ) : (
              <Inp label="実行予算 (¥)" type="number" value={ef.budget} onChange={e => setEf(f=>({...f, budget: Number(e.target.value)}))} />
            )}

            <Sel label="ステータス" value={ef.status} onChange={e => setEf(f=>({...f, status: e.target.value}))}>
              {Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </Sel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <Inp label="開始日" type="date" value={ef.startDate} onChange={e => setEf(f=>({...f, startDate: e.target.value}))} />
              <Inp label="完了予定日" type="date" value={ef.endDate} onChange={e => setEf(f=>({...f, endDate: e.target.value}))} />
            </div>
            <Inp label="進捗 (%)" type="number" min="0" max="100" value={ef.progress} onChange={e => setEf(f=>({...f, progress: Number(e.target.value)}))} />
            <Inp label="請求額 (¥)" type="number" value={ef.billedAmount} onChange={e => setEf(f=>({...f, billedAmount: Number(e.target.value)}))} />
            <Txt label="備考" value={ef.notes} onChange={e => setEf(f=>({...f, notes: e.target.value}))} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}><Btn onClick={() => setEditModal(false)}>キャンセル</Btn><Btn v="primary" onClick={() => { onUpdateProject(ef); setEditModal(false); }}>保存</Btn></div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ═══════════════════════════════════════
// New Project
// ═══════════════════════════════════════
const NewProject = ({ onSave, onCancel }) => {
  const [f, setF] = useState({ name: "", client: "", category: "工事", contractAmount: "", budget: "", status: "ordered", startDate: "", endDate: "", progress: 0, notes: "", billedAmount: 0, paidAmount: 0, payments: [], changes: [], mode: "normal", marginRate: "", subcontractAmount: "", subcontractVendor: "" });

  const save = () => {
    if (!f.name || !f.client || !f.contractAmount) return;
    const amt = Number(f.contractAmount);
    const mRate = Number(f.marginRate) || 0;
    onSave({
      ...f, id: genId(), contractAmount: amt, originalAmount: amt,
      budget: f.mode === "subcontract" ? 0 : (Number(f.budget) || Math.round(amt * 0.7)),
      marginRate: mRate,
      subcontractAmount: f.mode === "subcontract" ? (Number(f.subcontractAmount) || Math.round(amt * (1 - mRate / 100))) : 0,
    });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <Btn v="ghost" onClick={onCancel} sm>{I.back} 戻る</Btn>
        <h2 style={{ margin: 0, fontSize: "20px", color: T.tx }}>新規案件登録</h2>
      </div>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "580px" }}>
          <Inp label="案件名 *" placeholder="例: ○○邸 新築工事" value={f.name} onChange={e => setF(p=>({...p, name: e.target.value}))} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Inp label="顧客名 *" placeholder="例: 山田太郎" value={f.client} onChange={e => setF(p=>({...p, client: e.target.value}))} />
            <Sel label="区分" value={f.category} onChange={e => setF(p=>({...p, category: e.target.value}))}><option value="工事">工事</option><option value="業務">業務</option></Sel>
          </div>

          {/* Mode */}
          <div>
            <label style={{ fontSize: "12px", color: T.ts, fontWeight: 500, marginBottom: "6px", display: "block" }}>施工形態 *</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setF(p=>({...p, mode: "normal"}))} style={{ flex: 1, padding: "14px", borderRadius: "10px", border: `2px solid ${f.mode === "normal" ? T.ac : T.bd}`, background: f.mode === "normal" ? T.al : T.s2, color: f.mode === "normal" ? T.ac : T.ts, cursor: "pointer", fontFamily: "inherit", fontSize: "13px", fontWeight: 600 }}>
                🔧 自社施工<br/><span style={{ fontSize: "11px", fontWeight: 400, opacity: .7 }}>材料・外注・人工を個別管理</span>
              </button>
              <button onClick={() => setF(p=>({...p, mode: "subcontract"}))} style={{ flex: 1, padding: "14px", borderRadius: "10px", border: `2px solid ${f.mode === "subcontract" ? T.wn : T.bd}`, background: f.mode === "subcontract" ? T.wn+"15" : T.s2, color: f.mode === "subcontract" ? T.wn : T.ts, cursor: "pointer", fontFamily: "inherit", fontSize: "13px", fontWeight: 600 }}>
                📋 一括外注<br/><span style={{ fontSize: "11px", fontWeight: 400, opacity: .7 }}>％マージンで丸投げ</span>
              </button>
            </div>
          </div>

          <Inp label="受注額 (¥) *" type="number" placeholder="15000000" value={f.contractAmount} onChange={e => setF(p=>({...p, contractAmount: e.target.value}))} />

          {f.mode === "subcontract" ? (
            <>
              <div style={{ padding: "12px", background: T.wn+"10", borderRadius: "8px", border: `1px solid ${T.wn}22`, fontSize: "12px", color: T.ts }}>
                受注額の {f.marginRate || "?"}% を差し引き、¥{fmt(Number(f.contractAmount) * (1 - (Number(f.marginRate) || 0) / 100))} を外注に出します。
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <Inp label="マージン率 (%)" type="number" placeholder="例: 10" value={f.marginRate} onChange={e => {
                  const rate = Number(e.target.value);
                  setF(p => ({...p, marginRate: e.target.value, subcontractAmount: String(Math.round(Number(p.contractAmount) * (1 - rate / 100)))}));
                }} />
                <Inp label="外注額 (¥)" type="number" value={f.subcontractAmount || (f.contractAmount ? String(Math.round(Number(f.contractAmount) * (1 - (Number(f.marginRate)||0) / 100))) : "")} onChange={e => setF(p=>({...p, subcontractAmount: e.target.value}))} />
              </div>
              <Inp label="外注先" placeholder="例: ○○建設" value={f.subcontractVendor} onChange={e => setF(p=>({...p, subcontractVendor: e.target.value}))} />
            </>
          ) : (
            <Inp label="実行予算 (¥)（空欄→受注額の70%）" type="number" placeholder="10500000" value={f.budget} onChange={e => setF(p=>({...p, budget: e.target.value}))} />
          )}

          <Sel label="ステータス" value={f.status} onChange={e => setF(p=>({...p, status: e.target.value}))}>
            {Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </Sel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Inp label="開始日" type="date" value={f.startDate} onChange={e => setF(p=>({...p, startDate: e.target.value}))} />
            <Inp label="完了予定日" type="date" value={f.endDate} onChange={e => setF(p=>({...p, endDate: e.target.value}))} />
          </div>
          <Txt label="備考" placeholder="案件メモ" value={f.notes} onChange={e => setF(p=>({...p, notes: e.target.value}))} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}><Btn onClick={onCancel}>キャンセル</Btn><Btn v="primary" onClick={save}>登録</Btn></div>
        </div>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════
// CSV Export
// ═══════════════════════════════════════
const exportCSV = (projects, costs, quantities) => {
  let csv = "案件名,顧客,区分,施工形態,当初契約額,増減後受注額,実行予算,原価合計,粗利,利益率,マージン率,人工(人日),車両(台日),売上/人工,粗利/人工,進捗,ステータス\n";
  projects.forEach(p => {
    const st = projStats(p, costs, quantities);
    csv += `"${p.name}","${p.client}","${p.category}","${p.mode==="subcontract"?"一括外注":"自社施工"}",${p.originalAmount},${st.effectiveContract},${p.budget},${st.totalCost},${st.profit},${st.profitRate}%,${p.mode==="subcontract"?p.marginRate+"%":"—"},${st.laborDays},${st.vehicleDays},${st.laborDays?st.revenuePerLabor:"—"},${st.laborDays?st.profitPerLabor:"—"},${p.progress}%,${STATUS_MAP[p.status]?.label}\n`;
  });
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "案件一覧.csv"; a.click();
  URL.revokeObjectURL(url);
};

// ═══════════════════════════════════════
// App
// ═══════════════════════════════════════
export default function App() {
  const [data, setData] = useState(createSampleData);
  const [view, setView] = useState("dashboard");
  const [selId, setSelId] = useState(null);
  const [sq, setSq] = useState("");
  const [sf, setSf] = useState("");

  const nav = useCallback((v, pid) => { setView(v); if (pid) setSelId(pid); }, []);
  const selProj = data.projects.find(p => p.id === selId);

  const addProject = (proj) => { setData(d => ({ ...d, projects: [...d.projects, proj] })); setView("list"); };
  const updateProject = (u) => { setData(d => ({ ...d, projects: d.projects.map(p => p.id === u.id ? { ...p, ...u } : p) })); };
  const addCost = (c) => { setData(d => ({ ...d, costs: [...d.costs, c] })); };
  const deleteCost = (id) => { setData(d => ({ ...d, costs: d.costs.filter(c => c.id !== id) })); };
  const addQty = (q) => { setData(d => ({ ...d, quantities: [...d.quantities, q] })); };
  const deleteQty = (id) => { setData(d => ({ ...d, quantities: d.quantities.filter(q => q.id !== id) })); };
  const addPayment = (pid, pay) => { setData(d => ({ ...d, projects: d.projects.map(p => { if (p.id !== pid) return p; const payments = [...p.payments, pay]; return { ...p, payments, paidAmount: payments.reduce((s, x) => s + x.amount, 0) }; }) })); };
  const deletePayment = (pid, payId) => { setData(d => ({ ...d, projects: d.projects.map(p => { if (p.id !== pid) return p; const payments = p.payments.filter(x => x.id !== payId); return { ...p, payments, paidAmount: payments.reduce((s, x) => s + x.amount, 0) }; }) })); };
  const addChange = (pid, ch) => { setData(d => ({ ...d, projects: d.projects.map(p => { if (p.id !== pid) return p; const changes = [...(p.changes || []), ch]; const eff = p.originalAmount + changes.reduce((s, c) => s + (c.type === "increase" ? c.amount : -c.amount), 0); return { ...p, changes, contractAmount: eff }; }) })); };
  const deleteChange = (pid, chId) => { setData(d => ({ ...d, projects: d.projects.map(p => { if (p.id !== pid) return p; const changes = (p.changes || []).filter(c => c.id !== chId); const eff = p.originalAmount + changes.reduce((s, c) => s + (c.type === "increase" ? c.amount : -c.amount), 0); return { ...p, changes, contractAmount: eff }; }) })); };

  const navItems = [
    { id: "dashboard", label: "ダッシュボード", icon: I.dash },
    { id: "list", label: "案件一覧", icon: I.list },
    { id: "new", label: "新規案件", icon: I.plus },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: "'Noto Sans JP', -apple-system, BlinkMacSystemFont, sans-serif", color: T.tx }}>
      <div style={{ width: "220px", background: T.s, borderRight: `1px solid ${T.bd}`, padding: "20px 12px", display: "flex", flexDirection: "column", position: "fixed", height: "100vh", overflowY: "auto" }}>
        <div style={{ padding: "4px 8px", marginBottom: "28px" }}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: T.ac }}>📐 工事原価管理</div>
          <div style={{ fontSize: "10px", color: T.ts, marginTop: "4px" }}>Construction Cost Manager</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
          {navItems.map(n => (<button key={n.id} onClick={() => nav(n.id)} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "inherit", fontSize: "13px", fontWeight: 500, textAlign: "left", width: "100%", background: view === n.id || (view === "detail" && n.id === "list") ? T.al : "transparent", color: view === n.id || (view === "detail" && n.id === "list") ? T.ac : T.ts, transition: "all .15s" }}>{n.icon} {n.label}</button>))}
        </div>
        <div style={{ borderTop: `1px solid ${T.bd}`, paddingTop: "12px" }}>
          <button onClick={() => exportCSV(data.projects, data.costs, data.quantities)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "inherit", fontSize: "12px", fontWeight: 500, background: "transparent", color: T.ts, width: "100%", textAlign: "left" }}>{I.dl} CSV出力</button>
        </div>
      </div>
      <div style={{ flex: 1, marginLeft: "220px", padding: "28px 32px", maxWidth: "1100px" }}>
        {view === "dashboard" && <Dashboard projects={data.projects} costs={data.costs} quantities={data.quantities} onNav={nav} />}
        {view === "list" && <ProjectList projects={data.projects} costs={data.costs} quantities={data.quantities} onSelect={id => nav("detail", id)} onAdd={() => nav("new")} sq={sq} setSq={setSq} sf={sf} setSf={setSf} />}
        {view === "new" && <NewProject onSave={addProject} onCancel={() => nav("list")} />}
        {view === "detail" && selProj && <Detail project={selProj} costs={data.costs} quantities={data.quantities} onBack={() => nav("list")} onUpdateProject={updateProject} onAddCost={addCost} onDeleteCost={deleteCost} onAddQty={addQty} onDeleteQty={deleteQty} onAddPayment={addPayment} onDeletePayment={deletePayment} onAddChange={addChange} onDeleteChange={deleteChange} />}
      </div>
    </div>
  );
}
