/**
 * データ保護: localStorage バックアップ・復元・ガード
 */
import type {
  Project,
  Cost,
  Quantity,
  Vehicle,
  BidSchedule,
  ProcessMaster,
} from "./utils";
import type { ScheduleData } from "@/types/schedule";

const BACKUP_KEY_PREFIX = "genka_kanri_backup";
const BACKUP_TIMESTAMP_KEY_PREFIX = "genka_kanri_backup_at";
const LAST_REMOTE_COUNT_KEY = "genka_kanri_last_remote_count";
const LAST_REMOTE_BACKUP_AT_KEY = "genka_kanri_last_remote_backup_at";
const DATA_PENDING_KEY_PREFIX = "genka_kanri_data_pending";
const PENDING_TTL_MS = 15_000; // 15秒以内のバックアップのみ復元

function backupKey(companyId?: string | null): string {
  return companyId ? `${BACKUP_KEY_PREFIX}:${companyId}` : BACKUP_KEY_PREFIX;
}
function backupTsKey(companyId?: string | null): string {
  return companyId ? `${BACKUP_TIMESTAMP_KEY_PREFIX}:${companyId}` : BACKUP_TIMESTAMP_KEY_PREFIX;
}
function pendingKey(companyId?: string | null): string {
  return companyId ? `${DATA_PENDING_KEY_PREFIX}:${companyId}` : DATA_PENDING_KEY_PREFIX;
}

export type BackupData = {
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
  vehicles?: { id: string; registration: string }[];
  processMasters?: ProcessMaster[];
  bidSchedules?: BidSchedule[];
  /** 工事スケジュール（予定・作業員・日次メモ） */
  schedule?: ScheduleData;
};

function isValidBackup(raw: unknown): raw is BackupData {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    Array.isArray(o.projects) &&
    Array.isArray(o.costs) &&
    Array.isArray(o.quantities)
  );
}

/** localStorage にバックアップを保存（会社単位） */
export function saveLocalBackup(data: BackupData, companyId?: string | null): void {
  try {
    const payload = JSON.stringify({
      projects: data.projects,
      costs: data.costs,
      quantities: data.quantities,
      vehicles: data.vehicles ?? [],
      processMasters: data.processMasters ?? [],
      bidSchedules: data.bidSchedules ?? [],
      schedule: data.schedule ?? { workers: [], schedules: [], dayMemos: {} },
      companyId: companyId ?? null,
    });
    localStorage.setItem(backupKey(companyId), payload);
    localStorage.setItem(backupTsKey(companyId), new Date().toISOString());
  } catch (e) {
    console.warn("[backup] saveLocalBackup failed:", e);
  }
}

/**
 * リロード対策: beforeunload で同期的に sessionStorage へ保存。
 * base（最後にサーバーと同期した状態）も一緒に保存し、
 * 復元時にサーバー最新と三方マージできるようにする（同時編集対策）
 */
export function saveDataPendingSync(
  data: Omit<BackupData, "schedule">,
  base?: Omit<BackupData, "schedule"> | null,
  companyId?: string | null
): void {
  try {
    sessionStorage.setItem(pendingKey(companyId), JSON.stringify({
      projects: data.projects,
      costs: data.costs,
      quantities: data.quantities,
      vehicles: data.vehicles ?? [],
      processMasters: data.processMasters ?? [],
      bidSchedules: data.bidSchedules ?? [],
      base: base ?? null,
      companyId: companyId ?? null,
      ts: Date.now(),
    }));
  } catch {}
}

export type PendingData = Omit<BackupData, "schedule"> & {
  vehicles: { id: string; registration: string }[];
};

