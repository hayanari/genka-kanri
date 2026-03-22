"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icons, T } from "@/lib/constants";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { createEmptyData, exportCSV } from "@/lib/utils";
import { loadData, saveData, fetchGenkaDataRevision } from "@/lib/supabase/data";
import { saveLocalBackup, saveDataPendingSync, shouldRunDailyBackup, setLastRemoteBackupAt } from "@/lib/backup";
import { createRemoteBackup } from "@/lib/supabase/backup";
import { loadScheduleData } from "@/lib/scheduleStorage";
import { signOut } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/client";
import { isAdminEmail } from "@/lib/supabase/admin";
import type {
  Project,
  Cost,
  Quantity,
  Vehicle,
  BidSchedule,
  ProcessMaster as ProcessMasterType,
  EquipmentRequest,
} from "@/lib/utils";
import { bidScheduleToProject, getNextManagementNumber, toStoredPersonName } from "@/lib/utils";
import { genId } from "@/lib/constants";
import AuthGuard from "@/components/AuthGuard";
import Dashboard from "@/components/Dashboard";
import ProjectList from "@/components/ProjectList";
import ProjectDetail from "@/components/ProjectDetail";
import NewProject from "@/components/NewProject";
import VehicleMaster from "@/components/VehicleMaster";
import ProcessMaster from "@/components/ProcessMaster";
import BidScheduleList from "@/components/BidScheduleList";
import NewBidSchedule from "@/components/NewBidSchedule";
import EquipmentRequestList from "@/components/EquipmentRequestList";

