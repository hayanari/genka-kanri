// ================================================================
// lib/crmStorage.ts — 顧客・商談メモ（Supabase + RLS）
// service_role は使わない（anon + ユーザーJWT）
// ================================================================
import { createClient } from "@/lib/supabase/client";
import { requireCompanyId } from "@/lib/tenant";
import type {
  ContactLog,
  ContactType,
  ContactVisibility,
  Customer,
} from "@/types/crm";

export const CRM_VIEWER_FORBIDDEN =
  "閲覧専用のため保存できません。管理者に変更権限を依頼してください。";

async function assertWritable(): Promise<void> {
  const { canWrite } = await import("@/lib/roles");
  if (!(await canWrite())) throw new Error(CRM_VIEWER_FORBIDDEN);
}

function mapCustomer(r: Record<string, unknown>): Customer {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    contactPerson: String(r.contact_person ?? ""),
    phone: String(r.phone ?? ""),
    email: String(r.email ?? ""),
    address: String(r.address ?? ""),
    note: String(r.note ?? ""),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

function mapLog(r: Record<string, unknown>): ContactLog {
  const customers = r.customers as { name?: string } | null | undefined;
  return {
    id: String(r.id),
    customerId: String(r.customer_id),
    projectId: String(r.project_id ?? ""),
    contactDate: String(r.contact_date ?? "").slice(0, 10),
    contactType: (String(r.contact_type ?? "その他") as ContactType) || "その他",
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    visibility: (String(r.visibility ?? "company") as ContactVisibility) || "company",
    createdBy: String(r.created_by ?? ""),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    customerName: customers?.name ? String(customers.name) : undefined,
  };
}

export async function loadCustomers(): Promise<Customer[]> {
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (error) {
    if (/customers|schema cache|does not exist/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []).map((r) => mapCustomer(r as Record<string, unknown>));
}

export async function upsertCustomer(input: {
  id?: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  note?: string;
}): Promise<Customer> {
  await assertWritable();
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const row = {
    ...(input.id ? { id: input.id } : {}),
    company_id: companyId,
    name: input.name.trim(),
    contact_person: input.contactPerson ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    address: input.address ?? "",
    note: input.note ?? "",
  };
  if (!row.name) throw new Error("会社名は必須です");
  const q = input.id
    ? supabase.from("customers").upsert(row, { onConflict: "id" })
    : supabase.from("customers").insert(row);
  const { data, error } = await q.select("*").single();
  if (error) throw error;
  return mapCustomer(data as Record<string, unknown>);
}

export async function deleteCustomer(id: string): Promise<void> {
  await assertWritable();
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("company_id", companyId)
    .eq("id", id);
  if (error) throw error;
}

export async function loadContactLogs(filter: {
  customerId?: string;
  projectId?: string;
  limit?: number;
}): Promise<ContactLog[]> {
  const supabase = createClient();
  const companyId = await requireCompanyId();
  let q = supabase
    .from("contact_logs")
    .select("*, customers(name)")
    .eq("company_id", companyId)
    .order("contact_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (filter.customerId) q = q.eq("customer_id", filter.customerId);
  if (filter.projectId) q = q.eq("project_id", filter.projectId);
  if (filter.limit) q = q.limit(filter.limit);
  const { data, error } = await q;
  if (error) {
    if (/contact_logs|schema cache|does not exist/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []).map((r) => mapLog(r as Record<string, unknown>));
}

export async function getContactLog(id: string): Promise<ContactLog | null> {
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const { data, error } = await supabase
    .from("contact_logs")
    .select("*, customers(name)")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapLog(data as Record<string, unknown>) : null;
}

export type ContactLogInput = {
  id?: string;
  customerId: string;
  projectId?: string;
  contactDate: string;
  contactType: ContactType;
  title: string;
  body: string;
  visibility: ContactVisibility;
};

export async function saveContactLog(input: ContactLogInput): Promise<ContactLog> {
  await assertWritable();
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");

  const row = {
    ...(input.id ? { id: input.id } : {}),
    company_id: companyId,
    customer_id: input.customerId,
    project_id: input.projectId ?? "",
    contact_date: input.contactDate,
    contact_type: input.contactType,
    title: input.title.trim(),
    body: input.body.trim(),
    visibility: input.visibility,
    created_by: user.id,
  };

  const q = input.id
    ? supabase.from("contact_logs").upsert(row, { onConflict: "id" })
    : supabase.from("contact_logs").insert(row);
  const { data, error } = await q.select("*, customers(name)").single();
  if (error) throw error;
  return mapLog(data as Record<string, unknown>);
}

export async function deleteContactLog(id: string): Promise<void> {
  await assertWritable();
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const { error } = await supabase
    .from("contact_logs")
    .delete()
    .eq("company_id", companyId)
    .eq("id", id);
  if (error) throw error;
}

/** 役員メモ閲覧時のみ記録（RLSで非役員メモはINSERT不可） */
export async function logContactAccess(contactLogId: string): Promise<void> {
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("contact_log_access_logs").insert({
    company_id: companyId,
    contact_log_id: contactLogId,
    user_id: user.id,
  });
  // 権限不足は黙ってスキップ
  if (error && !/policy|permission|violates/i.test(error.message)) {
    console.warn("[crm] access log", error.message);
  }
}

export async function fetchIsExecutive(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("company_users")
    .select("is_executive, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return false;
  return Boolean(data.is_executive) || data.role === "admin" || data.role === "owner";
}

/** 横断検索（RLS適用・anonクライアント） */
export async function searchCrm(query: string): Promise<{
  customers: Customer[];
  logs: ContactLog[];
}> {
  const q = query.trim();
  if (!q) return { customers: [], logs: [] };
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const safe = q.replace(/[%_,]/g, " ");
  const pattern = `%${safe}%`;

  const [cRes, lRes] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .eq("company_id", companyId)
      .or(`name.ilike.${pattern},contact_person.ilike.${pattern},note.ilike.${pattern}`)
      .limit(30),
    supabase
      .from("contact_logs")
      .select("*, customers(name)")
      .eq("company_id", companyId)
      .or(`title.ilike.${pattern},body.ilike.${pattern}`)
      .limit(40),
  ]);

  if (cRes.error && !/does not exist|schema cache/i.test(cRes.error.message)) throw cRes.error;
  if (lRes.error && !/does not exist|schema cache/i.test(lRes.error.message)) throw lRes.error;

  return {
    customers: (cRes.data ?? []).map((r) => mapCustomer(r as Record<string, unknown>)),
    logs: (lRes.data ?? []).map((r) => mapLog(r as Record<string, unknown>)),
  };
}
