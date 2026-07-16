/**
 * Supabase リモートバックアップ: 作成・一覧・復元
 */
import { createClient } from "./client";
import type { BackupData } from "../backup";
import { loadScheduleData, saveScheduleData } from "@/lib/scheduleStorage";
import { requireCompanyId } from "@/lib/tenant";
import { BACKUP_KIND_LABELS } from "@/lib/dataProtection";

export type BackupKind = "manual" | "auto" | "daily" | "pre_write" | "pre_restore";

export type RemoteBackupItem = {
  id: string;
  created_at: string;
  created_by: string | null;
  kind: BackupKind | string;
  kindLabel: string;
  data: BackupData;
  /** サマリ（件数表示用） */
  summary: { projects: number; costs: number; quantities: number; schedule: number };
};

const BACKUPS_TABLE = "genka_kanri_backups";

/** リモートバックアップを作成（工事スケジュール含む） */
export async function createRemoteBackup(
  data: BackupData,
  kind: BackupKind = "manual"
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const supabase = createClient();
    const companyId = await requireCompanyId();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const schedule = await loadScheduleData();
    const payload: Record<string, unknown> = {
      company_id: companyId,
      data: {
        projects: data.projects,
        costs: data.costs,
        quantities: data.quantities,
        vehicles: data.vehicles ?? [],
        processMasters: data.processMasters ?? [],
        bidSchedules: data.bidSchedules ?? [],
        schedule: schedule ?? { workers: [], schedules: [], dayMemos: {} },
      },
      created_by: user?.email ?? null,
    };
    if (kind !== "manual") {
      payload.kind = kind;
    } else {
      payload.kind = "manual";
    }

    let { data: row, error } = await supabase
      .from(BACKUPS_TABLE)
      .insert(payload)
      .select("id")
      .single();

    // kind 列未適用時は kind なしで再試行
    if (error && /kind/i.test(error.message)) {
      delete payload.kind;
      const retry = await supabase.from(BACKUPS_TABLE).insert(payload).select("id").single();
      row = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error("[createRemoteBackup]", error);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: row!.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** リモートバックアップ一覧を取得（新しい順、最大80件） */
export async function listRemoteBackups(): Promise<RemoteBackupItem[]> {
  try {
    const supabase = createClient();
    const companyId = await requireCompanyId();
    const { data, error } = await supabase
      .from(BACKUPS_TABLE)
      .select("id, created_at, created_by, data, kind")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      // kind 列未適用環境向けフォールバック
      if (/kind/i.test(error.message)) {
        const fallback = await supabase
          .from(BACKUPS_TABLE)
          .select("id, created_at, created_by, data")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(80);
        if (fallback.error) {
          console.error("[listRemoteBackups]", fallback.error);
          return [];
        }
        return (fallback.data ?? []).map((r) => {
          const d = (r.data ?? {}) as BackupData;
          const sched = d.schedule;
          return {
            id: r.id,
            created_at: r.created_at,
            created_by: r.created_by ?? null,
            kind: "manual",
            kindLabel: BACKUP_KIND_LABELS.manual,
            data: d,
            summary: {
              projects: d.projects?.length ?? 0,
              costs: d.costs?.length ?? 0,
              quantities: d.quantities?.length ?? 0,
              schedule: sched?.schedules?.length ?? 0,
            },
          };
        });
      }
      console.error("[listRemoteBackups]", error);
      return [];
    }

    return (data ?? []).map((r) => {
      const d = (r.data ?? {}) as BackupData;
      const sched = d.schedule;
      const kind = (r.kind as string) || "manual";
      return {
        id: r.id,
        created_at: r.created_at,
        created_by: r.created_by ?? null,
        kind,
        kindLabel: BACKUP_KIND_LABELS[kind] ?? kind,
        data: d,
        summary: {
          projects: d.projects?.length ?? 0,
          costs: d.costs?.length ?? 0,
          quantities: d.quantities?.length ?? 0,
          schedule: sched?.schedules?.length ?? 0,
        },
      };
    });
  } catch (e) {
    console.error("[listRemoteBackups]", e);
    return [];
  }
}

/** バックアップを復元（API経由で破壊ガードを安全に解除） */
export async function restoreRemoteBackup(
  item: Pick<RemoteBackupItem, "id" | "data">
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { ok: false, error: "ログインが必要です" };
    }

    const res = await fetch("/api/data/restore", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ backupId: item.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: json.error || "復元に失敗しました" };
    }

    if (item.data.schedule) {
      const s = item.data.schedule;
      if (
        (s.schedules?.length ?? 0) > 0 ||
        (s.workers?.length ?? 0) > 0 ||
        Object.keys(s.dayMemos ?? {}).length > 0
      ) {
        await saveScheduleData(s);
      }
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "復元に失敗しました" };
  }
}
