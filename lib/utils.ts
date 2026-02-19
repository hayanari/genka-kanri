import { fmt, pct, div } from "./constants";
import { STATUS_MAP } from "./constants";

export interface Project {
  id: string;
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

export interface Quantity {
  id: string;
  projectId: string;
  category: string;
  description: string;
  quantity: number;
  date: string;
  note: string;
}

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
    const subAmt =
      p.subcontractAmount ||
      Math.round(effectiveContract * (1 - (p.marginRate || 0) / 100));
    const profit = effectiveContract - subAmt;
    const profitRate = pct(profit, effectiveContract);
    return {
      totalCost: subAmt,
      laborDays: 0,
      vehicleDays: 0,
      profit,
      profitRate,
      revenuePerLabor: 0,
      profitPerLabor: 0,
      budgetUsed: 100,
      costs: [],
      quantities: [],
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

export const createSampleData = () => ({
  projects: [
    {
      id: "p1",
      name: "○○邸 新築工事",
      client: "山田太郎",
      category: "工事",
      contractAmount: 15000000,
      originalAmount: 15000000,
      budget: 10500000,
      status: "in_progress",
      startDate: "2025-01-15",
      endDate: "2025-06-30",
      progress: 45,
      billedAmount: 7500000,
      paidAmount: 5000000,
      notes: "木造2階建て",
      mode: "normal" as const,
      marginRate: 0,
      subcontractAmount: 0,
      subcontractVendor: "",
      payments: [
        { id: "pay1", date: "2025-02-01", amount: 5000000, note: "着手金" },
      ],
      changes: [
        {
          id: "ch1",
          date: "2025-03-10",
          type: "increase",
          amount: 500000,
          description: "追加工事：ウッドデッキ設置",
        },
      ],
    },
    {
      id: "p2",
      name: "△△ビル 外壁改修",
      client: "株式会社ABC",
      category: "工事",
      contractAmount: 8500000,
      originalAmount: 8500000,
      budget: 5950000,
      status: "ordered",
      startDate: "2025-03-01",
      endDate: "2025-05-15",
      progress: 10,
      billedAmount: 0,
      paidAmount: 0,
      notes: "外壁塗装・防水工事",
      mode: "subcontract" as const,
      marginRate: 12,
      subcontractAmount: 7480000,
      subcontractVendor: "○○塗装工業",
      payments: [],
      changes: [],
    },
    {
      id: "p3",
      name: "□□マンション 設計業務",
      client: "株式会社XYZ",
      category: "業務",
      contractAmount: 3200000,
      originalAmount: 3500000,
      budget: 2240000,
      status: "completed",
      startDate: "2024-10-01",
      endDate: "2025-01-31",
      progress: 100,
      billedAmount: 3200000,
      paidAmount: 3200000,
      notes: "設計監理業務",
      mode: "normal" as const,
      marginRate: 0,
      subcontractAmount: 0,
      subcontractVendor: "",
      payments: [
        { id: "pay2", date: "2024-11-01", amount: 1600000, note: "中間金" },
        { id: "pay3", date: "2025-02-15", amount: 1600000, note: "完了金" },
      ],
      changes: [
        {
          id: "ch2",
          date: "2024-12-15",
          type: "decrease",
          amount: 300000,
          description: "設計範囲縮小",
        },
      ],
    },
  ],
  costs: [
    {
      id: "c1",
      projectId: "p1",
      category: "material",
      description: "木材一式",
      amount: 1200000,
      date: "2025-02-10",
      vendor: "○○木材店",
    },
    {
      id: "c2",
      projectId: "p1",
      category: "material",
      description: "金物類",
      amount: 350000,
      date: "2025-02-15",
      vendor: "△△金物",
    },
    {
      id: "c3",
      projectId: "p1",
      category: "outsource",
      description: "基礎工事",
      amount: 1800000,
      date: "2025-01-20",
      vendor: "□□建設",
    },
    {
      id: "c4",
      projectId: "p1",
      category: "equipment",
      description: "足場リース",
      amount: 280000,
      date: "2025-02-05",
      vendor: "○○リース",
    },
    {
      id: "c5",
      projectId: "p3",
      category: "other",
      description: "印刷費・交通費",
      amount: 85000,
      date: "2025-01-20",
      vendor: "各種",
    },
  ],
  quantities: [
    {
      id: "q1",
      projectId: "p1",
      category: "labor",
      description: "大工",
      quantity: 50,
      date: "2025-03-01",
      note: "5人×10日",
    },
    {
      id: "q2",
      projectId: "p1",
      category: "labor",
      description: "手元",
      quantity: 20,
      date: "2025-03-01",
      note: "2人×10日",
    },
    {
      id: "q3",
      projectId: "p1",
      category: "vehicle",
      description: "2tトラック",
      quantity: 12,
      date: "2025-02-20",
      note: "",
    },
    {
      id: "q4",
      projectId: "p1",
      category: "vehicle",
      description: "ユニック車",
      quantity: 3,
      date: "2025-02-25",
      note: "",
    },
    {
      id: "q5",
      projectId: "p3",
      category: "labor",
      description: "設計担当",
      quantity: 60,
      date: "2025-01-15",
      note: "2人×30日",
    },
  ],
});

export const exportCSV = (
  projects: Project[],
  costs: Cost[],
  quantities: Quantity[]
) => {
  let csv =
    "案件名,顧客,区分,施工形態,当初契約額,増減後受注額,実行予算,原価合計,粗利,利益率,マージン率,人工(人日),車両(台日),売上/人工,粗利/人工,進捗,ステータス\n";
  projects.forEach((p) => {
    const st = projStats(p, costs, quantities);
    csv += `"${p.name}","${p.client}","${p.category}","${p.mode === "subcontract" ? "一括外注" : "自社施工"}",${p.originalAmount},${st.effectiveContract},${p.budget},${st.totalCost},${st.profit},${st.profitRate}%,${p.mode === "subcontract" ? p.marginRate + "%" : "—"},${st.laborDays},${st.vehicleDays},${st.laborDays ? st.revenuePerLabor : "—"},${st.laborDays ? st.profitPerLabor : "—"},${p.progress}%,${STATUS_MAP[p.status]?.label}\n`;
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
