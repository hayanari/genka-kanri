import { createClient } from "./client";
import type { Project, Cost, Quantity, Vehicle, BidSchedule, ProcessMaster } from "../utils";
import { createEmptyData, DEFAULT_VEHICLES, DEFAULT_PROCESS_MASTERS, ensureManagementNumbers, toStoredPersonName } from "../utils";
import {
  saveLocalBackup,
  loadLocalBackup,
  loadDataPending,
  clearDataPending,
  setLastRemoteCount,
  isDangerousOverwrite,
} from "../backup";
import type { BackupData } from "../backup";

/** データ消失を防ぐ: 空の projects/vehicles を保存しない */
function sanitizeBeforeSave(data: {
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
  vehicles?: { id: string; registration: string }[];
  processMasters?: ProcessMaster[];
  bidSchedules?: BidSchedule[];
}) {
  const empty = createEmptyData();
  const projects =
    Array.isArray(data.projects) && data.projects.length > 0 ? data.projects : empty.projects;
  const vehicles =
    Array.isArray(data.vehicles) && data.vehicles.length > 0 ? data.vehicles : empty.vehicles;
  const processMasters =
    Array.isArray(data.processMasters) && data.processMasters.length > 0 ? data.processMasters : empty.processMasters;
  const bidSchedules = Array.isArray(data.bidSchedules) ? data.bidSchedules : [];
  return {
    projects,
    costs: data.costs ?? [],
    quantities: data.quantities ?? [],
    vehicles,
    processMasters,
    bidSchedules,
  };
}

export async function loadData(): Promise<{
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
  vehicles: Vehicle[];
  processMasters: ProcessMaster[];
  bidSchedules: BidSchedule[];
} | null> {
  try {
    const pending = loadDataPending();
    if (pending) {
      const result = await saveData({
        projects: pending.projects,
        costs: pending.costs,
        quantities: pending.quantities,
        vehicles: pending.vehicles,
        processMasters: pending.processMasters,
        bidSchedules: pending.bidSchedules,
      }, { force: true });
      if (result.ok) {
        clearDataPending();
        return {
          projects: pending.projects,
          costs: pending.costs,
          quantities: pending.quantities,
          vehicles: pending.vehicles as Vehicle[],
          processMasters: (pending.processMasters ?? []) as ProcessMaster[],
          bidSchedules: pending.bidSchedules ?? [],
        };
      }
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("genka_kanri_data")
      .select("data")
      .eq("id", "default")
      .single();

    if (error) throw error;
    const stored = data?.data as {
      projects?: unknown[];
      costs?: unknown[];
      quantities?: unknown[];
      vehicles?: Vehicle[];
      processMasters?: ProcessMaster[];
      bidSchedules?: BidSchedule[];
    } | null;

    if (!stored?.projects?.length && !stored?.costs?.length && !stored?.quantities?.length && !stored?.bidSchedules?.length) {
      return createEmptyData();
    }

    const vehicles = (stored.vehicles ?? DEFAULT_VEHICLES) as Vehicle[];
    let processMasters = (stored.processMasters ?? DEFAULT_PROCESS_MASTERS) as ProcessMaster[];
    const storedIds = new Set(processMasters.map((m) => m.id));
    const toAdd = DEFAULT_PROCESS_MASTERS.filter((m) => !storedIds.has(m.id));
    if (toAdd.length > 0) processMasters = [...processMasters, ...toAdd];
    let projects = (stored.projects ?? []) as Project[];
    projects = projects.map((p) => {
      const base = p.category === "清掃業務" ? { ...p, category: "業務" } : p;
      return {
        ...base,
        personInCharge: toStoredPersonName(p.personInCharge),
      };
    });
    projects = ensureManagementNumbers(projects);
    const bidSchedules = (stored.bidSchedules ?? []) as BidSchedule[];
    const result = {
      projects,
      costs: (stored.costs ?? []) as Cost[],
      quantities: (stored.quantities ?? []) as Quantity[],
      vehicles: Array.isArray(vehicles) && vehicles.length > 0 ? vehicles : DEFAULT_VEHICLES,
      processMasters: Array.isArray(processMasters) && processMasters.length > 0 ? processMasters : DEFAULT_PROCESS_MASTERS,
      bidSchedules,
    };
    setLastRemoteCount(result.projects.length, result.costs.length, result.quantities.length);
    return result;
  } catch (e) {
    console.error("[loadData] Error:", e);
    return null;
  }
}

/** loadData が失敗した際の localStorage フォールバック */
export function loadFromLocalBackup(): BackupData | null {
  return loadLocalBackup();
}

export type SaveResult = { ok: true } | { ok: false; reason: "guard" | "error" };

export async function saveData(
  data: {
    projects: Project[];
    costs: Cost[];
    quantities: Quantity[];
    vehicles?: { id: string; registration: string }[];
    processMasters?: ProcessMaster[];
    bidSchedules?: BidSchedule[];
  },
  options?: { force?: boolean }
): Promise<SaveResult> {
  try {
    const sanitized = sanitizeBeforeSave(data);
    const backupPayload = {
      projects: sanitized.projects,
      costs: sanitized.costs,
      quantities: sanitized.quantities,
      vehicles: sanitized.vehicles,
      processMasters: sanitized.processMasters,
      bidSchedules: sanitized.bidSchedules,
    };

    if (!options?.force && isDangerousOverwrite(backupPayload)) {
      console.warn("[saveData] ガード: 空データでの上書きをブロック");
      return { ok: false, reason: "guard" };
    }

    const supabase = createClient();
    const payload = {
      projects: backupPayload.projects,
      costs: backupPayload.costs,
      quantities: backupPayload.quantities,
      vehicles: backupPayload.vehicles,
      processMasters: backupPayload.processMasters,
      bidSchedules: backupPayload.bidSchedules,
    };

    const maxRetries = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const { error } = await supabase
        .from("genka_kanri_data")
        .upsert(
          { id: "default", data: payload, updated_at: new Date().toISOString() },
          { onConflict: "id" }
        );

      if (!error) {
        saveLocalBackup(backupPayload);
        setLastRemoteCount(
          sanitized.projects.length,
          sanitized.costs.length,
          sanitized.quantities.length
        );
        return { ok: true };
      }
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    console.error("[saveData] Supabase error after retries:", lastError);
    saveLocalBackup(backupPayload);
    return { ok: false, reason: "error" };
  } catch (e) {
    console.error("[saveData] Error:", e);
    saveLocalBackup({
      projects: data.projects,
      costs: data.costs,
      quantities: data.quantities,
      vehicles: data.vehicles,
      processMasters: data.processMasters,
      bidSchedules: data.bidSchedules,
    });
    return { ok: false, reason: "error" };
  }
}