export default function Home() {
  const router = useRouter();
  const [data, setData] = useState<{
    projects: Project[];
    costs: Cost[];
    quantities: Quantity[];
    vehicles: Vehicle[];
    processMasters: ProcessMasterType[];
    bidSchedules: BidSchedule[];
    equipmentRequests: EquipmentRequest[];
  }>(createEmptyData);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedSuccessfully = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  const [view, setView] = useState("dashboard");
  const [selId, setSelId] = useState<string | null>(null);
  const [sq, setSq] = useState("");
  const [sf, setSf] = useState("");
  const [expectedPaymentMonthFilter, setExpectedPaymentMonthFilter] = useState<string | null>(null);
  const [personInChargeFilter, setPersonInChargeFilter] = useState<string | null>(null);
  const [showCsvExportModal, setShowCsvExportModal] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const lastSyncedRevisionRef = useRef<string | null>(null);
  const viewRef = useRef(view);
  const csvModalRef = useRef(showCsvExportModal);
  viewRef.current = view;
  csvModalRef.current = showCsvExportModal;

  const saveDataIfCurrent = useCallback(
    async (
      d: {
        projects: Project[];
        costs: Cost[];
        quantities: Quantity[];
        vehicles?: { id: string; registration: string }[];
        processMasters?: ProcessMasterType[];
        bidSchedules?: BidSchedule[];
        equipmentRequests?: EquipmentRequest[];
      },
      opts?: { force?: boolean }
    ) => {
      if (!opts?.force) {
        const remote = await fetchGenkaDataRevision();
        if (
          lastSyncedRevisionRef.current !== null &&
          remote !== null &&
          remote !== lastSyncedRevisionRef.current
        ) {
          return { ok: false as const, reason: "conflict" as const };
        }
      }
      const result = await saveData(d, opts);
      if (result.ok) {
        lastSyncedRevisionRef.current = await fetchGenkaDataRevision();
      }
      return result;
    },
    []
  );

  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null);
    });
  }, []);

  useEffect(() => {
    Promise.all([loadData(), loadScheduleData()])
      .then(async ([loaded, schedule]) => {
        if (loaded === null) {
          setLoadError(true);
        } else {
          setData(loaded);
          saveLocalBackup({
            ...loaded,
            schedule: schedule ?? { workers: [], schedules: [], dayMemos: {} },
          });
          hasLoadedSuccessfully.current = true;
          setLoadError(false);
          lastSyncedRevisionRef.current = await fetchGenkaDataRevision();
        }
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (loading || loadError || !hasLoadedSuccessfully.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const d = dataRef.current;
      const result = await saveDataIfCurrent(d);
      saveTimeoutRef.current = null;
      if (!result.ok) {
        if (result.reason === "conflict") {
          setSaveError("別の端末でデータが更新されました。ページを再読み込み（F5）してください。");
        } else {
          setSaveError(result.reason === "guard" ? "データ保護のため保存をキャンセルしました" : "保存に失敗しました");
        }
      } else {
        setSaveError(null);
        if (shouldRunDailyBackup()) {
          createRemoteBackup(d).then((res) => {
            if (res.ok) setLastRemoteBackupAt();
          });
        }
      }
    }, 150);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [data, loading, loadError, saveDataIfCurrent]);

  // タブ復帰時: 案件データが他端末で更新されていれば自動再読み込み（新規作成画面・CSVモーダル中は除く）
  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState !== "visible") return;
      const remote = await fetchGenkaDataRevision();
      if (remote === null || lastSyncedRevisionRef.current === null) return;
      if (remote === lastSyncedRevisionRef.current) return;
      if (viewRef.current === "new" || viewRef.current === "newbidschedule") return;
      if (csvModalRef.current) return;
      const loaded = await loadData();
      if (loaded === null) return;
      setData(loaded);
      saveLocalBackup({
        ...loaded,
        schedule: (await loadScheduleData()) ?? { workers: [], schedules: [], dayMemos: {} },
      });
      lastSyncedRevisionRef.current = await fetchGenkaDataRevision();
      setSyncNotice("他の端末での更新を取り込みました（案件管理）");
      window.setTimeout(() => setSyncNotice(null), 5000);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // beforeunload: リロード・タブ閉じ前に同期的に保存（非同期は完了しないため）
  useEffect(() => {
    const handler = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const d = dataRef.current;
      saveLocalBackup({ ...d, schedule: undefined });
      saveDataPendingSync(d);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const VIEW_KEY = "genka_view";
  const SEL_ID_KEY = "genka_sel_id";
  const readStored = () => {
    if (typeof window === "undefined") return { v: "dashboard", id: null };
    try {
      const v = sessionStorage.getItem(VIEW_KEY) || "dashboard";
      const id = sessionStorage.getItem(SEL_ID_KEY);
      return { v, id };
    } catch {
      return { v: "dashboard", id: null };
    }
  };
  useEffect(() => {
    const { v, id } = readStored();
    setView(v);
    setSelId(id);
  }, []);

  const nav = useCallback((v: string, pid?: string) => {
    setView(v);
    setSelId(pid ?? null);
    try {
      sessionStorage.setItem(VIEW_KEY, v);
      if (pid) sessionStorage.setItem(SEL_ID_KEY, pid);
      else sessionStorage.removeItem(SEL_ID_KEY);
    } catch {}
  }, []);

  const selProj = data.projects.find((p) => p.id === selId);

  const addProject = async (proj: Project) => {
    const prev = dataRef.current;
    const projWithNum = {
      ...proj,
      personInCharge: toStoredPersonName(proj.personInCharge),
      managementNumber: getNextManagementNumber(prev.projects, proj.category),
      updatedAt: new Date().toISOString(),
    };
    const next = { ...prev, projects: [...prev.projects, projWithNum] };
    setData(next);
    const result = await saveDataIfCurrent(next);
    if (!result.ok) {
      if (result.reason === "conflict") {
        setData(prev);
        alert("別の端末でデータが更新されました。ページを再読み込み（F5）してください。");
      }
      return;
    }
    nav("list");
  };

  const importProjects = async (projects: Project[]) => {
    const prev = dataRef.current;
    const now = new Date().toISOString();
    let currentProjects = [...prev.projects];
    const toAdd = projects.map((p) => {
      const num = getNextManagementNumber(currentProjects, p.category);
      const withNum = { ...p, personInCharge: toStoredPersonName(p.personInCharge), managementNumber: num, updatedAt: now };
      currentProjects = [...currentProjects, withNum];
      return withNum;
    });
    const next = { ...prev, projects: [...prev.projects, ...toAdd] };
    setData(next);
    const result = await saveDataIfCurrent(next);
    if (!result.ok) {
      if (result.reason === "conflict") {
        setData(prev);
        alert("別の端末でデータが更新されました。ページを再読み込み（F5）してください。");
      }
      return;
    }
    nav("list");
  };

  const addBidSchedule = async (b: BidSchedule) => {
    const prev = dataRef.current;
    const next = {
      ...prev,
      bidSchedules: [...(prev.bidSchedules || []), b],
    };
    setData(next);
    const result = await saveDataIfCurrent(next);
    if (!result.ok && result.reason === "conflict") {
      setData(prev);
      alert("別の端末でデータが更新されました。ページを再読み込み（F5）してください。");
      return;
    }
    nav("bidschedule");
  };

  const updateBidSchedule = async (b: BidSchedule) => {
    const prev = dataRef.current;
    const next = {
      ...prev,
      bidSchedules: (prev.bidSchedules || []).map((x) =>
        x.id === b.id ? b : x
      ),
    };
    setData(next);
    const result = await saveDataIfCurrent(next);
    if (!result.ok && result.reason === "conflict") {
      setData(prev);
      alert("別の端末でデータが更新されました。ページを再読み込み（F5）してください。");
    }
  };

  const deleteBidSchedule = async (id: string) => {
    const prev = dataRef.current;
    const next = {
      ...prev,
      bidSchedules: (prev.bidSchedules || []).filter((x) => x.id !== id),
    };
    setData(next);
    const result = await saveDataIfCurrent(next);
    if (!result.ok && result.reason === "conflict") {
      setData(prev);
      alert("別の端末でデータが更新されました。ページを再読み込み（F5）してください。");
    }
  };

  const addBidScheduleToProjects = async (b: BidSchedule) => {
    if ((b.status !== "won" && b.status !== "expected") || b.projectId) return;
    const prev = dataRef.current;
    const proj = bidScheduleToProject(b, genId());
    proj.managementNumber = getNextManagementNumber(prev.projects, b.category);
    proj.updatedAt = new Date().toISOString();
    const next = {
      ...prev,
      projects: [...prev.projects, proj],
      bidSchedules: (prev.bidSchedules || []).map((x) =>
        x.id === b.id ? { ...x, ...b, projectId: proj.id } : x
      ),
    };
    setData(next);
    const result = await saveDataIfCurrent(next);
    if (!result.ok) {
      if (result.reason === "conflict") {
        setData(prev);
        alert("別の端末でデータが更新されました。ページを再読み込み（F5）してください。");
      }
      return;
    }
    navWithClose("detail", proj.id);
  };

  const updateProject = (u: Project) => {
    const normalized = {
      ...u,
      personInCharge: toStoredPersonName(u.personInCharge),
      updatedAt: new Date().toISOString(),
    };
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === u.id ? { ...p, ...normalized } : p
      ),
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
    nav("list");
  };

  const restoreProject = (pid: string) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === pid ? { ...p, deleted: false, deletedAt: undefined } : p
      ),
    }));
    nav("list");
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
    nav("archive");
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
    nav("list");
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

  const updateCost = (c: Cost) => {
    setData((d) => ({
      ...d,
      costs: d.costs.map((x) => (x.id === c.id ? c : x)),
    }));
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

  const updateProcessMasters = (processMasters: ProcessMasterType[]) => {
    setData((d) => ({ ...d, processMasters }));
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
    { id: "equipment", label: "備品申請", icon: Icons.list },
    { id: "schedule", label: "スケジュール管理", icon: Icons.calendar, href: "/schedule" },
    { id: "bidschedule", label: "入札スケジュール", icon: Icons.calendar },
    { id: "archive", label: "アーカイブ", icon: Icons.archive },
    { id: "deleted", label: "削除済み", icon: Icons.trash },
    { id: "vehicles", label: "車両マスタ", icon: Icons.truck },
    { id: "processmasters", label: "工程マスタ", icon: Icons.process },
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
            top: "max(12px, env(safe-area-inset-top, 0px))",
            left: "max(12px, env(safe-area-inset-left, 0px))",
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
            minWidth: 44,
            minHeight: 44,
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
          {navItems.map((n) => {
            const href = "href" in n ? (n as { href?: string }).href : undefined;
            const isActive = view === n.id ||
              (view === "detail" && (n.id === "list" || n.id === "archive" || n.id === "deleted")) ||
              (view === "vehicles" && n.id === "vehicles") ||
              (view === "processmasters" && n.id === "processmasters") ||
              ((view === "bidschedule" || view === "newbidschedule") && n.id === "bidschedule") ||
              (view === "equipment" && n.id === "equipment");
            const style = {
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
              textAlign: "left" as const,
              width: "100%",
              background: isActive ? T.al : "transparent",
              color: isActive ? T.ac : T.ts,
              transition: "all .15s",
              textDecoration: "none",
            };
            if (href) {
              return (
                <Link key={n.id} href={href} style={style}>
                  {n.icon} {n.label}
                </Link>
              );
            }
            return (
              <button key={n.id} onClick={() => navWithClose(n.id)} style={style}>
                {n.icon} {n.label}
              </button>
            );
          })}
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
            onClick={async () => {
              const schedule = await loadScheduleData();
              const blob = new Blob(
                [JSON.stringify({
                  ...data,
                  schedule: schedule ?? { workers: [], schedules: [], dayMemos: {} },
                  exportedAt: new Date().toISOString(),
                }, null, 2)],
                { type: "application/json" }
              );
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `genka-kanri-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
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
            {Icons.dl} データバックアップ（JSON）
          </button>
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
            ⚙️ 設定・バックアップ
          </Link>
          {isAdminEmail(userEmail ?? undefined) && (
            <Link
              href="/admin"
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
              🔐 アカウント管理
            </Link>
          )}
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
          padding: isMobile ? "56px 16px calc(24px + env(safe-area-inset-bottom, 0px)) 16px" : "28px 32px",
          maxWidth: "1100px",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {syncNotice && (
          <div
            style={{
              background: "#e3f2fd",
              border: "1px solid #90caf9",
              color: "#1565c0",
              padding: "10px 16px",
              borderRadius: "8px",
              fontSize: "13px",
              marginBottom: "16px",
            }}
          >
            {syncNotice}
          </div>
        )}
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
        {!loading && loadError && (
          <div
            style={{
              padding: "24px",
              background: "#7f1d1d",
              borderRadius: "12px",
              color: "#fecaca",
              fontSize: "14px",
              lineHeight: 1.6,
            }}
          >
            <strong>データの読み込みに失敗しました</strong>
            <p style={{ margin: "12px 0 0" }}>
              ネットワーク接続を確認し、ページを再読み込みしてください。
              データは上書きされていません。
            </p>
          </div>
        )}
        {saveError && (
          <div
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              padding: "16px 20px",
              background: "#7f1d1d",
              borderRadius: "12px",
              color: "#fecaca",
              fontSize: "14px",
              zIndex: 1000,
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <span>{saveError}</span>
            <button
              type="button"
              onClick={() => setSaveError(null)}
              style={{
                background: "none",
                border: "none",
                color: "#fecaca",
                cursor: "pointer",
                padding: 4,
                fontSize: 18,
              }}
            >
              ×
            </button>
          </div>
        )}
        {!loading && !loadError && view === "dashboard" && (
          <Dashboard
            projects={activeProjects}
            costs={data.costs}
            quantities={data.quantities}
            onNav={navWithClose}
            onNavToCashflowMonth={(yyyyMM) => {
              setExpectedPaymentMonthFilter(yyyyMM);
              setPersonInChargeFilter(null);
              navWithClose("list");
            }}
            onNavToPersonFilter={(name) => {
              setPersonInChargeFilter(name);
              setExpectedPaymentMonthFilter(null);
              navWithClose("list");
            }}
          />
        )}
        {!loading && !loadError && view === "list" && (
          <ProjectList
            projects={activeProjects}
            costs={data.costs}
            quantities={data.quantities}
            onSelect={(id) => navWithClose("detail", id)}
            onAdd={() => navWithClose("new")}
            sq={sq}
            setSq={setSq}
            sf={sf}
            setSf={setSf}
            expectedPaymentMonthFilter={expectedPaymentMonthFilter}
            onClearExpectedPaymentMonthFilter={() => setExpectedPaymentMonthFilter(null)}
            personInChargeFilter={personInChargeFilter}
            onClearPersonInChargeFilter={() => setPersonInChargeFilter(null)}
            isMobile={isMobile}
          />
        )}
        {!loading && !loadError && view === "archive" && (
          <ProjectList
            isMobile={isMobile}
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
        {!loading && !loadError && view === "deleted" && (
          <ProjectList
            isMobile={isMobile}
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
        {!loading && !loadError && view === "new" && (
          <NewProject onSave={addProject} onCancel={() => navWithClose("list")} />
        )}
        {!loading && !loadError && view === "equipment" && (
          <EquipmentRequestList
            equipmentRequests={data.equipmentRequests}
            onUpdate={(equipmentRequests) =>
              setData((d) => ({ ...d, equipmentRequests }))
            }
          />
        )}
        {!loading && !loadError && view === "bidschedule" && (
          <BidScheduleList
            bidSchedules={data.bidSchedules || []}
            onAdd={() => navWithClose("newbidschedule")}
            onUpdate={updateBidSchedule}
            onDelete={deleteBidSchedule}
            onAddToProjects={addBidScheduleToProjects}
          />
        )}
        {!loading && !loadError && view === "newbidschedule" && (
          <NewBidSchedule
            onSave={addBidSchedule}
            onCancel={() => navWithClose("bidschedule")}
          />
        )}
        {!loading && !loadError && view === "vehicles" && (
          <VehicleMaster
            vehicles={data.vehicles}
            onUpdate={updateVehicles}
          />
        )}
        {!loading && !loadError && view === "processmasters" && (
          <ProcessMaster
            processMasters={data.processMasters}
            onUpdate={updateProcessMasters}
          />
        )}
        {!loading && !loadError && view === "detail" && selProj && (
          <ProjectDetail
            project={selProj}
            costs={data.costs}
            quantities={data.quantities}
            vehicles={data.vehicles}
            processMasters={data.processMasters}
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
            onUpdateCost={updateCost}
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
