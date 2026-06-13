/* eslint-disable no-console */
// 三方マージの動作確認用スクリプト: npx tsx scripts/test-merge.ts
import { mergeCollection } from "../lib/mergeData";

type Item = { id: string; name: string; updatedAt?: string };

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`OK  ${label}`);
  } else {
    failed++;
    console.error(`NG  ${label}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

const base: Item[] = [
  { id: "1", name: "A" },
  { id: "2", name: "B" },
  { id: "3", name: "C" },
];

// 1. 双方が別レコードを追加 → 両方残る
{
  const local = [...base, { id: "L", name: "localAdd" }];
  const remote = [...base, { id: "R", name: "remoteAdd" }];
  const merged = mergeCollection(base, local, remote);
  check(
    "双方追加",
    merged.map((x) => x.id).sort(),
    ["1", "2", "3", "L", "R"]
  );
}

// 2. 自分が編集、相手は別レコードを編集 → 両方の編集が残る
{
  const local = base.map((x) => (x.id === "1" ? { ...x, name: "A-local" } : x));
  const remote = base.map((x) => (x.id === "2" ? { ...x, name: "B-remote" } : x));
  const merged = mergeCollection(base, local, remote);
  check(
    "別レコード編集",
    merged.map((x) => x.name),
    ["A-local", "B-remote", "C"]
  );
}

// 3. 自分が削除、相手は未変更 → 削除が適用される
{
  const local = base.filter((x) => x.id !== "3");
  const merged = mergeCollection(base, local, base);
  check("自分の削除", merged.map((x) => x.id), ["1", "2"]);
}

// 4. 自分が削除、相手が同レコードを編集 → 編集が優先で残る
{
  const local = base.filter((x) => x.id !== "3");
  const remote = base.map((x) => (x.id === "3" ? { ...x, name: "C-edited" } : x));
  const merged = mergeCollection(base, local, remote);
  check(
    "削除 vs 編集",
    merged.find((x) => x.id === "3")?.name,
    "C-edited"
  );
}

// 5. 両方が同じレコードを編集 → updatedAt が新しい方
{
  const b: Item[] = [{ id: "1", name: "A", updatedAt: "2026-06-01" }];
  const local: Item[] = [{ id: "1", name: "A-local", updatedAt: "2026-06-10" }];
  const remote: Item[] = [{ id: "1", name: "A-remote", updatedAt: "2026-06-12" }];
  const merged = mergeCollection(b, local, remote);
  check("同一レコード編集(updatedAtが新しい方)", merged[0].name, "A-remote");
}

// 6. 相手が削除、自分は未変更 → 削除が適用される
{
  const remote = base.filter((x) => x.id !== "2");
  const merged = mergeCollection(base, base, remote);
  check("相手の削除", merged.map((x) => x.id), ["1", "3"]);
}

if (failed > 0) {
  console.error(`\n${failed}件失敗`);
  process.exit(1);
}
console.log("\n全テスト成功");
