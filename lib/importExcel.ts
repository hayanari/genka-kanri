import { genId, toTaxExclusive } from "@/lib/constants";
import type { Project } from "@/lib/utils";

type ExcelProject = {
  id?: string;
  name: string;
  client: string;
  category: string;
  mode?: string;
  originalAmount?: number;
  contractAmount?: number;
  budget?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
  progress?: number;
  billedAmount?: number;
  paidAmount?: number;
  notes?: string;
  marginRate?: number;
  subcontractAmount?: number;
  subcontractVendor?: string;
  payments?: { id?: string; date?: string; amount?: number; note?: string }[];
  changes?: { id?: string; type?: string; amount?: number; description?: string; date?: string }[];
};

function isValidDateStr(s: string): boolean {
  if (!s || typeof s !== "string") return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

/** 不正な日付を補正（例: 2026-06-31 → 2026-06-30） */
function normalizeDate(s: string): string {
  if (!s || typeof s !== "string") return "";
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return s;
  const y = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  let day = parseInt(m[3], 10);
  if (month < 1 || month > 12) return s;
  const lastDay = new Date(y, month, 0).getDate();
  day = Math.min(Math.max(1, day), lastDay);
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function convertExcelProjectsToApp(
  excelProjects: ExcelProject[]
): Project[] {
  return excelProjects.map((ep) => {
    const mode = ep.mode === "subcontract" ? "subcontract" : "normal";
    const notesParts: string[] = [];
    if (ep.notes?.trim()) notesParts.push(ep.notes.trim());

    if (ep.mode === "unit_price") {
      notesParts.push("※単価契約（Excel取込）");
    }

    const changes = (ep.changes || [])
      .filter((c) => c.type === "increase" || c.type === "decrease")
      .map((c) => ({
        id: c.id || genId(),
        date: (c.date && isValidDateStr(c.date) ? c.date : ep.startDate || "") || "",
        type: c.type!,
        amount: toTaxExclusive(c.amount ?? 0),
        description: c.description ?? "",
      }));

    const instructionChanges = (ep.changes || []).filter(
      (c) => c.type === "instruction" || (c.type && !["increase", "decrease"].includes(c.type))
    );
    if (instructionChanges.length > 0) {
      const instructionNotes = instructionChanges
        .map((c) => `${c.description || "指示"}: ¥${toTaxExclusive(c.amount ?? 0).toLocaleString()}（税抜）`)
        .join(" / ");
      notesParts.push(`[取込メモ] ${instructionNotes}`);
    }

    const startDate = ep.startDate && isValidDateStr(ep.startDate)
      ? normalizeDate(ep.startDate)
      : "";
    const endDate = ep.endDate && isValidDateStr(ep.endDate)
      ? normalizeDate(ep.endDate)
      : "";

    const originalAmount = toTaxExclusive(ep.originalAmount ?? 0);
    const contractAmount = toTaxExclusive(ep.contractAmount ?? originalAmount);

    const payments = (ep.payments || []).map((pay) => ({
      id: pay.id || genId(),
      date: pay.date && isValidDateStr(pay.date) ? pay.date : "",
      amount: toTaxExclusive(pay.amount ?? 0),
      note: pay.note ?? "",
    }));

    return {
      id: genId(),
      name: ep.name || "（無題）",
      client: ep.client || "",
      category: ep.category === "工事" || ep.category === "業務" ? ep.category : "業務",
      contractAmount,
      originalAmount,
      budget: ep.budget != null ? toTaxExclusive(ep.budget) : contractAmount,
      status: ep.status || "ordered",
      startDate,
      endDate,
      progress: Math.min(100, Math.max(0, ep.progress ?? 0)),
      billedAmount: toTaxExclusive(ep.billedAmount ?? 0),
      paidAmount: toTaxExclusive(ep.paidAmount ?? 0),
      notes: notesParts.length > 0 ? notesParts.join("\n\n") : undefined,
      mode,
      marginRate: ep.marginRate ?? 0,
      subcontractAmount: toTaxExclusive(ep.subcontractAmount ?? 0),
      subcontractVendor: ep.subcontractVendor ?? "",
      payments,
      changes,
      archived: false,
      deleted: false,
    };
  });
}

export function parseExcelImportJson(text: string): Project[] {
  const parsed = JSON.parse(text) as { projects?: ExcelProject[] };
  const projects = parsed?.projects ?? [];
  return convertExcelProjectsToApp(projects);
}