/** 直近で保存された未確定データがあれば返す（リロード直後の復元用） */
export function loadDataPending(companyId?: string | null): { data: PendingData; base: PendingData | null } | null {
  try {
    // 会社スコープ必須。他社・旧キーへのフォールバックはしない（誤上書き防止）
    const raw = sessionStorage.getItem(pendingKey(companyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      projects?: unknown[];
      costs?: unknown[];
      quantities?: unknown[];
      vehicles?: unknown[];
      processMasters?: unknown[];
      bidSchedules?: unknown[];
      base?: Record<string, unknown> | null;
      companyId?: string | null;
      ts?: number;
    };
    if (!parsed?.ts || Date.now() - parsed.ts > PENDING_TTL_MS) {
      try {
        sessionStorage.removeItem(pendingKey(companyId));
      } catch {}
      return null;
    }
    // 会社IDが食い違う / 未記録の pending は捨てる
    if (companyId && parsed.companyId !== companyId) {
      try {
        sessionStorage.removeItem(pendingKey(companyId));
      } catch {}
      return null;
    }
    if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.costs) || !Array.isArray(parsed.quantities)) {
      try {
        sessionStorage.removeItem(pendingKey(companyId));
      } catch {}
      return null;
    }
    const toPending = (o: Record<string, unknown>): PendingData => ({
      projects: (o.projects ?? []) as BackupData["projects"],
      costs: (o.costs ?? []) as BackupData["costs"],
      quantities: (o.quantities ?? []) as BackupData["quantities"],
      vehicles: (o.vehicles ?? []) as { id: string; registration: string }[],
      processMasters: (o.processMasters ?? []) as BackupData["processMasters"],
      bidSchedules: (o.bidSchedules ?? []) as BackupData["bidSchedules"],
    });
    const baseRaw = parsed.base;
    const base =
      baseRaw && Array.isArray(baseRaw.projects) ? toPending(baseRaw) : null;
    return { data: toPending(parsed as Record<string, unknown>), base };
  } catch {
    return null;
  }
}

/** pending データをクリア（保存成功後に呼ぶ） */
export function clearDataPending(companyId?: string | null): void {
  try {
    sessionStorage.removeItem(pendingKey(companyId));
    if (companyId) sessionStorage.removeItem(pendingKey(null));
  } catch {}
}

/** localStorage からバックアップを読み込み */
export function loadLocalBackup(companyId?: string | null): BackupData | null {
  try {
    const raw = localStorage.getItem(backupKey(companyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BackupData & { companyId?: string | null };
    if (!isValidBackup(parsed)) return null;
    if (companyId && parsed.companyId !== companyId) return null;
    return parsed as BackupData;
  } catch {
    return null;
  }
}

/** バックアップの日時を取得 */
export function getBackupTimestamp(companyId?: string | null): string | null {
  try {
    return localStorage.getItem(backupTsKey(companyId));
  } catch {
    return null;
  }
}

function remoteCountKey(companyId?: string | null): string {
  return companyId ? `${LAST_REMOTE_COUNT_KEY}:${companyId}` : LAST_REMOTE_COUNT_KEY;
}

/** リモート（Supabase）から読み込んだ件数を記録（空データ上書き防止に使用） */
export function setLastRemoteCount(
  projects: number,
  costs: number,
  quantities: number,
  companyId?: string | null
): void {
  try {
    localStorage.setItem(
      remoteCountKey(companyId),
      JSON.stringify({ projects, costs, quantities })
    );
  } catch {}
}

/** 前回のリモート件数を取得 */
export function getLastRemoteCount(
  companyId?: string | null
): { projects: number; costs: number; quantities: number } | null {
  try {
    const raw = localStorage.getItem(remoteCountKey(companyId));
    if (!raw) return null;
    const { projects, costs, quantities } = JSON.parse(raw) as {
      projects: number;
      costs: number;
      quantities: number;
    };
    return { projects, costs, quantities };
  } catch {
    return null;
  }
}

/** リモートバックアップ最終実行日時を記録 */
export function setLastRemoteBackupAt(): void {
  try {
    localStorage.setItem(LAST_REMOTE_BACKUP_AT_KEY, new Date().toISOString());
  } catch {}
}

/** リモートバックアップ最終実行日時を取得 */
export function getLastRemoteBackupAt(): string | null {
  try {
    return localStorage.getItem(LAST_REMOTE_BACKUP_AT_KEY);
  } catch {
    return null;
  }
}

/** 日次バックアップが必要か（24時間経過または未実行） */
export function shouldRunDailyBackup(): boolean {
  const last = getLastRemoteBackupAt();
  if (!last) return true;
  const elapsed = Date.now() - new Date(last).getTime();
  return elapsed >= 24 * 60 * 60 * 1000;
}

/** 空データでの上書きを検出（ガード） */
export function isDangerousOverwrite(
  data: BackupData,
  companyId?: string | null
): boolean {
  const prev = getLastRemoteCount(companyId);
  if (!prev) return false;
  const pCount = data.projects?.length ?? 0;
  const cCount = data.costs?.length ?? 0;
  const qCount = data.quantities?.length ?? 0;
  if (prev.projects >= 5 && pCount === 0) return true;
  if (prev.costs >= 10 && cCount === 0) return true;
  if (prev.quantities >= 10 && qCount === 0) return true;
  if (prev.projects >= 3 && pCount === 0 && prev.costs + prev.quantities > 0) return true;
  return false;
}
