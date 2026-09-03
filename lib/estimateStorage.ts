// ================================================================
// lib/estimateStorage.ts — 見積書の CRUD / 履歴
// ================================================================
import { createClient } from "@/lib/supabase/client";
import { requireCompanyId } from "@/lib/tenant";
import { genId } from "@/lib/constants";
import type {
  Estimate,
  EstimateEvent,
  EstimateIssuer,
  EstimateItem,
  EstimateStatus,
} from "@/types/estimate";
import {
  DEFAULT_ESTIMATE_ISSUER,
  DEFAULT_ESTIMATE_NOTES,
  calcEstimateTotals,
  calcItemAmount,
} from "@/types/estimate";

export const ESTIMATE_VIEWER_FORBIDDEN_MSG =
  "閲覧専用の権限のため保存できません。管理者に変更権限を依頼してください。";

async function assertWritable(): Promise<void> {
  const { canWrite } = await import("@/lib/roles");
  if (!(await canWrite())) throw new Error(ESTIMATE_VIEWER_FORBIDDEN_MSG);
}

export type EstimateActor = { email: string; name: string };

export async function resolveEstimateActor(): Promise<EstimateActor> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const email = session?.user?.email ?? "";
  let name =
    (session?.user?.user_metadata?.name as string | undefined)?.trim() ||
    (session?.user?.user_metadata?.full_name as string | undefined)?.trim() ||
    "";
  if (session?.user?.id) {
    const { data } = await supabase
      .from("company_users")
      .select("display_name")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (data?.display_name) name = String(data.display_name);
  }
  if (!name) name = email.split("@")[0] || "不明";
  return { email, name };
}

function mapIssuer(raw: unknown): EstimateIssuer {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    postalCode: String(o.postalCode ?? DEFAULT_ESTIMATE_ISSUER.postalCode),
    address: String(o.address ?? DEFAULT_ESTIMATE_ISSUER.address),
    companyName: String(o.companyName ?? DEFAULT_ESTIMATE_ISSUER.companyName),
    representative: String(o.representative ?? DEFAULT_ESTIMATE_ISSUER.representative),
    tel: String(o.tel ?? DEFAULT_ESTIMATE_ISSUER.tel),
    fax: String(o.fax ?? DEFAULT_ESTIMATE_ISSUER.fax),
  };
}

