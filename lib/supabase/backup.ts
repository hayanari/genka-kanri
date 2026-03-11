/**
 * Supabase リモートバックアップ: 作成・一覧・復元
 */
import { createClient } from "./client";
import type { BackupData } from "../backup";
import { saveData } from "./data";

export type RemoteBackupItem = {
  id: string;
  created_at: string;
  created_by: string | null;
  data: BackupData;
  /** サマリ（件数表示用） */
  summary: { projects: number; costs: number; quantities: number };
};

const BACKUPS_TABLE = "genka_kanri_backups";

/** リモートバックアップを作成 */
export async function createRemoteBackup(data: BackupData): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      data: {
        projects: data.projects,
        costs: data.costs,
        quantities: data.quantities,
        vehicles: data.vehicles ?? [],
        processMasters: data.processMasters ?? [],
        bidSchedules: data.bidSchedules ?? [],
      },
      created_by: user?.email ?? null,
    };

    const { data: row, error } = await supabase
      .from(BACKUPS_TABLE)
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      console.error("[createRemoteBackup]", error);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: row.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** リモートバックアップ一覧を取得（新しい順、最大50件） */
export async function listRemoteBackups(): Promise<RemoteBackupItem[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from(BACKUPS_TABLE)
      .select("id, created_at, created_by, data")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[listRemoteBackups]", error);
      return [];
    }

    return (data ?? []).map((r) => {
      const d = (r.data ?? {}) as BackupData;
      return {
        id: r.id,
        created_at: r.created_at,
        created_by: r.created_by ?? null,
        data: d,
        summary: {
          projects: d.projects?.length ?? 0,
          costs: d.costs?.length ?? 0,
          quantities: d.quantities?.length ?? 0,
        },
      };
    });
  } catch (e) {
    console.error("[listRemoteBackups]", e);
    return [];
  }
}

/** バックアップを復元（genka_kanri_data を上書き） */
export async function restoreRemoteBackup(
  backupData: BackupData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await saveData(
    {
      projects: backupData.projects,
      costs: backupData.costs,
      quantities: backupData.quantities,
      vehicles: backupData.vehicles,
      processMasters: backupData.processMasters,
      bidSchedules: backupData.bidSchedules,
    },
    { force: true }
  );

  if (!result.ok) {
    return {
      ok: false,
      error: result.reason === "guard" ? "データ保護のため復元をキャンセルしました" : "復元に失敗しました",
    };
  }
  return { ok: true };
}
