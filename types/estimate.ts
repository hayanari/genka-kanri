// ================================================================
// 見積書の型・計算・既定値
// ================================================================

export type EstimateStatus = "draft" | "confirmed" | "lost";

export type EstimateIssuer = {
  postalCode: string;
  address: string;
  companyName: string;
  representative: string;
  tel: string;
  fax: string;
};

export type EstimateItem = {
  id: string;
  section: string;
  kind: string;
  category: string;
  spec: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  note: string;
  sortOrder: number;
};

export type Estimate = {
  id: string;
  projectId: string;
  estimateNo: string;
  status: EstimateStatus;
  issueDate: string;
  clientName: string;
  workName: string;
  siteLocation: string;
  validPeriod: string;
  notes: string;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  issuer: EstimateIssuer;
  createdByEmail: string;
  createdByName: string;
  updatedByEmail: string;
  updatedByName: string;
  confirmedAt: string | null;
  confirmedByEmail: string;
  confirmedByName: string;
  lostAt: string | null;
  lostByEmail: string;
  lostByName: string;
  lostReason: string;
  createdAt: string;
  updatedAt: string;
  items: EstimateItem[];
};

export type EstimateEvent = {
  id: string;
  estimateId: string;
  action: string;
  actorEmail: string;
  actorName: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export const ESTIMATE_STATUS_LABEL: Record<EstimateStatus, string> = {
  draft: "下書き",
  confirmed: "確定",
  lost: "失注",
};

export const ESTIMATE_STATUS_COLOR: Record<EstimateStatus, { bg: string; fg: string }> = {
  draft: { bg: "#e2e8f0", fg: "#334155" },
  confirmed: { bg: "#bbf7d0", fg: "#166534" },
  lost: { bg: "#fecaca", fg: "#991b1b" },
};

export const ESTIMATE_EVENT_LABEL: Record<string, string> = {
  created: "作成",
  updated: "更新",
  confirmed: "確定",
  lost: "失注",
  reopen: "下書きに戻す",
  pdf: "PDF出力",
  emailed: "メール送信",
};

/** トキト既定の発行元（会社ごとに編集可・見積ごとにスナップショット保存） */
export const DEFAULT_ESTIMATE_ISSUER: EstimateIssuer = {
  postalCode: "〒599-8238",
  address: "大阪府堺市中区土師町4丁5番17号",
  companyName: "株式会社 トキト",
  representative: "代表取締役　時任 隼成",
  tel: "TEL（072）270-6462 (代)",
  fax: "FAX (072) 270-6464",
};

export const DEFAULT_ESTIMATE_NOTES =
  "事前調査は含まれていません。\n事前処理は別途とします。";

export function emptyEstimateItem(sortOrder = 0): EstimateItem {
  return {
    id: "",
    section: "",
    kind: "",
    category: "",
    spec: "",
    quantity: 0,
    unit: "",
    unitPrice: 0,
    amount: 0,
    note: "",
    sortOrder,
  };
}

export function calcItemAmount(quantity: number, unitPrice: number): number {
  const q = Number(quantity) || 0;
  const u = Number(unitPrice) || 0;
  return Math.round(q * u);
}

export function calcEstimateTotals(
  items: Pick<EstimateItem, "amount">[],
  taxRate = 10
): { subtotal: number; taxAmount: number; totalAmount: number } {
  const subtotal = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const taxAmount = Math.round(subtotal * (Number(taxRate) || 0) / 100);
  return { subtotal, taxAmount, totalAmount: subtotal + taxAmount };
}

export function formatYen(n: number): string {
  return `¥${Math.round(n || 0).toLocaleString("ja-JP")}`;
}

/** 和暦っぽい表示用（令和年・月・日）— PDF表紙向け */
export function formatWarekiDate(isoDate: string): string {
  if (!isoDate) return "令和　　年　　月　　日";
  const d = new Date(isoDate + "T12:00:00");
  if (Number.isNaN(d.getTime())) return isoDate;
  const reiwa = d.getFullYear() - 2018;
  return `令和　${reiwa}年　${d.getMonth() + 1}月　${d.getDate()}日`;
}
