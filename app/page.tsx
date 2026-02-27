"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icons, T } from "@/lib/constants";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { createEmptyData, exportCSV } from "@/lib/utils";
import { loadData, saveData } from "@/lib/supabase/data";
import { signOut } from "@/lib/supabase/auth";
import type {
  Project,
  Cost,
  Quantity,
  Vehicle,
  BidSchedule,
} from "@/lib/utils";
import { bidScheduleToProject, getNextManagementNumber } from "@/lib/utils";
import { genId } from "@/lib/constants";
import AuthGuard from "@/components/AuthGuard";
import Dashboard from "@/components/Dashboard";
import ProjectList from "@/components/ProjectList";
import ProjectDetail from "@/components/ProjectDetail";
import NewProject from "@/components/NewProject";
import VehicleMaster from "@/components/VehicleMaster";
import BidScheduleList from "@/components/BidScheduleList";
import NewBidSchedule from "@/components/NewBidSchedule";

export default function Home() {
  const router = useRouter();
  const [data, setData] = useState<
    {
      projects: Project[];
      costs: Cost[];
      quantities: Quantity[];
      vehicles: Vehicle[];
      bidSchedules: BidSchedule[];
    }
  >(createEmptyData);
  const [loading, setLoading] = useState(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadData().then((loaded) => {
      setData(loaded);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (loading) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveData(data);
      saveTimeoutRef.current = null;
    }, 500);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [data, loading]);
  const [view, setView] = useState("dashboard");
  const [selId, setSelId] = useState<string | null>(null);
  const [sq, setSq] = useState("");
  const [sf, setSf] = useState("");
  const [showCsvExportModal, setShowCsvExportModal] = useState(false);

  const nav = useCallback((v: string, pid?: string) => {
    setView(v);
    if (pid) setSelId(pid);
  }, []);

  const selProj = data.projects.find((p) => p.id === selId);

  const addProject = (proj: Project) => {
    const projWithNum = {
      ...proj,
      managementNumber: getNextManagementNumber(data.projects, proj.category),
    };
    const next = { ...data, projects: [...data.projects, projWithNum] };
    setData(next);
    saveData(next);
    setView("list");
  };

  const importProjects = (projects: Project[]) => {
    let currentProjects = [...data.projects];
    const toAdd = projects.map((p) => {
      const num = getNextManagementNumber(currentProjects, p.category);
      currentProjects = [...currentProjects, { ...p, managementNumber: num }];
      return { ...p, managementNumber: num };
    });
    const next = { ...data, projects: [...data.projects, ...toAdd] };
    setData(next);
    saveData(next);
    setView("list");
  };

  const addBidSchedule = (b: BidSchedule) => {
    const next = {
      ...data,
      bidSchedules: [...(data.bidSchedules || []), b],
    };
    setData(next);
    saveData(next);
    setView("bidschedule");
  };

  const updateBidSchedule = (b: BidSchedule) => {
    const next = {
      ...data,
      bidSchedules: (data.bidSchedules || []).map((x) =>
        x.id === b.id ? b : x
      ),
    };
    setData(next);
    saveData(next);
  };

  const deleteBidSchedule = (id: string) => {
    const next = {
      ...data,
      bidSchedules: (data.bidSchedules || []).filter((x) => x.id !== id),
    };
    setData(next);
    saveData(next);
  };

  const addBidScheduleToProjects = (b: BidSchedule) => {
    if ((b.status !== "won" && b.status !== "expected") || b.projectId) return;
    const proj = bidScheduleToProject(b, genId());
    proj.managementNumber = getNextManagementNumber(data.projects, b.category);
    const next = {
      ...data,
      projects: [...data.projects, proj],
      bidSchedules: (data.bidSchedules || []).map((x) =>
        x.id === b.id ? { ...x, ...b, projectId: proj.id } : x
      ),
    };
    setData(next);
    saveData(next);
    navWithClose("detail", proj.id);
  };

  const updateProject = (u: Project) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) => (p.id === u.id ? { ...p, ...u } : p)),
    }));
  };

  const deleteProject = (pid: string) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === pid
          ? { ...p, deleted: true, deletedAt: new Date().toISOString() }
          : p
      ),
    }));
    setView("list");
    setSelId(null);
  };

  const restoreProject = (pid: string) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === pid ? { ...p, deleted: false, deletedAt: undefined } : p
      ),
    }));
    setView("list");
    setSelId(null);
  };

  const archiveProject = (pid: string, archiveYear: string) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === pid
          ? { ...p, archived: true, archiveYear }
          : p
      ),
    }));
    setView("archive");
    setSelId(null);
  };

  const unarchiveProject = (pid: string) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === pid
          ? { ...p, archived: false, archiveYear: undefined }
          : p
      ),
    }));
    setView("list");
    setSelId(null);
  };

  const activeProjects = data.projects.filter(
    (p) => !p.archived && !p.deleted
  );
  const archivedProjects = data.projects.filter(
    (p) => !!p.archived && !p.deleted
  );
  const deletedProjects = data.projects.filter((p) => !!p.deleted);

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

  const updateVehicles = (vehicles: Vehicle[]) => {
    setData((d) => ({ ...d, vehicles }));
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

  const isMobile = useMediaQuery("(max-width: 767px)");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navWithClose = useCallback(
    (v: string, pid?: string) => {
      nav(v, pid);
      if (isMobile) setSidebarOpen(false);
    },
    [isMobile, nav]
  );

  const navItems = [
    { id: "dashboard", label: "ダッシュボード", icon: Icons.dash },
    { id: "list", label: "案件一覧", icon: Icons.list },
    { id: "new", label: "新規案件", icon: Icons.plus },
    { id: "bidschedule", label: "入札スケジュール", icon: Icons.calendar },
    { id: "archive", label: "アーカイブ", icon: Icons.archive },
    { id: "deleted", label: "削除済み", icon: Icons.trash },
    { id: "vehicles", label: "車両マスタ", icon: Icons.truck },
  ];

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <AuthGuard>
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
      {isMobile && (
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            position: "fixed",
            top: 12,
            left: 12,
            zIndex: 100,
            padding: "10px 12px",
            background: T.s,
            border: `1px solid ${T.bd}`,
            borderRadius: "8px",
            color: T.tx,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="メニューを開く"
        >
          {Icons.menu}
        </button>
      )}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 998,
          }}
        />
      )}
      <div
        style={{
          width: isMobile ? "260px" : "220px",
          background: T.s,
          borderRight: `1px solid ${T.bd}`,
          padding: "20px 12px",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          height: "100vh",
          overflowY: "auto",
          zIndex: 999,
          transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "none",
          transition: "transform 0.2s ease",
        }}
      >
        <div style={{ padding: "4px 8px", marginBottom: "28px" }}>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: T.ts,
              letterSpacing: "0.05em",
              marginBottom: "4px",
            }}
          >
            TOKITO CORP
          </div>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 800,
              color: T.ac,
            }}
          >
            📐 案件管理
          </div>
          <div
            style={{
              fontSize: "10px",
              color: T.ts,
              marginTop: "4px",
            }}
          >
            Case Management
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
              onClick={() => navWithClose(n.id)}
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
                  view === n.id ||
                  (view === "detail" &&
                    (n.id === "list" || n.id === "archive" || n.id === "deleted")) ||
                  (view === "vehicles" && n.id === "vehicles") ||
                  ((view === "bidschedule" || view === "newbidschedule") && n.id === "bidschedule")
                    ? T.al
                    : "transparent",
                color:
                  view === n.id ||
                  (view === "detail" &&
                    (n.id === "list" || n.id === "archive" || n.id === "deleted")) ||
                  (view === "vehicles" && n.id === "vehicles") ||
                  ((view === "bidschedule" || view === "newbidschedule") && n.id === "bidschedule")
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
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <button
            onClick={() => setShowCsvExportModal(true)}
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
          <Link
            href="/settings"
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
              textDecoration: "none",
            }}
          >
            🔐 パスワード変更
          </Link>
          <button
            onClick={handleLogout}
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
            🚪 ログアウト
          </button>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          marginLeft: isMobile ? 0 : "220px",
          padding: isMobile ? "56px 16px 24px" : "28px 32px",
          maxWidth: "1100px",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {loading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "200px",
              color: T.ts,
              fontSize: "14px",
            }}
          >
            読み込み中...
          </div>
        )}
        {!loading && view === "dashboard" && (
          <Dashboard
            projects={activeProjects}
            costs={data.costs}
            quantities={data.quantities}
            onNav={navWithClose}
          />
        )}
        {!loading && view === "list" && (
          <ProjectList
            projects={activeProjects}
            costs={data.costs}
            quantities={data.quantities}
            onSelect={(id) => navWithClose("detail", id)}
            onAdd={() => navWithClose("new")}
            onImport={importProjects}
            sq={sq}
            setSq={setSq}
            sf={sf}
            setSf={setSf}
          />
        )}
        {!loading && view === "archive" && (
          <ProjectList
            projects={archivedProjects}
            costs={data.costs}
            quantities={data.quantities}
            onSelect={(id) => navWithClose("detail", id)}
            sq={sq}
            setSq={setSq}
            sf={sf}
            setSf={setSf}
            title="アーカイブ一覧"
            showAddButton={false}
            showArchiveYear
          />
        )}
        {!loading && view === "deleted" && (
          <ProjectList
            projects={deletedProjects}
            costs={data.costs}
            quantities={data.quantities}
            onSelect={(id) => navWithClose("detail", id)}
            onRestore={restoreProject}
            sq={sq}
            setSq={setSq}
            sf={sf}
            setSf={setSf}
            title="削除済み"
            showAddButton={false}
            showRestoreButton
            showDeletedAt
          />
        )}
        {!loading && view === "new" && (
          <NewProject onSave={addProject} onCancel={() => navWithClose("list")} />
        )}
        {!loading && view === "bidschedule" && (
          <BidScheduleList
            bidSchedules={data.bidSchedules || []}
            onAdd={() => navWithClose("newbidschedule")}
            onUpdate={updateBidSchedule}
            onDelete={deleteBidSchedule}
            onAddToProjects={addBidScheduleToProjects}
          />
        )}
        {!loading && view === "newbidschedule" && (
          <NewBidSchedule
            onSave={addBidSchedule}
            onCancel={() => navWithClose("bidschedule")}
          />
        )}
        {!loading && view === "vehicles" && (
          <VehicleMaster
            vehicles={data.vehicles}
            onUpdate={updateVehicles}
          />
        )}
        {!loading && view === "detail" && selProj && (
          <ProjectDetail
            project={selProj}
            costs={data.costs}
            quantities={data.quantities}
            vehicles={data.vehicles}
            onBack={() =>
              navWithClose(
                selProj.deleted
                  ? "deleted"
                  : selProj.archived
                    ? "archive"
                    : "list"
              )
            }
            onUpdateProject={updateProject}
            onDeleteProject={deleteProject}
            onArchiveProject={archiveProject}
            onUnarchiveProject={unarchiveProject}
            onRestoreProject={restoreProject}
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
      {showCsvExportModal && (
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
          onClick={() => setShowCsvExportModal(false)}
        >
          <div
            style={{
              background: T.bg,
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "360px",
              width: "100%",
              border: `1px solid ${T.bd}`,
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: T.tx,
                marginBottom: "16px",
              }}
            >
              CSV出力範囲を選択
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <button
                onClick={() => {
                  exportCSV(activeProjects, data.costs, data.quantities);
                  setShowCsvExportModal(false);
                }}
                style={{
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: `1px solid ${T.bd}`,
                  background: T.s,
                  color: T.tx,
                  fontSize: "14px",
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                📋 案件一覧のみ（{activeProjects.length}件）
              </button>
              <button
                onClick={() => {
                  const withArchive = [...activeProjects, ...archivedProjects];
                  exportCSV(withArchive, data.costs, data.quantities);
                  setShowCsvExportModal(false);
                }}
                style={{
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: `1px solid ${T.bd}`,
                  background: T.s,
                  color: T.tx,
                  fontSize: "14px",
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                📦 アーカイブ含む（{activeProjects.length + archivedProjects.length}件）
              </button>
              <button
                onClick={() => setShowCsvExportModal(false)}
                style={{
                  padding: "10px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: "transparent",
                  color: T.ts,
                  fontSize: "13px",
                  fontFamily: "inherit",
                  cursor: "pointer",
                  marginTop: "4px",
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AuthGuard>
  );
}
