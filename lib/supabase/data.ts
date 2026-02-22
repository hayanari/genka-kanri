import { createClient } from "./client";
import type { Project, Cost, Quantity, Vehicle, BidSchedule } from "../utils";
import { createEmptyData, DEFAULT_VEHICLES, ensureRegisteredProjects } from "../utils";

/** データ消失を防ぐ: 空の projects/vehicles を保存しない */
function sanitizeBeforeSave(data: {
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
  vehicles?: { id: string; registration: string }[];
  bidSchedules?: BidSchedule[];
}) {
  const empty = createEmptyData();
  const projects =
    Array.isArray(data.projects) && data.projects.length > 0 ? data.projects : empty.projects;
  const vehicles =
    Array.isArray(data.vehicles) && data.vehicles.length > 0 ? data.vehicles : empty.vehicles;
  const bidSchedules = Array.isArray(data.bidSchedules) ? data.bidSchedules : [];
  return {
    projects,
    costs: data.costs ?? [],
    quantities: data.quantities ?? [],
    vehicles,
    bidSchedules,
  };
}

export async function loadData(): Promise<{
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
  vehicles: Vehicle[];
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
      bidSchedules?: BidSchedule[];
    } | null;

    if (!stored?.projects?.length && !stored?.costs?.length && !stored?.quantities?.length) {
      return createEmptyData();
    }

    const vehicles = (stored.vehicles ?? DEFAULT_VEHICLES) as Vehicle[];
    let projects = ensureRegisteredProjects((stored.projects ?? []) as Project[]);
    projects = projects.map((p) =>
      p.category === "清掃業務" ? { ...p, category: "業務" } : p
    );
    const bidSchedules = (stored.bidSchedules ?? []) as BidSchedule[];
    return {
      projects,
      costs: (stored.costs ?? []) as Cost[],
      quantities: (stored.quantities ?? []) as Quantity[],
      vehicles: Array.isArray(vehicles) && vehicles.length > 0 ? vehicles : DEFAULT_VEHICLES,
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
