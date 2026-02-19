import { createClient } from "./client";
import type { Project, Cost, Quantity } from "../utils";
import { createSampleData } from "../utils";

export async function loadData(): Promise<{
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
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
    } | null;

    if (!stored?.projects?.length && !stored?.costs?.length && !stored?.quantities?.length) {
      return createSampleData();
    }

    return {
      projects: (stored.projects ?? []) as Project[],
      costs: (stored.costs ?? []) as Cost[],
      quantities: (stored.quantities ?? []) as Quantity[],
    };
  } catch {
    return createSampleData();
  }
}

export async function saveData(data: {
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
}): Promise<boolean> {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("genka_kanri_data")
      .upsert(
        { id: "default", data, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    return !error;
  } catch {
    return false;
  }
}
