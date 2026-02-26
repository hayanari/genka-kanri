import { fmt, pct, div, genId } from "./constants";
import { STATUS_MAP } from "./constants";

export interface Project {
  id: string;
  /** 管理番号（工事: K-0001, 業務: G-0001） */
  managementNumber?: string;
  name: string;
  client: string;
  category: string;
  contractAmount: number;
  originalAmount: number;
  budget: number;
  status: string;
  startDate: string;
  endDate: string;
  progress: number;
  billedAmount: number;
  paidAmount: number;
  notes?: string;
  mode: "normal" | "subcontract";
  marginRate: number;
  subcontractAmount: number;
  subcontractVendor: string;
  payments: { id: string; date: string; amount: number; note: string }[];
  changes: {
    id: string;
    date: string;
    type: string;
    amount: number;
    description: string;
  }[];
  archived?: boolean;
  archiveYear?: string;
  deleted?: boolean;
  deletedAt?: string;
}

export interface Cost {
  id: string;
  projectId: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  vendor: string;
}

export interface BidSchedule {
  id: string;
  name: string;
  client: string;
  category: "工事" | "業務";
  /** @deprecated セキュリティのため削除、後方互換用 */
  estimatedAmount?: number;
  bidDate: string;
  status: "scheduled" | "won" | "lost" | "expected";
  notes?: string;
  projectId?: string; // 案件一覧に追加済みの場合の案件ID
  /** 落札時: 落札金額 / 当社受注見込み時: 受注金額概算 */
  orderAmount?: number;
  /** 単価契約の場合は0円でも登録可 */
  isUnitPriceContract?: boolean;
}

export interface Vehicle {
  id: string;
  registration: string; // ナンバープレート表示（例: 堺 800 さ 1299）
}

export interface Quantity {
  id: string;
  projectId: string;
  category: string;
  description: string;
  quantity: number;
  date: string;
  note: string;
  vehicleId?: string; // 車両区分時はマスタIDを格納
}

export const DEFAULT_VEHICLES: Vehicle[] = [
  { id: "v1", registration: "堺 800 さ 1299" },
  { id: "v2", registration: "堺 800 さ 3119" },
  { id: "v3", registration: "堺 800 さ 4840" },
  { id: "v4", registration: "堺 800 は 61" },
  { id: "v5", registration: "堺 800 さ 3118" },
  { id: "v6", registration: "堺 800 さ 4750" },
  { id: "v7", registration: "堺 800 さ 4674" },
  { id: "v8", registration: "堺 800 は 279" },
  { id: "v9", registration: "堺 800 は 366" },
  { id: "v10", registration: "堺 130 さ 3526" },
  { id: "v11", registration: "堺 800 さ 2723" },
  { id: "v12", registration: "和泉 800 さ 1894" },
  { id: "v13", registration: "堺 800 さ 958" },
  { id: "v14", registration: "堺 830 せ 1717" },
  { id: "v15", registration: "堺 830 さ 2626" },
  { id: "v16", registration: "堺 800 さ 2016" },
  { id: "v17", registration: "堺 430 せ 3517" },
  { id: "v18", registration: "堺 800 さ 5035" },
  { id: "v19", registration: "堺 330 ね 2617" },
  { id: "v20", registration: "堺 330 ま 1726" },
  { id: "v21", registration: "堺 530 て 1735" },
  { id: "v22", registration: "堺 332 や 316" },
  { id: "v23", registration: "堺 334 ま 116" },
  { id: "v24", registration: "堺 342 ろ 13" },
  { id: "v25", registration: "大阪 800 そ 6712" },
  { id: "v26", registration: "大阪 800 そ 6711" },
  { id: "v27", registration: "大阪 800 そ 6719" },
  { id: "v28", registration: "和泉 830 な 1188" },
  { id: "v29", registration: "大阪 400 む 9052" },
  { id: "v30", registration: "大阪 800 そ 7329" },
  { id: "v31", registration: "大阪 800 は 2214" },
];

export interface ProjectStats {
  totalCost: number;
  laborDays: number;
  vehicleDays: number;
  profit: number;
  profitRate: number;
  revenuePerLabor: number;
  profitPerLabor: number;
  budgetUsed: number;
  costs: Cost[];
  quantities: Quantity[];
  effectiveContract: number;
  subcontractAmount?: number;
}

export const getEffectiveContract = (p: Project): number => {
  const changeTotal = (p.changes || []).reduce(
    (s, c) => s + (c.type === "increase" ? c.amount : -c.amount),
    0
  );
  return p.originalAmount + changeTotal;
};

