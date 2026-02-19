import { createClient } from "./client";
import type { Project, Cost, Quantity, Vehicle } from "../utils";
import { createSampleData, DEFAULT_VEHICLES } from "../utils";

export async function loadData(): Promise<{
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
  vehicles: Vehicle[];
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
    } | null;

    if (!stored?.projects?.length && !stored?.costs?.length && !stored?.quantities?.length) {
      return createSampleData();
    }

    const vehicles = (stored.vehicles ?? DEFAULT_VEHICLES) as Vehicle[];
    return {
      projects: (stored.projects ?? []) as Project[],
      costs: (stored.costs ?? []) as Cost[],
      quantities: (stored.quantities ?? []) as Quantity[],
      vehicles: Array.isArray(vehicles) && vehicles.length > 0 ? vehicles : DEFAULT_VEHICLES,
    };
  } catch {
    return createSampleData();
  }
}

export async function saveData(data: {
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
  vehicles?: { id: string; registration: string }[];
}): Promise<boolean> {
  try {
    const supabase = createClient();
    const payload = {
      projects: data.projects,
      costs: data.costs,
      quantities: data.quantities,
      vehicles: data.vehicles ?? [],
    };
    const { error } = await supabase
      .from("genka_kanri_data")
      .upsert(
        { id: "default", data: payload, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    return !error;
  } catch {
    return false;
  }
}
