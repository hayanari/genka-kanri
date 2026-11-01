import { genId } from "./constants";
import type { DocFlowItem, DocFlowStatus } from "./utils";

export type ContractRole = "prime" | "sub";

export const CONTRACT_ROLES: Record<ContractRole, { label: string; desc: string; color: string }> = {
  prime: { label: "元請", desc: "自治体から直接受注", color: "#2563eb" },
  sub: { label: "下請", desc: "元請会社から受注", color: "#059669" },
};

/** 段階4（契約）を確定点とする */
export const CONTRACT_STAGE = 4;

export const DOC_FLOW_STAGES: Record<ContractRole, string[]> = {
  prime: ["事前資格", "公示・参加", "入札", "契約", "着手〜請求"],
  sub: ["取引開始", "引合", "見積", "契約", "着手〜請求"],
};

export const DOC_FLOW_STATUS: Record<DocFlowStatus, { label: string; color: string; bg?: string }> = {
  todo: { label: "未着手", color: "#94a3b8", bg: "#f1f5f9" },
  drafting: { label: "作成中", color: "#d97706", bg: "#fffbeb" },
  submitted: { label: "提出済", color: "#3b82f6", bg: "#eff6ff" },
  accepted: { label: "受理", color: "#059669", bg: "#ecfdf5" },
  returned: { label: "差戻し", color: "#dc2626", bg: "#fef2f2" },
};

type TemplateItem = { stage: number; name: string; required?: boolean; submitTo?: string };

/**
 * 初期テンプレート。書類名は社内の工事フォルダ（Teams 工事チャンネル・入札情報）で
 * 実際に使っている書類名に合わせている。発注者・元請ごとの差は案件ごとに追加・削除する。
 */
const TEMPLATES: Record<ContractRole, TemplateItem[]> = {
  prime: [
    { stage: 1, name: "入札参加資格審査申請書（指名願）", submitTo: "発注者" },
    { stage: 1, name: "委任状・使用印鑑届", required: false, submitTo: "発注者" },
    { stage: 1, name: "納税証明書", submitTo: "発注者" },
    { stage: 1, name: "経審結果通知書", submitTo: "発注者" },
    { stage: 2, name: "入札参加申込書（電子入札参加申請書）", submitTo: "発注者" },
    { stage: 2, name: "配置予定技術者・施工実績資料", submitTo: "発注者" },
    { stage: 2, name: "質疑書", required: false, submitTo: "発注者" },
    { stage: 3, name: "入札書", submitTo: "発注者" },
    { stage: 3, name: "工事費内訳書", submitTo: "発注者" },
    { stage: 4, name: "契約書（電子契約）", submitTo: "発注者" },
    { stage: 4, name: "契約保証（保証証書・契約保証金免除申請書）", submitTo: "発注者" },
    { stage: 4, name: "現場代理人等通知書（経歴書）", submitTo: "発注者" },
    { stage: 5, name: "着工届（着手届）", submitTo: "発注者" },
    { stage: 5, name: "工程表", submitTo: "発注者" },
    { stage: 5, name: "コリンズ登録内容確認書", required: false, submitTo: "発注者" },
    { stage: 5, name: "施工計画書", submitTo: "発注者" },
    { stage: 5, name: "下請負人通知書", required: false, submitTo: "発注者" },
    { stage: 5, name: "施工体制台帳・再下請負通知書", required: false, submitTo: "発注者" },
    { stage: 5, name: "下請負人等誓約書届", required: false, submitTo: "発注者" },
    { stage: 5, name: "建退共掛金収納書届", submitTo: "発注者" },
    { stage: 5, name: "主要資材発注先名簿", required: false, submitTo: "発注者" },
    { stage: 5, name: "工事完成届（完了届）", submitTo: "発注者" },
    { stage: 5, name: "請求書", submitTo: "発注者" },
  ],
  sub: [
    { stage: 1, name: "会社概要", submitTo: "元請" },
    { stage: 1, name: "建設業許可証の写し", submitTo: "元請" },
    { stage: 1, name: "暴排誓約書", submitTo: "元請" },
    { stage: 1, name: "インボイス登録番号・振込先口座の通知", submitTo: "元請" },
    { stage: 2, name: "見積依頼・施工条件書の受領", submitTo: "—" },
    { stage: 2, name: "現地確認", required: false, submitTo: "—" },
    { stage: 3, name: "見積書", submitTo: "元請" },
    { stage: 3, name: "条件確認（工期・支払条件）", submitTo: "元請" },
    { stage: 4, name: "注文書の受領", submitTo: "—" },
    { stage: 4, name: "注文請書（注文書・請書・控・約款）", submitTo: "元請" },
    { stage: 5, name: "再下請負通知書", submitTo: "元請" },
    { stage: 5, name: "作業員名簿", submitTo: "元請" },
    { stage: 5, name: "建退共加入確認票・加入労働者数報告書", submitTo: "元請" },
    { stage: 5, name: "施工計画書（担当工種分）", required: false, submitTo: "元請" },
    { stage: 5, name: "完了届", submitTo: "元請" },
    { stage: 5, name: "請求書", submitTo: "元請" },
  ],
};

export function buildDocFlowTemplate(role: ContractRole): DocFlowItem[] {
  return TEMPLATES[role].map((t) => ({
    id: genId(),
    stage: t.stage,
    name: t.name,
    required: t.required ?? true,
    status: "todo",
    submitTo: t.submitTo,
  }));
}

const isDone = (it: DocFlowItem) => it.status === "submitted" || it.status === "accepted";

/** 必須書類がすべて提出済/受理なら、その段階は完了（必須書類がない段階は完了扱い） */
export function isStageComplete(items: DocFlowItem[], stage: number): boolean {
  return items.filter((it) => it.stage === stage && it.required).every(isDone);
}

/** 現在の段階＝未完了の最初の段階（全部完了なら 5） */
export function currentDocFlowStage(items: DocFlowItem[]): number {
  for (let s = 1; s <= 5; s++) {
    if (!isStageComplete(items, s)) return s;
  }
  return 5;
}

export function isContractConfirmed(items: DocFlowItem[]): boolean {
  for (let s = 1; s <= CONTRACT_STAGE; s++) {
    if (!isStageComplete(items, s)) return false;
  }
  return true;
}

/** 期限切れ（今日より前で未提出）の書類 */
export function overdueItems(items: DocFlowItem[], todayYmd: string): DocFlowItem[] {
  return items.filter((it) => !isDone(it) && !!it.dueDate && it.dueDate < todayYmd);
}