export const projStats = (
  p: Project,
  costs: Cost[],
  quantities: Quantity[]
): ProjectStats => {
  const effectiveContract = getEffectiveContract(p);
  if (p.mode === "subcontract") {
    // マージン率が設定されている場合は増減後受注額に対して常に適用
    const subAmt =
      p.marginRate != null && p.marginRate > 0
        ? Math.round(effectiveContract * (1 - p.marginRate / 100))
        : (p.subcontractAmount || 0);
    const pc = costs.filter((c) => c.projectId === p.id);
    const pq = quantities.filter((q) => q.projectId === p.id);
    const directCost = pc.reduce((s, c) => s + c.amount, 0);
    const totalCost = subAmt + directCost; // 外注費 + 打合せ等の実費
    const laborDays = pq
      .filter((q) => q.category === "labor")
      .reduce((s, q) => s + q.quantity, 0);
    const vehicleDays = pq
      .filter((q) => q.category === "vehicle")
      .reduce((s, q) => s + q.quantity, 0);
    const profit = effectiveContract - totalCost;
    const profitRate = pct(profit, effectiveContract);
    return {
      totalCost,
      laborDays,
      vehicleDays,
      profit,
      profitRate,
      revenuePerLabor: div(effectiveContract, laborDays),
      profitPerLabor: div(profit, laborDays),
      budgetUsed: 100,
      costs: pc,
      quantities: pq,
      effectiveContract,
      subcontractAmount: subAmt,
    };
  }
  const pc = costs.filter((c) => c.projectId === p.id);
  const pq = quantities.filter((q) => q.projectId === p.id);
  const totalCost = pc.reduce((s, c) => s + c.amount, 0);
  const laborDays = pq
    .filter((q) => q.category === "labor")
    .reduce((s, q) => s + q.quantity, 0);
  const vehicleDays = pq
    .filter((q) => q.category === "vehicle")
    .reduce((s, q) => s + q.quantity, 0);
  const profit = effectiveContract - totalCost;
  const profitRate = pct(profit, effectiveContract);
  const revenuePerLabor = div(effectiveContract, laborDays);
  const profitPerLabor = div(profit, laborDays);
  const budgetUsed = pct(totalCost, p.budget);
  return {
    totalCost,
    laborDays,
    vehicleDays,
    profit,
    profitRate,
    revenuePerLabor,
    profitPerLabor,
    budgetUsed,
    costs: pc,
    quantities: pq,
    effectiveContract,
  };
};

const REGISTERED_PROJECTS: Omit<Project, "id">[] = [
  {
    name: "府道堺狭山線ほか路面清掃業務",
    client: "堺市等",
    category: "業務",
    contractAmount: 12840000,
    originalAmount: 12840000,
    budget: 11556000,
    status: "ordered",
    startDate: "2025-04-01",
    endDate: "2026-03-31",
    progress: 0,
    billedAmount: 0,
    paidAmount: 0,
    notes: "トキト落札。契約工期開始日未定。工期末2026年3月末。担当者未定。",
    mode: "normal",
    marginRate: 0,
    subcontractAmount: 0,
    subcontractVendor: "",
    payments: [],
    changes: [],
    archived: false,
    deleted: false,
  },
  {
    name: "路面清掃業務（中及び南区）（市道）",
    client: "堺市等",
    category: "業務",
    contractAmount: 13964000,
    originalAmount: 13964000,
    budget: 12567600,
    status: "ordered",
    startDate: "2025-04-01",
    endDate: "2026-03-31",
    progress: 0,
    billedAmount: 0,
    paidAmount: 0,
    notes: "トキト落札。契約工期開始日未定。工期末2026年3月末。担当者未定。",
    mode: "normal",
    marginRate: 0,
    subcontractAmount: 0,
    subcontractVendor: "",
    payments: [],
    changes: [],
    archived: false,
    deleted: false,
  },
  {
    name: "道路排水施設等清掃業務（堺及び西区）単価契約",
    client: "堺市等",
    category: "業務",
    contractAmount: 6360000,
    originalAmount: 6360000,
    budget: 5724000,
    status: "ordered",
    startDate: "2025-04-01",
    endDate: "2026-03-31",
    progress: 0,
    billedAmount: 0,
    paidAmount: 0,
    notes: "トキト落札（単契）。契約工期開始日未定。工期末2026年3月末。担当者未定。",
    mode: "normal",
    marginRate: 0,
    subcontractAmount: 0,
    subcontractVendor: "",
    payments: [],
    changes: [],
    archived: false,
    deleted: false,
  },
  {
    name: "道路排水施設等清掃業務（中及び南区）単価契約",
    client: "メット（元請）",
    category: "業務",
    contractAmount: 6331000,
    originalAmount: 6331000,
    budget: 5697900,
    status: "ordered",
    startDate: "2025-04-01",
    endDate: "2026-03-31",
    progress: 0,
    billedAmount: 0,
    paidAmount: 0,
    notes: "メット落札（単契）。グループ元請。契約工期開始日未定。工期末2026年3月末。担当者未定。",
    mode: "normal",
    marginRate: 0,
    subcontractAmount: 0,
    subcontractVendor: "",
    payments: [],
    changes: [],
    archived: false,
    deleted: false,
  },
];

