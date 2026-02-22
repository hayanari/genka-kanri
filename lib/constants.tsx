export const genId = () => Math.random().toString(36).slice(2, 10);
export const fmt = (n: number | undefined) =>
  new Intl.NumberFormat("ja-JP").format(Math.round(n || 0));
export const fmtDate = (d: string | undefined) =>
  d ? new Date(d).toLocaleDateString("ja-JP") : "—";
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
export const div = (a: number, b: number) => (b ? Math.round(a / b) : 0);

export const BID_SCHEDULE_STATUS: Record<
  string,
  { label: string; color: string; bg?: string }
> = {
  scheduled: { label: "入札予定", color: "#94a3b8", bg: "#f1f5f9" },
  won: { label: "落札", color: "#10b981", bg: "#ecfdf5" },
  lost: { label: "失札", color: "#ef4444", bg: "#fef2f2" },
  expected: { label: "当社受注見込み", color: "#3b82f6", bg: "#eff6ff" },
};

export const STATUS_MAP: Record<
  string,
  { label: string; color: string; bg?: string }
> = {
  estimate: { label: "見積中", color: "#94a3b8", bg: "#f1f5f9" },
  ordered: { label: "受注済", color: "#3b82f6", bg: "#eff6ff" },
  in_progress: { label: "施工中", color: "#f59e0b", bg: "#fffbeb" },
  completed: { label: "完了", color: "#10b981", bg: "#ecfdf5" },
  billed: { label: "請求済", color: "#8b5cf6", bg: "#f5f3ff" },
  paid: { label: "入金済", color: "#059669", bg: "#d1fae5" },
};

export const COST_CATEGORIES: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  material: { label: "材料費", icon: "🧱", color: "#ef4444" },
  outsource: { label: "外注費", icon: "🏗️", color: "#f59e0b" },
  equipment: { label: "機材費", icon: "⚙️", color: "#06b6d4" },
  other: { label: "その他経費", icon: "📦", color: "#6b7280" },
};

export const QUANTITY_CATEGORIES: Record<
  string,
  { label: string; unit: string; icon: string; color: string }
> = {
  labor: { label: "人工", unit: "人日", icon: "👷", color: "#3b82f6" },
  vehicle: { label: "車両", unit: "台日", icon: "🚛", color: "#8b5cf6" },
};

export const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  unpaid: { label: "未入金", color: "#ef4444" },
  partial: { label: "一部入金", color: "#f59e0b" },
  full: { label: "入金済", color: "#10b981" },
};

export const CHANGE_TYPES: Record<
  string,
  { label: string; color: string; sign: string }
> = {
  increase: { label: "増額", color: "#10b981", sign: "+" },
  decrease: { label: "減額", color: "#ef4444", sign: "−" },
};

export const T = {
  bg: "#0c0e14",
  s: "#161923",
  s2: "#1e2231",
  bd: "#282d3e",
  tx: "#e4e7ef",
  ts: "#7c84a0",
  ac: "#4f8cff",
  al: "#4f8cff20",
  dg: "#ef4444",
  ok: "#10b981",
  wn: "#f59e0b",
};

export const Icons = {
  dash: (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  list: (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  plus: (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  back: (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  close: (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  edit: (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  trash: (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  dl: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  search: (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  archive: (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M21 8v13H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </svg>
  ),
  unarchive: (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M3 8v13h18V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </svg>
  ),
  restore: (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6 6-6" />
    </svg>
  ),
  menu: (
    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  truck: (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  calendar: (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
};
