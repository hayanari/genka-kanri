// ================================================================
// lib/mergeData.ts
// 同時編集対策: 三方マージ（base = 自分が最後に同期した状態 /
// local = 自分の現在の状態 / remote = サーバーの最新状態）
//
// ルール（IDを持つレコード単位で統合）:
// - 自分だけが変更 → 自分の変更を採用
// - 相手だけが変更 → 相手の変更を採用
// - 両方が同じレコードを変更 → updatedAt があれば新しい方、なければ自分を採用
// - 追加はどちらの分も残す / 削除は「変更していない側の削除」だけ適用
// ================================================================
import type {
  Project,
  Cost,
  Quantity,
  Vehicle,
  BidSchedule,
  ProcessMaster,
  EquipmentRequest,
} from "./utils";

export interface GenkaDataSet {
  projects: Project[];
  costs: Cost[];
  quantities: Quantity[];
  vehicles: Vehicle[];
  processMasters: ProcessMaster[];
  bidSchedules: BidSchedule[];
  equipmentRequests: EquipmentRequest[];
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function pickBothModified<T extends { id: string }>(localItem: T, remoteItem: T): T {
  const lu = (localItem as { updatedAt?: string }).updatedAt;
  const ru = (remoteItem as { updatedAt?: string }).updatedAt;
  if (lu && ru) return lu >= ru ? localItem : remoteItem;
  // タイムスタンプが無い場合は「いま保存しようとしている人」を優先
  return localItem;
}

/** IDを持つ配列の三方マージ */
export function mergeCollection<T extends { id: string }>(
  base: T[],
  local: T[],
  remote: T[]
): T[] {
  const baseMap = new Map(base.map((x) => [x.id, x]));
  const localMap = new Map(local.map((x) => [x.id, x]));
  const remoteMap = new Map(remote.map((x) => [x.id, x]));
  const result: T[] = [];
  const added = new Set<string>();
  const push = (item: T) => {
    if (!added.has(item.id)) {
      result.push(item);
      added.add(item.id);
    }
  };

  // remote の並び順をベースに統合
  for (const remoteItem of remote) {
    const id = remoteItem.id;
    const baseItem = baseMap.get(id);
    const localItem = localMap.get(id);
    if (localItem !== undefined) {
      if (baseItem === undefined) {
        // 双方が同じIDを追加（通常起きない）→ ローカル優先
        push(localItem);
      } else if (eq(localItem, baseItem)) {
        push(remoteItem); // 自分は未変更 → 相手の変更を採用
      } else if (eq(remoteItem, baseItem)) {
        push(localItem); // 相手は未変更 → 自分の変更を採用
      } else {
        push(pickBothModified(localItem, remoteItem));
      }
    } else {
      // ローカルに無い
      if (baseItem === undefined) {
        push(remoteItem); // 相手が追加 → 残す
      } else if (!eq(remoteItem, baseItem)) {
        push(remoteItem); // 自分が削除したが相手が変更 → 変更を優先して残す
      }
      // 自分が削除し相手は未変更 → 削除を適用（追加しない）
    }
  }

  // ローカルだけにあるもの
  for (const localItem of local) {
    if (added.has(localItem.id)) continue;
    const baseItem = baseMap.get(localItem.id);
    if (baseItem === undefined) {
      push(localItem); // 自分が追加 → 残す
    } else if (!eq(localItem, baseItem)) {
      push(localItem); // 相手が削除したが自分が変更 → 変更を優先して残す
    }
    // 相手が削除し自分は未変更 → 削除を適用
  }

  return result;
}

/** 案件管理データ全体の三方マージ */
export function mergeGenkaData(
  base: GenkaDataSet,
  local: GenkaDataSet,
  remote: GenkaDataSet
): GenkaDataSet {
  return {
    projects: mergeCollection(base.projects, local.projects, remote.projects),
    costs: mergeCollection(base.costs, local.costs, remote.costs),
    quantities: mergeCollection(base.quantities, local.quantities, remote.quantities),
    vehicles: mergeCollection(base.vehicles, local.vehicles, remote.vehicles),
    processMasters: mergeCollection(
      base.processMasters,
      local.processMasters,
      remote.processMasters
    ),
    bidSchedules: mergeCollection(base.bidSchedules, local.bidSchedules, remote.bidSchedules),
    equipmentRequests: mergeCollection(
      base.equipmentRequests,
      local.equipmentRequests,
      remote.equipmentRequests
    ),
  };
}
