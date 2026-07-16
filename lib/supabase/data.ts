import { createClient } from "./client";
import type {
  Project,
  Cost,
  Quantity,
  Vehicle,
  BidSchedule,
  ProcessMaster,
} from "../utils";
import { createEmptyData, DEFAULT_VEHICLES, DEFAULT_PROCESS_MASTERS, ensureManagementNumbers, toStoredPersonName } from "../utils";
import {
  saveLocalBackup,
  loadLocalBackup,
  loadDataPending,
  clearDataPending,
  setLastRemoteCount,
  isDangerousOverwrite,
} from "../backup";
import type { BackupData, PendingData } from "../backup";
import { mergeGenkaData } from "../mergeData";
import type { GenkaDataSet } from "../mergeData";
import { DEFAULT_COMPANY_ID, getCompanyDataId } from "../tenant";

/** 保存前の正規化。空配列も「全件削除した」意図した状態としてそのまま保存する（プリセットで置き換えない） */
function sanitizeBeforeSave(data: {
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
  vehicles?: { id: string; registration: string }[];
  processMasters?: ProcessMaster[];
  bidSchedules?: BidSchedule[];
}) {
  const empty = createEmptyData();
  const projects = Array.isArray(data.projects) ? data.projects : empty.projects;
  const vehicles = Array.isArray(data.vehicles) ? data.vehicles : empty.vehicles;
  const processMasters = Array.isArray(data.processMasters) ? data.processMasters : empty.processMasters;
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

/** 案件管理データのサーバー上の更新時刻（同時編集の検知用） */
export async function fetchGenkaDataRevision(): Promise<string | null> {
  try {
    const supabase = createClient();
    const dataId = await getCompanyDataId();
    const { data, error } = await supabase
      .from("genka_kanri_data")
      .select("updated_at")
      .eq("id", dataId)
      .maybeSingle();
    if (error) throw error;
    const ts = data?.updated_at;
    return typeof ts === "string" ? ts : null;
  } catch (e) {
    console.error("[fetchGenkaDataRevision]", e);
    return null;
  }
}

export type LoadedData = {
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
  vehicles: Vehicle[];
  processMasters: ProcessMaster[];
  bidSchedules: BidSchedule[];
};

const pendingToSet = (p: PendingData): GenkaDataSet => ({
  projects: p.projects ?? [],
  costs: p.costs ?? [],
  quantities: p.quantities ?? [],
  vehicles: (p.vehicles ?? []) as Vehicle[],
  processMasters: (p.processMasters ?? []) as ProcessMaster[],
  bidSchedules: p.bidSchedules ?? [],
});

export async function loadData(): Promise<LoadedData | null> {
  try {
    const pendingRes = loadDataPending();
    if (pendingRes) {
      // リロード直前の未保存データを復元。
      // base（最後に同期した状態）があれば、サーバー最新と三方マージして
      // 他の端末の変更を消さないようにする
      let payload: GenkaDataSet = pendingToSet(pendingRes.data);
      if (pendingRes.base) {
        try {
          const remote = await fetchRemoteData();
          if (remote) {
            payload = mergeGenkaData(
              pendingToSet(pendingRes.base),
              payload,
              remote as GenkaDataSet
            );
          }
        } catch {
          // リモート取得に失敗した場合は pending をそのまま保存
        }
      }
      const result = await saveData(payload, { force: true });
      if (result.ok) {
        clearDataPending();
        return payload as LoadedData;
      }
    }

    return await fetchRemoteData();
  } catch (e) {
    console.error("[loadData] Error:", e);
    return null;
  }
}

/** Supabase から案件データを取得・正規化 */
async function fetchRemoteData(): Promise<LoadedData | null> {
  try {
    const supabase = createClient();
    const dataId = await getCompanyDataId();
    let { data, error } = await supabase
      .from("genka_kanri_data")
      .select("data")
      .eq("id", dataId)
      .maybeSingle();

    // 移行直後: 自社行がまだ無く default だけある場合
    if (!data && dataId === DEFAULT_COMPANY_ID) {
      const fallback = await supabase
        .from("genka_kanri_data")
        .select("data")
        .eq("id", "default")
        .maybeSingle();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw error;
    if (!data) return createEmptyData();
    const stored = data?.data as {
      projects?: unknown[];
      costs?: unknown[];
      quantities?: unknown[];
      vehicles?: Vehicle[];
      processMasters?: ProcessMaster[];
      bidSchedules?: BidSchedule[];
    } | null;

    if (!stored) return createEmptyData();

    const vehicles: Vehicle[] =
      stored.vehicles === undefined || stored.vehicles === null
        ? [...DEFAULT_VEHICLES]
        : (stored.vehicles as Vehicle[]);

    let processMasters: ProcessMaster[];
    const rawPm = stored.processMasters;
    if (rawPm === undefined || rawPm === null) {
      processMasters = [...DEFAULT_PROCESS_MASTERS];
    } else if (Array.isArray(rawPm) && rawPm.length === 0) {
      processMasters = [];
    } else {
      processMasters = rawPm as ProcessMaster[];
      const storedIds = new Set(processMasters.map((m) => m.id));
      const toAdd = DEFAULT_PROCESS_MASTERS.filter((m) => !storedIds.has(m.id));
      if (toAdd.length > 0) processMasters = [...processMasters, ...toAdd];
    }
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
      vehicles: Array.isArray(vehicles) && vehicles.length > 0 ? vehicles : [],
      processMasters: Array.isArray(processMasters) && processMasters.length > 0 ? processMasters : DEFAULT_PROCESS_MASTERS,
      bidSchedules,
    };
    setLastRemoteCount(result.projects.length, result.costs.length, result.quantities.length);
    return result;
  } catch (e) {
    console.error("[fetchRemoteData] Error:", e);
    return null;
  }
}

/** loadData が失敗した際の localStorage フォールバック */
export function loadFromLocalBackup(): BackupData | null {
  return loadLocalBackup();
}

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "guard" | "error" | "forbidden" };

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
    // 閲覧専用ロールは保存不可
    const { canWrite } = await import("../roles");
    if (!(await canWrite())) {
      return { ok: false, reason: "forbidden" };
    }
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
    const dataId = await getCompanyDataId();
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
          { id: dataId, data: payload, updated_at: new Date().toISOString() },
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