function mapItem(r: Record<string, unknown>): EstimateItem {
  return {
    id: String(r.id),
    section: String(r.section ?? ""),
    kind: String(r.kind ?? ""),
    category: String(r.category ?? ""),
    spec: String(r.spec ?? ""),
    quantity: Number(r.quantity ?? 0),
    unit: String(r.unit ?? ""),
    unitPrice: Number(r.unit_price ?? 0),
    amount: Number(r.amount ?? 0),
    note: String(r.note ?? ""),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapEstimate(
  r: Record<string, unknown>,
  items: EstimateItem[] = []
): Estimate {
  return {
    id: String(r.id),
    projectId: String(r.project_id ?? ""),
    estimateNo: String(r.estimate_no ?? ""),
    status: (String(r.status ?? "draft") as EstimateStatus) || "draft",
    issueDate: r.issue_date ? String(r.issue_date).slice(0, 10) : "",
    clientName: String(r.client_name ?? ""),
    workName: String(r.work_name ?? ""),
    siteLocation: String(r.site_location ?? ""),
    validPeriod: String(r.valid_period ?? ""),
    notes: String(r.notes ?? ""),
    taxRate: Number(r.tax_rate ?? 10),
    subtotal: Number(r.subtotal ?? 0),
    taxAmount: Number(r.tax_amount ?? 0),
    totalAmount: Number(r.total_amount ?? 0),
    issuer: mapIssuer(r.issuer),
    createdByEmail: String(r.created_by_email ?? ""),
    createdByName: String(r.created_by_name ?? ""),
    updatedByEmail: String(r.updated_by_email ?? ""),
    updatedByName: String(r.updated_by_name ?? ""),
    confirmedAt: r.confirmed_at ? String(r.confirmed_at) : null,
    confirmedByEmail: String(r.confirmed_by_email ?? ""),
    confirmedByName: String(r.confirmed_by_name ?? ""),
    lostAt: r.lost_at ? String(r.lost_at) : null,
    lostByEmail: String(r.lost_by_email ?? ""),
    lostByName: String(r.lost_by_name ?? ""),
    lostReason: String(r.lost_reason ?? ""),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    items,
  };
}

async function appendEvent(
  estimateId: string,
  action: string,
  actor: EstimateActor,
  detail: Record<string, unknown> = {}
): Promise<void> {
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const { error } = await supabase.from("estimate_events").insert({
    id: genId(),
    company_id: companyId,
    estimate_id: estimateId,
    action,
    actor_email: actor.email,
    actor_name: actor.name,
    detail,
  });
  if (error) console.error("[estimate] event", error);
}

async function loadEstimatesByFilter(
  filter: { projectId?: string } = {}
): Promise<Estimate[]> {
  const supabase = createClient();
  const companyId = await requireCompanyId();
  let q = supabase
    .from("estimates")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (filter.projectId != null) {
    q = q.eq("project_id", filter.projectId);
  }
  const { data, error } = await q;
  if (error) {
    if (/estimates|schema cache|does not exist/i.test(error.message)) return [];
    throw error;
  }
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => String(r.id));
  const { data: itemRows, error: itemErr } = await supabase
    .from("estimate_items")
    .select("*")
    .eq("company_id", companyId)
    .in("estimate_id", ids)
    .order("sort_order");
  if (itemErr && !/estimate_items|schema cache|does not exist/i.test(itemErr.message)) {
    throw itemErr;
  }
  const byEst = new Map<string, EstimateItem[]>();
  for (const it of itemRows ?? []) {
    const eid = String(it.estimate_id);
    const list = byEst.get(eid) ?? [];
    list.push(mapItem(it as Record<string, unknown>));
    byEst.set(eid, list);
  }
  return rows.map((r) => mapEstimate(r as Record<string, unknown>, byEst.get(String(r.id)) ?? []));
}

/** 会社の全見積（案件化前含む） */
export async function loadAllEstimates(): Promise<Estimate[]> {
  return loadEstimatesByFilter();
}

export async function loadEstimatesForProject(projectId: string): Promise<Estimate[]> {
  return loadEstimatesByFilter({ projectId });
}

/** 確定見積を案件に紐づけ */
export async function linkEstimateToProject(
  estimateId: string,
  projectId: string
): Promise<void> {
  await assertWritable();
  const actor = await resolveEstimateActor();
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const { error } = await supabase
    .from("estimates")
    .update({
      project_id: projectId,
      updated_by_email: actor.email,
      updated_by_name: actor.name,
    })
    .eq("company_id", companyId)
    .eq("id", estimateId);
  if (error) throw error;
  await appendEvent(estimateId, "linked", actor, { projectId });
}

export async function loadEstimateEvents(estimateId: string): Promise<EstimateEvent[]> {
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const { data, error } = await supabase
    .from("estimate_events")
    .select("*")
    .eq("company_id", companyId)
    .eq("estimate_id", estimateId)
    .order("created_at", { ascending: false });
  if (error) {
    if (/estimate_events|schema cache|does not exist/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []).map((e) => ({
    id: String(e.id),
    estimateId: String(e.estimate_id),
    action: String(e.action),
    actorEmail: String(e.actor_email ?? ""),
    actorName: String(e.actor_name ?? ""),
    detail: (e.detail && typeof e.detail === "object" ? e.detail : {}) as Record<
      string,
      unknown
    >,
    createdAt: String(e.created_at ?? ""),
  }));
}

export function buildNewEstimateDraft(input: {
  projectId?: string;
  clientName?: string;
  workName?: string;
  actor: EstimateActor;
}): Estimate {
  const today = new Date().toISOString().slice(0, 10);
  const id = genId();
  return {
    id,
    projectId: input.projectId ?? "",
    estimateNo: "",
    status: "draft",
    issueDate: today,
    clientName: input.clientName ?? "",
    workName: input.workName ?? "",
    siteLocation: "",
    validPeriod: "見積日より30日間",
    notes: DEFAULT_ESTIMATE_NOTES,
    taxRate: 10,
    subtotal: 0,
    taxAmount: 0,
    totalAmount: 0,
    issuer: { ...DEFAULT_ESTIMATE_ISSUER },
    createdByEmail: input.actor.email,
    createdByName: input.actor.name,
    updatedByEmail: input.actor.email,
    updatedByName: input.actor.name,
    confirmedAt: null,
    confirmedByEmail: "",
    confirmedByName: "",
    lostAt: null,
    lostByEmail: "",
    lostByName: "",
    lostReason: "",
    createdAt: "",
    updatedAt: "",
    items: [
      {
        ...{
          id: genId(),
          section: "材料費",
          kind: "",
          category: "",
          spec: "",
          quantity: 0,
          unit: "ｍ",
          unitPrice: 0,
          amount: 0,
          note: "",
          sortOrder: 0,
        },
      },
      {
        id: genId(),
        section: "施工費",
        kind: "",
        category: "",
        spec: "",
        quantity: 0,
        unit: "箇所",
        unitPrice: 0,
        amount: 0,
        note: "",
        sortOrder: 1,
      },
    ],
  };
}

function normalizeItems(items: EstimateItem[]): EstimateItem[] {
  return items.map((it, i) => {
    const quantity = Number(it.quantity) || 0;
    const unitPrice = Number(it.unitPrice) || 0;
    const amount =
      it.amount && !quantity && !unitPrice
        ? Number(it.amount) || 0
        : calcItemAmount(quantity, unitPrice);
    return {
      ...it,
      id: it.id || genId(),
      quantity,
      unitPrice,
      amount,
      sortOrder: i,
    };
  });
}

export async function saveEstimate(
  estimate: Estimate,
  options?: { isNew?: boolean }
): Promise<Estimate> {
  await assertWritable();
  const actor = await resolveEstimateActor();
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const items = normalizeItems(estimate.items);
  const totals = calcEstimateTotals(items, estimate.taxRate);
  const payload = {
    id: estimate.id,
    company_id: companyId,
    project_id: estimate.projectId || "",
    estimate_no: estimate.estimateNo,
    status: estimate.status,
    issue_date: estimate.issueDate || null,
    client_name: estimate.clientName,
    work_name: estimate.workName,
    site_location: estimate.siteLocation,
    valid_period: estimate.validPeriod,
    notes: estimate.notes,
    tax_rate: estimate.taxRate,
    subtotal: totals.subtotal,
    tax_amount: totals.taxAmount,
    total_amount: totals.totalAmount,
    issuer: estimate.issuer,
    created_by_email: estimate.createdByEmail || actor.email,
    created_by_name: estimate.createdByName || actor.name,
    updated_by_email: actor.email,
    updated_by_name: actor.name,
    confirmed_at: estimate.confirmedAt,
    confirmed_by_email: estimate.confirmedByEmail,
    confirmed_by_name: estimate.confirmedByName,
    lost_at: estimate.lostAt,
    lost_by_email: estimate.lostByEmail,
    lost_by_name: estimate.lostByName,
    lost_reason: estimate.lostReason,
  };

  const { error } = await supabase.from("estimates").upsert(payload, { onConflict: "id" });
  if (error) throw error;

  await supabase
    .from("estimate_items")
    .delete()
    .eq("company_id", companyId)
    .eq("estimate_id", estimate.id);

  if (items.length > 0) {
    const { error: itemErr } = await supabase.from("estimate_items").insert(
      items.map((it) => ({
        id: it.id,
        company_id: companyId,
        estimate_id: estimate.id,
        section: it.section,
        kind: it.kind,
        category: it.category,
        spec: it.spec,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unitPrice,
        amount: it.amount,
        note: it.note,
        sort_order: it.sortOrder,
      }))
    );
    if (itemErr) throw itemErr;
  }

  await appendEvent(estimate.id, options?.isNew ? "created" : "updated", actor, {
    totalAmount: totals.totalAmount,
    status: estimate.status,
  });

  return {
    ...estimate,
    ...totals,
    items,
    updatedByEmail: actor.email,
    updatedByName: actor.name,
    createdByEmail: payload.created_by_email,
    createdByName: payload.created_by_name,
  };
}

export async function setEstimateStatus(
  estimateId: string,
  status: EstimateStatus,
  extra?: { lostReason?: string }
): Promise<void> {
  await assertWritable();
  const actor = await resolveEstimateActor();
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    updated_by_email: actor.email,
    updated_by_name: actor.name,
  };
  let action = "updated";
  if (status === "confirmed") {
    patch.confirmed_at = now;
    patch.confirmed_by_email = actor.email;
    patch.confirmed_by_name = actor.name;
    patch.lost_at = null;
    patch.lost_by_email = "";
    patch.lost_by_name = "";
    patch.lost_reason = "";
    action = "confirmed";
  } else if (status === "lost") {
    patch.lost_at = now;
    patch.lost_by_email = actor.email;
    patch.lost_by_name = actor.name;
    patch.lost_reason = extra?.lostReason ?? "";
    action = "lost";
  } else if (status === "draft") {
    patch.confirmed_at = null;
    patch.confirmed_by_email = "";
    patch.confirmed_by_name = "";
    patch.lost_at = null;
    patch.lost_by_email = "";
    patch.lost_by_name = "";
    patch.lost_reason = "";
    action = "reopen";
  }

  const { error } = await supabase
    .from("estimates")
    .update(patch)
    .eq("company_id", companyId)
    .eq("id", estimateId);
  if (error) throw error;
  await appendEvent(estimateId, action, actor, extra ?? {});
}

export async function deleteEstimate(estimateId: string): Promise<void> {
  await assertWritable();
  const supabase = createClient();
  const companyId = await requireCompanyId();
  const { error } = await supabase
    .from("estimates")
    .delete()
    .eq("company_id", companyId)
    .eq("id", estimateId);
  if (error) throw error;
}

export async function logEstimateExport(
  estimateId: string,
  action: "pdf" | "emailed",
  detail: Record<string, unknown> = {}
): Promise<void> {
  const actor = await resolveEstimateActor();
  await appendEvent(estimateId, action, actor, detail);
}
