import { createClient } from "./client";
import type { Project, Cost, Quantity, Vehicle, BidSchedule, ProcessMaster } from "../utils";
import { createEmptyData, DEFAULT_VEHICLES, DEFAULT_PROCESS_MASTERS, ensureRegisteredProjects, ensureManagementNumbers } from "../utils";

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
}> {
  try {
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
    let projects = ensureRegisteredProjects((stored.projects ?? []) as Project[]);
    projects = projects.map((p) =>
      p.category === "清掃業務" ? { ...p, category: "業務" } : p
    );
    projects = ensureManagementNumbers(projects);
    const bidSchedules = (stored.bidSchedules ?? []) as BidSchedule[];
    return {
      projects,
      costs: (stored.costs ?? []) as Cost[],
      quantities: (stored.quantities ?? []) as Quantity[],
      vehicles: Array.isArray(vehicles) && vehicles.length > 0 ? vehicles : DEFAULT_VEHICLES,
      processMasters: Array.isArray(processMasters) && processMasters.length > 0 ? processMasters : DEFAULT_PROCESS_MASTERS,
      bidSchedules,
    };
  } catch {
    return createEmptyData();
  }
}

export async function saveData(data: {
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
  vehicles?: { id: string; registration: string }[];
  processMasters?: ProcessMaster[];
  bidSchedules?: BidSchedule[];
}): Promise<boolean> {
  try {
    const supabase = createClient();
    const sanitized = sanitizeBeforeSave(data);
    const payload = {
      projects: sanitized.projects,
      costs: sanitized.costs,
      quantities: sanitized.quantities,
      vehicles: sanitized.vehicles,
      processMasters: sanitized.processMasters,
      bidSchedules: sanitized.bidSchedules,
    };
    const { error } = await supabase
      .from("genka_kanri_data")
      .upsert(
        { id: "default", data: payload, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    if (error) {
      console.error("[saveData] Supabase error:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[saveData] Error:", e);
    return false;
  }
}
