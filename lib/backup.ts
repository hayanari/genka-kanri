/**
 * データ保護: localStorage バックアップ・復元・ガード
 */
import type { Project, Cost, Quantity, Vehicle, BidSchedule, ProcessMaster } from "./utils";
import type { ScheduleData } from "@/types/schedule";

const BACKUP_KEY = "genka_kanri_backup";
const BACKUP_TIMESTAMP_KEY = "genka_kanri_backup_at";
const LAST_REMOTE_COUNT_KEY = "genka_kanri_last_remote_count";
const LAST_REMOTE_BACKUP_AT_KEY = "genka_kanri_last_remote_backup_at";
const DATA_PENDING_KEY = "genka_kanri_data_pending";
const PENDING_TTL_MS = 15_000; // 15秒以内のバックアップのみ復元

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
      schedule: data.schedule ?? { workers: [], schedules: [], dayMemos: {} },
    });
    localStorage.setItem(BACKUP_KEY, payload);
    localStorage.setItem(BACKUP_TIMESTAMP_KEY, new Date().toISOString());
  } catch (e) {
    console.warn("[backup] saveLocalBackup failed:", e);
  }
}

/** リロード対策: beforeunload で同期的に sessionStorage へ保存 */
export function saveDataPendingSync(data: Omit<BackupData, "schedule">): void {
  try {
    sessionStorage.setItem(DATA_PENDING_KEY, JSON.stringify({
      projects: data.projects,
      costs: data.costs,
      quantities: data.quantities,
      vehicles: data.vehicles ?? [],
      processMasters: data.processMasters ?? [],
      bidSchedules: data.bidSchedules ?? [],
      ts: Date.now(),
    }));
  } catch {}
}

/** 直近で保存された未確定データがあれば返す（リロード直後の復元用） */
export function loadDataPending(): (Omit<BackupData, "schedule"> & { vehicles: { id: string; registration: string }[] }) | null {
  try {
    const raw = sessionStorage.getItem(DATA_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { projects?: unknown[]; costs?: unknown[]; quantities?: unknown[]; vehicles?: unknown[]; processMasters?: unknown[]; bidSchedules?: unknown[]; ts?: number };
    if (!parsed?.ts || Date.now() - parsed.ts > PENDING_TTL_MS) {
      try { sessionStorage.removeItem(DATA_PENDING_KEY); } catch {}
      return null;
    }
    if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.costs) || !Array.isArray(parsed.quantities)) {
      try { sessionStorage.removeItem(DATA_PENDING_KEY); } catch {}
      return null;
    }
    return {
      projects: parsed.projects as BackupData["projects"],
      costs: parsed.costs as BackupData["costs"],
      quantities: parsed.quantities as BackupData["quantities"],
      vehicles: (parsed.vehicles ?? []) as { id: string; registration: string }[],
      processMasters: (parsed.processMasters ?? []) as BackupData["processMasters"],
      bidSchedules: (parsed.bidSchedules ?? []) as BackupData["bidSchedules"],
    };
  } catch {
    return null;
  }
}

/** pending データをクリア（保存成功後に呼ぶ） */
export function clearDataPending(): void {
  try {
    sessionStorage.removeItem(DATA_PENDING_KEY);
  } catch {}
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
