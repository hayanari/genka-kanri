#!/usr/bin/env node
/**
 * 数量表 Excel の構造を確認
 * node scripts/inspect-suryo.js [ファイルパス]
 */
const XLSX = require("xlsx");
const path = require("path");

const fp =
  process.argv[2] ||
  path.join(process.env.USERPROFILE || "", "Downloads", "数量表　事前調査工後.xlsx");

const wb = XLSX.readFile(fp);
const sh = wb.Sheets["数量表"] || wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });

console.log("=== ヘッダー行 (0-4) ===");
for (let r = 0; r < Math.min(5, data.length); r++) {
  const row = data[r] || [];
  console.log(`Row ${r}:`, row.slice(0, 60).map((c, i) => `[${i}]${c}`).join(" | "));
}

console.log("\n=== データ行サンプル (管理番号あり) ===");
for (let r = 4; r < Math.min(25, data.length); r++) {
  const row = data[r] || [];
  const mgmt = row[2];
  if (mgmt !== "" && mgmt !== undefined && String(mgmt).match(/^\d+$/)) {
    console.log(`Row ${r}:`, {
      mgmt: row[2],
      rosen: row[4],
      col10_15: row.slice(10, 25),
      col25_35: row.slice(25, 40),
    });
  }
}
