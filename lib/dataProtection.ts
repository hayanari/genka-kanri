/**
 * 商業向けデータ保護: 件数判定・危険上書き検出
 */

export type GenkaCounts = {
  projects: number;
  costs: number;
  quantities: number;
};

export function countGenkaPayload(data: {
  projects?: unknown[];
  costs?: unknown[];
  quantities?: unknown[];
} | null | undefined): GenkaCounts {
  return {
    projects: Array.isArray(data?.projects) ? data.projects.length : 0,
    costs: Array.isArray(data?.costs) ? data.costs.length : 0,
    quantities: Array.isArray(data?.quantities) ? data.quantities.length : 0,
  };
}

/**
 * 既存を空・急減で潰す操作か。
 * DBトリガーと同趣旨（クライアント側の先回りガード）
 */
export function isDestructiveGenkaOverwrite(
  existing: GenkaCounts,
  next: GenkaCounts
): boolean {
  if (existing.projects >= 3 && next.projects === 0) return true;
  if (existing.projects >= 10 && next.projects * 10 < existing.projects * 3) return true;
  if (existing.costs >= 20 && next.costs === 0 && next.projects < existing.projects) return true;
  if (existing.quantities >= 50 && next.quantities === 0 && next.projects < existing.projects) {
    return true;
  }
  return false;
}

export const BACKUP_KIND_LABELS: Record<string, string> = {
  manual: "手動",
  auto: "自動",
  daily: "日次",
  pre_write: "保存前",
  pre_restore: "復元前",
};