/** 区分に応じた管理番号プレフィックス（工事: K, 業務: G） */
const PREFIX: Record<string, string> = { 工事: "K", 業務: "G" };

/** 次の管理番号を採番（例: K-0001, G-0002） */
export function getNextManagementNumber(
  projects: Project[],
  category: string
): string {
  const prefix = PREFIX[category] ?? "X";
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const p of projects) {
    const m = p.managementNumber?.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

/** 管理番号がない案件にバックフィルで付与 */
export function ensureManagementNumbers(projects: Project[]): Project[] {
  const maxByPrefix: Record<string, number> = {};
  for (const p of projects) {
    if (!p.managementNumber) continue;
    const m = p.managementNumber.match(/^([KGX])-(\d+)$/);
    if (m) maxByPrefix[m[1]] = Math.max(maxByPrefix[m[1]] ?? 0, parseInt(m[2], 10));
  }
  return projects.map((p) => {
    if (p.managementNumber) return p;
    const prefix = PREFIX[p.category] ?? "X";
    const n = (maxByPrefix[prefix] ?? 0) + 1;
    maxByPrefix[prefix] = n;
    return { ...p, managementNumber: `${prefix}-${String(n).padStart(4, "0")}` };
  });
}

/** 入札スケジュールから案件を作成（落札・当社受注見込み時のみ） */
export const bidScheduleToProject = (b: BidSchedule, id: string): Project => {
  const amount = b.orderAmount ?? 0;
  return {
  id,
  name: b.name,
  client: b.client,
  category: b.category,
  contractAmount: amount,
  originalAmount: amount,
  budget: amount > 0 ? Math.round(amount * 0.9) : 0,
  status: "ordered",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  progress: 0,
  billedAmount: 0,
  paidAmount: 0,
  notes: b.notes || `入札スケジュール（${b.bidDate}）より登録`,
  mode: "normal",
  marginRate: 0,
  subcontractAmount: 0,
  subcontractVendor: "",
  payments: [],
  changes: [],
  };
};

export const ensureRegisteredProjects = (projects: Project[]): Project[] => {
  const names = new Set(projects.map((p) => p.name));
  const toAdd = REGISTERED_PROJECTS.filter((r) => !names.has(r.name));
  if (toAdd.length === 0) return projects;
  const added = toAdd.map((r) => ({ ...r, id: genId() } as Project));
  return ensureManagementNumbers([...projects, ...added]);
};

export const createEmptyData = () => ({
  vehicles: [...DEFAULT_VEHICLES],
  projects: ensureManagementNumbers(
    REGISTERED_PROJECTS.map((r, i) => ({ ...r, id: `p${i + 1}` } as Project))
  ),
  costs: [] as Cost[],
  quantities: [] as Quantity[],
  bidSchedules: [] as BidSchedule[],
});

export const exportCSV = (
  projects: Project[],
  costs: Cost[],
  quantities: Quantity[]
) => {
  let csv =
    "管理番号,案件名,顧客,区分,施工形態,当初契約額,増減後受注額,実行予算,原価合計,粗利,利益率,マージン率,人工(人日),車両(台日),売上/人工,粗利/人工,進捗,ステータス,アーカイブ年度,削除日\n";
  projects.forEach((p) => {
    const st = projStats(p, costs, quantities);
    const deletedAt = p.deletedAt
      ? new Date(p.deletedAt).toLocaleDateString("ja-JP")
      : "—";
    csv += `"${p.managementNumber ?? ""}","${p.name}","${p.client}","${p.category}","${p.mode === "subcontract" ? "一括外注" : "自社施工"}",${p.originalAmount},${st.effectiveContract},${p.budget},${st.totalCost},${st.profit},${st.profitRate}%,${p.mode === "subcontract" ? p.marginRate + "%" : "—"},${st.laborDays},${st.vehicleDays},${st.laborDays ? st.revenuePerLabor : "—"},${st.laborDays ? st.profitPerLabor : "—"},${p.progress}%,${STATUS_MAP[p.status]?.label},${p.archiveYear || "—"},${deletedAt}\n`;
  });
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "案件一覧.csv";
  a.click();
  URL.revokeObjectURL(url);
};
