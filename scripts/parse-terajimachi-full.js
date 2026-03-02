const XLSX = require("xlsx");
const path = require("path");

const fp = path.join(
  process.env.USERPROFILE || "",
  "OneDrive - 株式会社トキト",
  "２階共有", "入札情報", "役所", "さ", "堺市", "上下水道局",
  "令和7年度", "工事", "寺地町東ほか下水管改築工事（７－２１）（詳細設計付）（その２）",
  "編集前", "設計書.xlsx"
);

const isDiameter = (s) => /^φ\d+(mm)?$/.test(s);
const isHeader = (s) =>
  /^(工事費内訳|国費|工事区分|単位|数量|単価|金額|摘要)/.test(s) || s === "式";

try {
  const wb = XLSX.readFile(fp);
  const sh = wb.Sheets["内訳1"] || wb.Sheets["内訳"] || wb.Sheets["内訳(工事)"];
  if (!sh) {
    console.log("内訳 sheet not found");
    process.exit(1);
  }

  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });
  const rows = [];
  let curKosyu = "", curShubetsu = "";

  for (let i = 0; i < data.length; i++) {
    const row = data[i] || [];
    const c1 = (row[1] || "").toString().trim();
    const c2 = (row[2] || "").toString().trim();
    const c5 = (row[5] || "").toString().trim();

    if (c1 && !isHeader(c1)) { curKosyu = c1; curShubetsu = ""; }
    if (c2 && !c1 && !isHeader(c2)) curShubetsu = c2;
    if (c5 && !isHeader(c5) && !isDiameter(c5)) {
      rows.push({ kosyu: curKosyu, shubetsu: curShubetsu || "(全体)", saimoku: c5 });
    }
  }

  const kosyuMap = new Map();
  for (const r of rows) {
    if (!r.kosyu) continue;
    if (!kosyuMap.has(r.kosyu)) kosyuMap.set(r.kosyu, new Map());
    const shMap = kosyuMap.get(r.kosyu);
    if (!shMap.has(r.shubetsu)) shMap.set(r.shubetsu, []);
    shMap.get(r.shubetsu).push(r.saimoku);
  }

  console.log("=== 寺地町東 内訳(工事) 全工種 ===\n");
  for (const [kosyu, shMap] of kosyuMap) {
    console.log("【" + kosyu + "】");
    for (const [shubetsu, items] of shMap) {
      const uniq = [...new Set(items)];
      console.log("  " + shubetsu + ": " + uniq.join(", "));
    }
    console.log("");
  }
} catch (e) {
  console.error(e.message);
}
