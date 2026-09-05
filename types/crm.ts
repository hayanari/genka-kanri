// ================================================================
// CRM（顧客・商談メモ）型
// ================================================================

export type ContactType = "電話" | "対面" | "メール" | "その他";
export type ContactVisibility = "company" | "executive" | "private";

export type Customer = {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactLog = {
  id: string;
  customerId: string;
  projectId: string;
  contactDate: string;
  contactType: ContactType;
  title: string;
  body: string;
  visibility: ContactVisibility;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** join */
  customerName?: string;
  createdByName?: string;
};

export const CONTACT_TYPES: ContactType[] = ["電話", "対面", "メール", "その他"];

export const VISIBILITY_LABEL: Record<ContactVisibility, string> = {
  company: "全社",
  executive: "役員のみ",
  private: "自分のみ",
};

export const VISIBILITY_HINT: Record<ContactVisibility, string> = {
  company: "社内の全員が閲覧できます",
  executive: "役員フラグのあるユーザーのみ",
  private: "作成者本人のみ",
};
