// ================================================================
// lib/crmStorage.ts — 顧客・商談メモ（Supabase + RLS）
// service_role は使わない（anon + ユーザーJWT）
// ================================================================
import { createClient } from "@/lib/supabase/client";
import { requireCompanyId } from "@/lib/tenant";
import type {
  CompanyMember,
  ContactLog,
  ContactLogAttendee,
  ContactLogKind,
  ContactLogStatus,
  ContactLogViewer,
  ContactType,
  ContactVisibility,
  Customer,
  CustomerContact,
} from "@/types/crm";

export const CRM_VIEWER_FORBIDDEN =
  "閲覧専用のため保存できません。管理者に変更権限を依頼してください。";
export const CRM_EDIT_FORBIDDEN =
  "このメモを編集できるのは作成者または役員のみです。";

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

function mapAttendee(r: Record<string, unknown>): ContactLogAttendee {
  const customers = r.customers as { name?: string } | null | undefined;
  const person = r.customer_contacts as { name?: string } | null | undefined;
  return {
    customerId: String(r.customer_id),
    contactPersonId: r.contact_person_id ? String(r.contact_person_id) : undefined,
    customerName: customers?.name ? String(customers.name) : undefined,
    contactPersonName: person?.name ? String(person.name) : undefined,
  };
}

function memberName(cu: { display_name?: string | null; login_id?: string | null } | null | undefined): string {
  return String(cu?.display_name || cu?.login_id || "");
}

function mapViewer(r: Record<string, unknown>): ContactLogViewer {
  const cu = r.company_users as { display_name?: string; login_id?: string } | null | undefined;
  const name = memberName(cu);
  return { userId: String(r.user_id), name: name || undefined };
}

function mapLog(r: Record<string, unknown>): ContactLog {
  const customers = r.customers as { name?: string } | null | undefined;
  const person = r.customer_contacts as { name?: string } | null | undefined;
  const rawAttendees = Array.isArray(r.contact_log_attendees)
    ? (r.contact_log_attendees as Record<string, unknown>[])
    : undefined;
  const rawViewers = Array.isArray(r.contact_log_viewers)
    ? (r.contact_log_viewers as Record<string, unknown>[])
    : undefined;
  return {
    id: String(r.id),
    customerId: String(r.customer_id),
    projectId: String(r.project_id ?? ""),
    contactDate: String(r.contact_date ?? "").slice(0, 10),
    contactType: (String(r.contact_type ?? "その他") as ContactType) || "その他",
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    visibility: (String(r.visibility ?? "company") as ContactVisibility) || "company",
    kind: (String(r.kind ?? "memo") as ContactLogKind) || "memo",
    status: (String(r.status ?? "confirmed") as ContactLogStatus) || "confirmed",
    transcript: String(r.transcript ?? ""),
    audioPath: String(r.audio_path ?? ""),
    audioName: String(r.audio_name ?? ""),
    createdBy: String(r.created_by ?? ""),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    customerName: customers?.name ? String(customers.name) : undefined,
    contactPersonId: r.contact_person_id ? String(r.contact_person_id) : undefined,
    contactPersonName: person?.name ? String(person.name) : undefined,
    attendees: rawAttendees?.map(mapAttendee),
    viewers: rawViewers?.map(mapViewer),
  };
}

// 段階的マイグレーション対応: 未適用のテーブルがあれば select を縮退して再試行
const SEL_CONTACTS = "customer_contacts(name)";
const SEL_ATTENDEES =
  "contact_log_attendees(customer_id, contact_person_id, customers(name), customer_contacts(name))";
const SEL_VIEWERS = "contact_log_viewers(user_id, company_users(display_name, login_id))";

const LOG_SELECTS: { select: string; missing: RegExp }[] = [
  { select: `*, customers(name), ${SEL_CONTACTS}, ${SEL_ATTENDEES}, ${SEL_VIEWERS}`, missing: /contact_log_viewers/i },
  { select: `*, customers(name), ${SEL_CONTACTS}, ${SEL_ATTENDEES}`, missing: /contact_log_attendees/i },
  { select: `*, customers(name), ${SEL_CONTACTS}`, missing: /customer_contacts/i },
  { select: "*, customers(name)", missing: /$^/ },
];

type QueryResult = { data: unknown; error: { message: string } | null };

async function runLogQuery(
  build: (select: string) => PromiseLike<QueryResult>
): Promise<QueryResult> {
  let res: QueryResult = { data: null, error: null };
  for (const { select, missing } of LOG_SELECTS) {
    res = await build(select);
    if (!res.error || !missing.test(res.error.message)) return res;
  }
  return res;
}

