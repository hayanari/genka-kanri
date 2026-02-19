"use client";

import { useState, useCallback } from "react";
import { Icons, T } from "@/lib/constants";
import { createSampleData, exportCSV } from "@/lib/utils";
import type { Project, Cost, Quantity } from "@/lib/utils";
import Dashboard from "@/components/Dashboard";
import ProjectList from "@/components/ProjectList";
import ProjectDetail from "@/components/ProjectDetail";
import NewProject from "@/components/NewProject";

export default function Home() {
  const [data, setData] = useState<
    {
      projects: Project[];
      costs: Cost[];
      quantities: Quantity[];
    }
  >(createSampleData);
  const [view, setView] = useState("dashboard");
  const [selId, setSelId] = useState<string | null>(null);
  const [sq, setSq] = useState("");
  const [sf, setSf] = useState("");

  const nav = useCallback((v: string, pid?: string) => {
    setView(v);
    if (pid) setSelId(pid);
  }, []);

  const selProj = data.projects.find((p) => p.id === selId);

  const addProject = (proj: Project) => {
    setData((d) => ({ ...d, projects: [...d.projects, proj] }));
    setView("list");
  };

  const updateProject = (u: Project) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) => (p.id === u.id ? { ...p, ...u } : p)),
    }));
  };

  const deleteProject = (pid: string) => {
    setData((d) => ({
      projects: d.projects.filter((p) => p.id !== pid),
      costs: d.costs.filter((c) => c.projectId !== pid),
      quantities: d.quantities.filter((q) => q.projectId !== pid),
    }));
    setView("list");
    setSelId(null);
  };

  const addCost = (c: Cost) => {
    setData((d) => ({ ...d, costs: [...d.costs, c] }));
  };

  const deleteCost = (id: string) => {
    setData((d) => ({ ...d, costs: d.costs.filter((c) => c.id !== id) }));
  };

  const addQty = (q: Quantity) => {
    setData((d) => ({ ...d, quantities: [...d.quantities, q] }));
  };

  const deleteQty = (id: string) => {
    setData((d) => ({
      ...d,
      quantities: d.quantities.filter((q) => q.id !== id),
    }));
  };

  const addPayment = (
    pid: string,
    pay: { id: string; date: string; amount: number; note: string }
  ) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) => {
        if (p.id !== pid) return p;
        const payments = [...p.payments, pay];
        return {
          ...p,
          payments,
          paidAmount: payments.reduce((s, x) => s + x.amount, 0),
        };
      }),
    }));
  };

  const deletePayment = (pid: string, payId: string) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) => {
        if (p.id !== pid) return p;
        const payments = p.payments.filter((x) => x.id !== payId);
        return {
          ...p,
          payments,
          paidAmount: payments.reduce((s, x) => s + x.amount, 0),
        };
      }),
    }));
  };

  const addChange = (
    pid: string,
    ch: {
      id: string;
      date: string;
      type: string;
      amount: number;
      description: string;
    }
  ) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) => {
        if (p.id !== pid) return p;
        const changes = [...(p.changes || []), ch];
        const eff =
          p.originalAmount +
          changes.reduce(
            (s, c) => s + (c.type === "increase" ? c.amount : -c.amount),
            0
          );
        return { ...p, changes, contractAmount: eff };
      }),
    }));
  };

  const deleteChange = (pid: string, chId: string) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) => {
        if (p.id !== pid) return p;
        const changes = (p.changes || []).filter((c) => c.id !== chId);
        const eff =
          p.originalAmount +
          changes.reduce(
            (s, c) => s + (c.type === "increase" ? c.amount : -c.amount),
            0
          );
        return { ...p, changes, contractAmount: eff };
      }),
    }));
  };

  const navItems = [
    { id: "dashboard", label: "ダッシュボード", icon: Icons.dash },
    { id: "list", label: "案件一覧", icon: Icons.list },
    { id: "new", label: "新規案件", icon: Icons.plus },
  ];

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: T.bg,
        fontFamily:
          "'Noto Sans JP', -apple-system, BlinkMacSystemFont, sans-serif",
        color: T.tx,
      }}
    >
      <div
        style={{
          width: "220px",
          background: T.s,
          borderRight: `1px solid ${T.bd}`,
          padding: "20px 12px",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          height: "100vh",
          overflowY: "auto",
        }}
      >
        <div style={{ padding: "4px 8px", marginBottom: "28px" }}>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 800,
              color: T.ac,
            }}
          >
            📐 工事原価管理
          </div>
          <div
            style={{
              fontSize: "10px",
              color: T.ts,
              marginTop: "4px",
            }}
          >
            Construction Cost Manager
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            flex: 1,
          }}
        >
          {navItems.map((n) => (
            <button
              key={n.id}
              onClick={() => nav(n.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 12px",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "13px",
                fontWeight: 500,
                textAlign: "left",
                width: "100%",
                background:
                  view === n.id || (view === "detail" && n.id === "list")
                    ? T.al
                    : "transparent",
                color:
                  view === n.id || (view === "detail" && n.id === "list")
                    ? T.ac
                    : T.ts,
                transition: "all .15s",
              }}
            >
              {n.icon} {n.label}
            </button>
          ))}
        </div>
        <div
          style={{
            borderTop: `1px solid ${T.bd}`,
            paddingTop: "12px",
          }}
        >
          <button
            onClick={() =>
              exportCSV(data.projects, data.costs, data.quantities)
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 12px",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "12px",
              fontWeight: 500,
              background: "transparent",
              color: T.ts,
              width: "100%",
              textAlign: "left",
            }}
          >
            {Icons.dl} CSV出力
          </button>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          marginLeft: "220px",
          padding: "28px 32px",
          maxWidth: "1100px",
        }}
      >
        {view === "dashboard" && (
          <Dashboard
            projects={data.projects}
            costs={data.costs}
            quantities={data.quantities}
            onNav={nav}
          />
        )}
        {view === "list" && (
          <ProjectList
            projects={data.projects}
            costs={data.costs}
            quantities={data.quantities}
            onSelect={(id) => nav("detail", id)}
            onAdd={() => nav("new")}
            sq={sq}
            setSq={setSq}
            sf={sf}
            setSf={setSf}
          />
        )}
        {view === "new" && (
          <NewProject onSave={addProject} onCancel={() => nav("list")} />
        )}
        {view === "detail" && selProj && (
          <ProjectDetail
            project={selProj}
            costs={data.costs}
            quantities={data.quantities}
            onBack={() => nav("list")}
            onUpdateProject={updateProject}
            onDeleteProject={deleteProject}
            onAddCost={addCost}
            onDeleteCost={deleteCost}
            onAddQty={addQty}
            onDeleteQty={deleteQty}
            onAddPayment={addPayment}
            onDeletePayment={deletePayment}
            onAddChange={addChange}
            onDeleteChange={deleteChange}
          />
        )}
      </div>
    </div>
  );
}
