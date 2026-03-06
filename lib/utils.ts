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
  /** 請求書送付日 */
  invoiceSentDate?: string;
  /** 入金予定日 */
  expectedPaymentDate?: string;
  /** 入金確認日 */
  paymentConfirmedDate?: string;
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
  /** 工程管理（工程→区間→作業項目） */
  projectProcesses?: ProjectProcess[];
  /** 最終更新日時（ソート用） */
  updatedAt?: string;
  /** 担当者 */
  personInCharge?: string;
}

export interface ProjectProcess {
  id: string;
  processMasterId: string;
  status: "pending" | "active" | "done" | "hold";
  sortOrder: number;
  sections: ProjectSection[];
}

export interface ProjectSection {
  id: string;
  name: string;
  sortOrder: number;
  subtasks: ProjectSubtask[];
}

export interface ProjectSubtask {
  id: string;
  name: string;
  done: boolean;
  sortOrder: number;
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

/** 工程マスタ（設計書の工種に対応） */
export interface ProcessMaster {
  id: string;
  name: string;
  icon: string;
  defaultSubs: string[]; // デフォルト作業項目
  sortOrder?: number;
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

export const DEFAULT_PROCESS_MASTERS: ProcessMaster[] = [
  { id: "pm01", name: "管きょ洗浄工", icon: "🚿", defaultSubs: ["高圧洗浄", "汚泥回収", "完了確認"], sortOrder: 1 },
  { id: "pm02", name: "管路施設調査工（TVカメラ）", icon: "📹", defaultSubs: ["機器設置", "カメラ挿入・撮影", "側視", "記録整理"], sortOrder: 2 },
  { id: "pm03", name: "施工前処理工", icon: "🔧", defaultSubs: ["取付管突出処理", "モルタル除去", "木根除去"], sortOrder: 3 },
  { id: "pm04", name: "管きょ更生工", icon: "🏗️", defaultSubs: ["更生材料", "反転・形成", "仕上（管口切断・仕上）", "仮設備（設置・撤去）"], sortOrder: 4 },
  { id: "pm05", name: "換気工", icon: "💨", defaultSubs: ["換気設備設置", "運転", "撤去"], sortOrder: 5 },
  { id: "pm06", name: "水替工", icon: "💧", defaultSubs: ["ポンプ設置", "止水プラグ設置", "排水運転", "撤去"], sortOrder: 6 },
  { id: "pm07", name: "交通管理工", icon: "🚦", defaultSubs: ["交通規制設置", "誘導警備員配置", "規制撤去"], sortOrder: 7 },
  { id: "pm08", name: "検査・是正", icon: "✅", defaultSubs: ["自主検査", "発注者検査", "是正対応", "完了確認"], sortOrder: 8 },
  { id: "pm09", name: "引渡し", icon: "🤝", defaultSubs: ["書類整備", "引渡"], sortOrder: 9 },
  { id: "pm10", name: "路面清掃工", icon: "🧹", defaultSubs: ["路肩清掃（人力）", "完了確認"], sortOrder: 10 },
  { id: "pm11", name: "側溝清掃工（人力）", icon: "🪣", defaultSubs: ["蓋開け", "清掃", "蓋閉め", "完了確認"], sortOrder: 11 },
  { id: "pm12", name: "側溝清掃工（機械）", icon: "🚛", defaultSubs: ["機械搬入", "高圧洗浄", "汚泥吸引", "搬出", "完了確認"], sortOrder: 12 },
  { id: "pm13", name: "管渠清掃工", icon: "🔄", defaultSubs: ["高圧洗浄車作業", "汚泥吸引", "完了確認"], sortOrder: 13 },
  { id: "pm14", name: "桝清掃工", icon: "⬛", defaultSubs: ["蓋開け", "清掃・土砂除去", "蓋閉め", "完了確認"], sortOrder: 14 },
  { id: "pm15", name: "ポンプ室清掃工", icon: "⚙️", defaultSubs: ["高圧洗浄", "汚泥吸引", "清掃完了確認"], sortOrder: 15 },
  { id: "pm16", name: "応急処理作業工", icon: "🚨", defaultSubs: ["緊急調査", "緊急排水施設清掃"], sortOrder: 16 },
  { id: "pm17", name: "残土処理工", icon: "🚚", defaultSubs: ["土砂積込", "運搬", "処分"], sortOrder: 17 },
  { id: "pm18", name: "本管潜行目視調査工", icon: "👷", defaultSubs: ["入坑準備", "潜行調査", "記録", "退坑・片付"], sortOrder: 18 },
  { id: "pm19", name: "マンホール目視調査工", icon: "🔍", defaultSubs: ["蓋開け", "目視調査・記録", "蓋閉め"], sortOrder: 19 },
  { id: "pm20", name: "本管TVカメラ調査工", icon: "📹", defaultSubs: ["機器設置", "カメラ挿入", "撮影・側視", "記録整理"], sortOrder: 20 },
  { id: "pm21", name: "管きょ内洗浄工", icon: "🚿", defaultSubs: ["高圧洗浄車作業", "汚泥回収", "完了確認"], sortOrder: 21 },
  { id: "pm22", name: "報告書作成工", icon: "📋", defaultSubs: ["データ整理", "報告書作成", "チェック・校正", "提出"], sortOrder: 22 },
  { id: "pm23", name: "安全費", icon: "🦺", defaultSubs: ["換気設備", "監視人配置"], sortOrder: 23 },
  { id: "pm24", name: "設計業務", icon: "📐", defaultSubs: ["管路実施設計", "耐震設計", "報告書作成", "設計協議"], sortOrder: 24 },
  { id: "pm25", name: "管きょ工(開削)", icon: "⛏️", defaultSubs: ["管路掘削", "管路埋戻", "発生土処理", "管布設", "撤去"], sortOrder: 25 },
  { id: "pm26", name: "ﾏﾝﾎｰﾙ工", icon: "🕳️", defaultSubs: ["組立ﾏﾝﾎｰﾙ", "既設接続", "内副管"], sortOrder: 26 },
  { id: "pm27", name: "取付管およびます工", icon: "🔌", defaultSubs: ["管路掘削", "管路埋戻", "発生土処理", "取付管布設"], sortOrder: 27 },
  { id: "pm28", name: "附帯工", icon: "🛣️", defaultSubs: ["舗装版切断", "舗装版破砕", "路盤", "舗装"], sortOrder: 28 },
  { id: "pm29", name: "管きょ更生水替工", icon: "💧", defaultSubs: ["反転・形成用水替"], sortOrder: 29 },
  { id: "pm30", name: "共通仮設費", icon: "📦", defaultSubs: ["運搬費", "準備費", "安全費", "技術管理費"], sortOrder: 30 },
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
  personInCharge: "",
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
  processMasters: [...DEFAULT_PROCESS_MASTERS],
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
  const fmtDate = (d: string) =>
    d ? new Date(d).toLocaleDateString("ja-JP") : "—";
  let csv =
    "管理番号,案件名,顧客,担当者,区分,施工形態,工期開始,工期終了,当初契約額,増減後受注額,実行予算,原価合計,粗利,利益率,マージン率,人工(人日),車両(台日),売上/人工,粗利/人工,進捗,ステータス,請求書送付日,入金予定日,入金確認日,アーカイブ年度,削除日\n";
  projects.forEach((p) => {
    const st = projStats(p, costs, quantities);
    const deletedAt = p.deletedAt ? fmtDate(p.deletedAt) : "—";
    const invSent = p.invoiceSentDate ? fmtDate(p.invoiceSentDate) : "—";
    const expPay = p.expectedPaymentDate ? fmtDate(p.expectedPaymentDate) : "—";
    const payConf = p.paymentConfirmedDate ? fmtDate(p.paymentConfirmedDate) : "—";
    csv += `"${p.managementNumber ?? ""}","${p.name}","${p.client}","${p.personInCharge ?? ""}","${p.category}","${p.mode === "subcontract" ? "一括外注" : "自社施工"}","${fmtDate(p.startDate)}","${fmtDate(p.endDate)}",${p.originalAmount},${st.effectiveContract},${p.budget},${st.totalCost},${st.profit},${st.profitRate}%,${p.mode === "subcontract" ? p.marginRate + "%" : "—"},${st.laborDays},${st.vehicleDays},${st.laborDays ? st.revenuePerLabor : "—"},${st.laborDays ? st.profitPerLabor : "—"},${p.progress}%,${STATUS_MAP[p.status]?.label},${invSent},${expPay},${payConf},${p.archiveYear || "—"},${deletedAt}\n`;
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
