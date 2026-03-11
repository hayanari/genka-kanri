/**
 * データ保護: localStorage バックアップ・復元・ガード
 */
import type { Project, Cost, Quantity, Vehicle, BidSchedule, ProcessMaster } from "./utils";

const BACKUP_KEY = "genka_kanri_backup";
const BACKUP_TIMESTAMP_KEY = "genka_kanri_backup_at";
const LAST_REMOTE_COUNT_KEY = "genka_kanri_last_remote_count";
const LAST_REMOTE_BACKUP_AT_KEY = "genka_kanri_last_remote_backup_at";

export type BackupData = {
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
  vehicles?: { id: string; registration: string }[];
  processMasters?: ProcessMaster[];
  bidSchedules?: BidSchedule[];
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

/** localStorage にバックアップを保存 */
export function saveLocalBackup(data: BackupData): void {
  try {
    const payload = JSON.stringify({
      projects: data.projects,
      costs: data.costs,
      quantities: data.quantities,
      vehicles: data.vehicles ?? [],
      processMasters: data.processMasters ?? [],
      bidSchedules: data.bidSchedules ?? [],
    });
    localStorage.setItem(BACKUP_KEY, payload);
    localStorage.setItem(BACKUP_TIMESTAMP_KEY, new Date().toISOString());
  } catch (e) {
    console.warn("[backup] saveLocalBackup failed:", e);
  }
}

/** localStorage からバックアップを読み込み */
export function loadLocalBackup(): BackupData | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidBackup(parsed)) return null;
    return parsed as BackupData;
  } catch {
    return null;
  }
}

/** バックアップの日時を取得 */
export function getBackupTimestamp(): string | null {
  try {
    return localStorage.getItem(BACKUP_TIMESTAMP_KEY);
  } catch {
    return null;
  }
}

/** リモート（Supabase）から読み込んだ件数を記録（空データ上書き防止に使用） */
export function setLastRemoteCount(projects: number, costs: number, quantities: number): void {
  try {
    localStorage.setItem(
      LAST_REMOTE_COUNT_KEY,
      JSON.stringify({ projects, costs, quantities })
    );
  } catch {}
}

/** 前回のリモート件数を取得 */
export function getLastRemoteCount(): { projects: number; costs: number; quantities: number } | null {
  try {
    const raw = localStorage.getItem(LAST_REMOTE_COUNT_KEY);
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
export function isDangerousOverwrite(data: BackupData): boolean {
  const prev = getLastRemoteCount();
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
