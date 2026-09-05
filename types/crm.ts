// ================================================================
// CRM（顧客・商談メモ・会議メモ）型
// ================================================================

export type ContactType = "電話" | "対面" | "オンライン" | "メール" | "その他";
export type ContactVisibility = "company" | "executive" | "private";
/** memo=1対1メモ / meeting=会議（複数社・複数担当者） */
export type ContactLogKind = "memo" | "meeting";
/** draft=下書き（未確認） / confirmed=確定 */
export type ContactLogStatus = "draft" | "confirmed";

export type Customer = {
  id: string;
  name: string;
  /** @deprecated 担当者は customer_contacts へ。互換のため残す */
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerContact = {
  id: string;
  customerId: string;
  name: string;
  title: string;
  phone: string;
  email: string;
  note: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/** 会議の出席者（会社 × 任意の担当者） */
export type ContactLogAttendee = {
  customerId: string;
  contactPersonId?: string;
  /** join */
  customerName?: string;
  contactPersonName?: string;
};

/** 追加で閲覧を許可したスタッフ */
export type ContactLogViewer = {
  userId: string;
  name?: string;
};

/** 社内スタッフ（閲覧許可の選択肢） */
export type CompanyMember = {
  userId: string;
  name: string;
  isExecutive: boolean;
};

export type ContactLog = {
  id: string;
  customerId: string;
  projectId: string;
  contactDate: string;
  contactType: ContactType;
  title: string;
  /** 本文（会議は整形済み議事録） */
  body: string;
  visibility: ContactVisibility;
  kind: ContactLogKind;
  status: ContactLogStatus;
  /** 文字起こし原文（Plaud等）。編集可 */
  transcript: string;
  /** crm-audio バケット内パス */
  audioPath: string;
  audioName: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** join */
  customerName?: string;
  createdByName?: string;
  contactPersonId?: string;
  contactPersonName?: string;
  attendees?: ContactLogAttendee[];
  /** 公開範囲に加えて閲覧できるスタッフ */
  viewers?: ContactLogViewer[];
};

export const CONTACT_TYPES: ContactType[] = ["電話", "対面", "オンライン", "メール", "その他"];
/** 会議メモで選べる形式 */
export const MEETING_TYPES: ContactType[] = ["対面", "オンライン", "その他"];

export const VISIBILITY_LABEL: Record<ContactVisibility, string> = {
  company: "全社",
  executive: "役員のみ",
  private: "自分のみ",
};

export const VISIBILITY_HINT: Record<ContactVisibility, string> = {
  company: "社内の全員が閲覧できます",
  executive: "役員フラグのあるユーザーのみ（下で個別のスタッフを追加できます）",
  private: "作成者本人のみ（下で個別のスタッフを追加できます）",
};

export const KIND_LABEL: Record<ContactLogKind, string> = {
  memo: "メモ",
  meeting: "会議",
};

export const STATUS_LABEL: Record<ContactLogStatus, string> = {
  draft: "下書き",
  confirmed: "確定",
};

/** 会議の出席会社名を重複なしで返す */
export function attendeeCompanyNames(log: ContactLog): string[] {
  const names = new Set<string>();
  for (const a of log.attendees ?? []) {
    if (a.customerName) names.add(a.customerName);
  }
  if (names.size === 0 && log.customerName) names.add(log.customerName);
  return [...names];
}