/** 社内スタッフ一覧（閲覧許可の選択肢。RLS で自社のみ） */
export async function loadCompanyMembers(): Promise<CompanyMember[]> {
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const { data, error } = await supabase
    .from("company_users")
    .select("user_id, display_name, login_id, is_executive, role")
    .eq("company_id", companyId)
    .order("display_name");
  if (error) return [];
  return (data ?? [])
    .map((r) => {
      const row = r as {
        user_id: string;
        display_name?: string | null;
        login_id?: string | null;
        is_executive?: boolean | null;
        role?: string | null;
      };
      return {
        userId: String(row.user_id),
        name: memberName(row) || "（名前未設定）",
        isExecutive: Boolean(row.is_executive) || row.role === "admin" || row.role === "owner",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/** エラー文から未定義列名を抜き出し、行から取り除く（マイグレーション未適用環境の互換） */
function stripUnknownColumn(row: Record<string, unknown>, message: string): boolean {
  const m =
    message.match(/'([a-z_]+)' column/i) ??
    message.match(/column "?([a-z_]+)"? (?:of relation|does not exist)/i);
  const col = m?.[1];
  if (!col || !(col in row)) return false;
  delete row[col];
  return true;
}

function mapContact(r: Record<string, unknown>): CustomerContact {
  return {
    id: String(r.id),
    customerId: String(r.customer_id),
    name: String(r.name ?? ""),
    title: String(r.title ?? ""),
    phone: String(r.phone ?? ""),
    email: String(r.email ?? ""),
    note: String(r.note ?? ""),
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
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
    // 会社マスタでは担当者を持たない（互換列は空に近づける）
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

export async function loadCustomerContacts(customerId: string): Promise<CustomerContact[]> {
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const { data, error } = await supabase
    .from("customer_contacts")
    .select("*")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .order("sort_order")
    .order("name");
  if (error) {
    if (/customer_contacts|schema cache|does not exist/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []).map((r) => mapContact(r as Record<string, unknown>));
}

export async function upsertCustomerContact(input: {
  id?: string;
  customerId: string;
  name: string;
  title?: string;
  phone?: string;
  email?: string;
  note?: string;
  sortOrder?: number;
}): Promise<CustomerContact> {
  await assertWritable();
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const name = input.name.trim();
  if (!name) throw new Error("担当者名は必須です");
  const row = {
    ...(input.id ? { id: input.id } : {}),
    company_id: companyId,
    customer_id: input.customerId,
    name,
    title: input.title ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    note: input.note ?? "",
    sort_order: input.sortOrder ?? 0,
  };
  const q = input.id
    ? supabase.from("customer_contacts").upsert(row, { onConflict: "id" })
    : supabase.from("customer_contacts").insert(row);
  const { data, error } = await q.select("*").single();
  if (error) throw error;
  return mapContact(data as Record<string, unknown>);
}

export async function deleteCustomerContact(id: string): Promise<void> {
  await assertWritable();
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const { error } = await supabase
    .from("customer_contacts")
    .delete()
    .eq("company_id", companyId)
    .eq("id", id);
  if (error) throw error;
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

/** 出席者として紐づくメモIDを取得（未適用環境では空） */
async function attendeeLogIds(companyId: string, customerId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("contact_log_attendees")
    .select("contact_log_id")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) return [];
  return [...new Set((data ?? []).map((r) => String((r as { contact_log_id: string }).contact_log_id)))];
}

/**
 * 商談メモ一覧。customerId 指定時は「主顧客」または「出席者」として紐づくものを返す
 * （JV会議は各社のタイムラインに同じ1件が出る）
 */
export async function loadContactLogs(filter: {
  customerId?: string;
  projectId?: string;
  limit?: number;
}): Promise<ContactLog[]> {
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const viaAttendee = filter.customerId ? await attendeeLogIds(companyId, filter.customerId) : [];

  const res = await runLogQuery((select) => {
    let q = supabase
      .from("contact_logs")
      .select(select)
      .eq("company_id", companyId)
      .order("contact_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (filter.customerId) {
      q =
        viaAttendee.length > 0
          ? q.or(`customer_id.eq.${filter.customerId},id.in.(${viaAttendee.join(",")})`)
          : q.eq("customer_id", filter.customerId);
    }
    if (filter.projectId) q = q.eq("project_id", filter.projectId);
    if (filter.limit) q = q.limit(filter.limit);
    return q;
  });
  if (res.error) {
    if (/contact_logs|schema cache|does not exist/i.test(res.error.message)) return [];
    throw res.error;
  }
  return ((res.data as Record<string, unknown>[] | null) ?? []).map(mapLog);
}

export async function getContactLog(id: string): Promise<ContactLog | null> {
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const res = await runLogQuery((select) =>
    supabase.from("contact_logs").select(select).eq("company_id", companyId).eq("id", id).maybeSingle()
  );
  if (res.error) throw res.error;
  return res.data ? mapLog(res.data as Record<string, unknown>) : null;
}

export type AttendeeInput = { customerId: string; contactPersonId?: string };

export type ContactLogInput = {
  id?: string;
  customerId: string;
  projectId?: string;
  contactPersonId?: string;
  contactDate: string;
  contactType: ContactType;
  title: string;
  body: string;
  visibility: ContactVisibility;
  kind?: ContactLogKind;
  status?: ContactLogStatus;
  transcript?: string;
  audioPath?: string;
  audioName?: string;
  /** 会議の出席者。主顧客（customerId）は自動で含める */
  attendees?: AttendeeInput[];
  /** 公開範囲に加えて閲覧を許可するスタッフ（user_id）。全社公開のときは無視 */
  viewerIds?: string[];
};

/** 追加閲覧者を丸ごと置き換える（未適用環境では黙ってスキップ） */
async function syncViewers(companyId: string, logId: string, viewerIds: string[]): Promise<void> {
  const supabase = createClient();
  const del = await supabase
    .from("contact_log_viewers")
    .delete()
    .eq("company_id", companyId)
    .eq("contact_log_id", logId);
  if (del.error) {
    if (/contact_log_viewers|schema cache|does not exist/i.test(del.error.message)) return;
    throw del.error;
  }
  const ids = [...new Set(viewerIds.filter(Boolean))];
  if (ids.length === 0) return;
  const ins = await supabase.from("contact_log_viewers").insert(
    ids.map((user_id) => ({ company_id: companyId, contact_log_id: logId, user_id }))
  );
  if (ins.error) throw ins.error;
}

/** 出席者を丸ごと置き換える（未適用環境では黙ってスキップ） */
async function syncAttendees(
  companyId: string,
  logId: string,
  primaryCustomerId: string,
  primaryPersonId: string | undefined,
  attendees: AttendeeInput[]
): Promise<void> {
  const supabase = createClient();
  const seen = new Set<string>();
  const rows: { company_id: string; contact_log_id: string; customer_id: string; contact_person_id: string | null }[] =
    [];
  const push = (a: AttendeeInput) => {
    const key = `${a.customerId}|${a.contactPersonId ?? ""}`;
    if (!a.customerId || seen.has(key)) return;
    seen.add(key);
    rows.push({
      company_id: companyId,
      contact_log_id: logId,
      customer_id: a.customerId,
      contact_person_id: a.contactPersonId || null,
    });
  };
  push({ customerId: primaryCustomerId, contactPersonId: primaryPersonId });
  attendees.forEach(push);
  // 担当者付きが存在する会社の「会社のみ」行は落とす（表示重複防止）
  const withPerson = new Set(rows.filter((r) => r.contact_person_id).map((r) => r.customer_id));
  const finalRows = rows.filter((r) => r.contact_person_id || !withPerson.has(r.customer_id));

  const del = await supabase
    .from("contact_log_attendees")
    .delete()
    .eq("company_id", companyId)
    .eq("contact_log_id", logId);
  if (del.error) {
    if (/contact_log_attendees|schema cache|does not exist/i.test(del.error.message)) return;
    throw del.error;
  }
  if (finalRows.length === 0) return;
  const ins = await supabase.from("contact_log_attendees").insert(finalRows);
  if (ins.error) throw ins.error;
}

export async function saveContactLog(input: ContactLogInput): Promise<ContactLog> {
  await assertWritable();
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");

  const attendees = input.attendees ?? [];
  // 主顧客: 明示指定がなければ出席者の先頭会社
  const primaryCustomerId = input.customerId || attendees[0]?.customerId || "";
  if (!primaryCustomerId) throw new Error("顧客（会社）を選択してください");

  const row: Record<string, unknown> = {
    company_id: companyId,
    customer_id: primaryCustomerId,
    project_id: input.projectId ?? "",
    contact_person_id: input.contactPersonId || null,
    contact_date: input.contactDate,
    contact_type: input.contactType,
    title: input.title.trim(),
    body: input.body.trim(),
    visibility: input.visibility,
    kind: input.kind ?? "memo",
    status: input.status ?? "confirmed",
    transcript: input.transcript ?? "",
    audio_path: input.audioPath ?? "",
    audio_name: input.audioName ?? "",
  };
  if (!input.id) row.created_by = user.id;

  // 未適用の列があれば取り除いて再試行（最大6回）
  let saved: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const q = input.id
      ? supabase.from("contact_logs").update(row).eq("company_id", companyId).eq("id", input.id)
      : supabase.from("contact_logs").insert(row);
    const { data, error } = await q.select("*").single();
    if (!error) {
      saved = data as Record<string, unknown>;
      break;
    }
    if (input.id && error.code === "PGRST116") throw new Error(CRM_EDIT_FORBIDDEN);
    if (!stripUnknownColumn(row, error.message)) throw error;
  }
  if (!saved) throw new Error("保存に失敗しました");

  const logId = String(saved.id);
  await syncAttendees(companyId, logId, primaryCustomerId, input.contactPersonId, attendees);
  // 全社公開なら個別許可は不要（自分自身も除く）
  const viewerIds =
    input.visibility === "company" ? [] : (input.viewerIds ?? []).filter((id) => id !== user.id);
  await syncViewers(companyId, logId, viewerIds);

  const full = await getContactLog(logId);
  return full ?? mapLog(saved);
}

/** 本文・文字起こし・ステータスなどの部分更新（作成者または役員のみ、RLS） */
export async function patchContactLog(
  id: string,
  patch: Partial<{
    title: string;
    body: string;
    transcript: string;
    status: ContactLogStatus;
    audioPath: string;
    audioName: string;
  }>
): Promise<ContactLog | null> {
  await assertWritable();
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.body !== undefined) row.body = patch.body.trim();
  if (patch.transcript !== undefined) row.transcript = patch.transcript;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.audioPath !== undefined) row.audio_path = patch.audioPath;
  if (patch.audioName !== undefined) row.audio_name = patch.audioName;
  if (Object.keys(row).length === 0) return getContactLog(id);
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase
      .from("contact_logs")
      .update(row)
      .eq("company_id", companyId)
      .eq("id", id)
      .select("id");
    if (!error) {
      // RLS で更新対象外（作成者・役員以外）の場合は 0 件になる
      if ((data ?? []).length === 0) throw new Error(CRM_EDIT_FORBIDDEN);
      break;
    }
    if (!stripUnknownColumn(row, error.message)) throw error;
    if (Object.keys(row).length === 0) break;
  }
  return getContactLog(id);
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

  const [cRes, pRes, lRes] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .eq("company_id", companyId)
      .or(`name.ilike.${pattern},contact_person.ilike.${pattern},note.ilike.${pattern}`)
      .limit(30),
    supabase
      .from("customer_contacts")
      .select("customer_id")
      .eq("company_id", companyId)
      .or(`name.ilike.${pattern},title.ilike.${pattern},note.ilike.${pattern}`)
      .limit(30),
    runLogQuery((select) =>
      supabase
        .from("contact_logs")
        .select(select)
        .eq("company_id", companyId)
        .or(`title.ilike.${pattern},body.ilike.${pattern}`)
        .order("contact_date", { ascending: false })
        .limit(40)
    ),
  ]);

  if (cRes.error && !/does not exist|schema cache/i.test(cRes.error.message)) throw cRes.error;
  if (lRes.error && !/does not exist|schema cache/i.test(lRes.error.message)) throw lRes.error;

  const byId = new Map(
    (cRes.data ?? []).map((r) => [String((r as { id: string }).id), r as Record<string, unknown>])
  );
  const personCustomerIds = [
    ...new Set(
      (pRes.error ? [] : pRes.data ?? []).map((r) => String((r as { customer_id: string }).customer_id))
    ),
  ].filter((id) => !byId.has(id));
  if (personCustomerIds.length > 0) {
    const extra = await supabase
      .from("customers")
      .select("*")
      .eq("company_id", companyId)
      .in("id", personCustomerIds);
    for (const r of extra.data ?? []) byId.set(String((r as { id: string }).id), r as Record<string, unknown>);
  }

  return {
    customers: [...byId.values()].map((r) => mapCustomer(r)),
    logs: (lRes.error ? [] : ((lRes.data as Record<string, unknown>[] | null) ?? [])).map(mapLog),
  };
}
