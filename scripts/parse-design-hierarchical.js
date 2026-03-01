/**
 * 設計書 内訳1 の階層（工種>種別>細目）を正確に解析
 */
const XLSX = require("xlsx");
const path = require("path");

const base = path.join(
  process.env.USERPROFILE || "",
  "OneDrive - 株式会社トキト",
  "２階共有", "入札情報", "役所", "さ", "堺市", "上下水道局",
  "令和7年度", "工事", "榎元町ほか下水管耐震化工事（７－２１）",
  "編集前", "設計書.xlsx"
);

const isDiameter = (s) => /^φ\d+$/.test(s);
const isHeader = (s) => /^(工事費内訳|国費|工事区分|単位|数量|単価|金額|摘要)/.test(s) || s === "式";

function parse(data) {
  const result = []; // [{ kosyu, shubetsu, saimoku }]
  let curKosyu = "", curShubetsu = "";

  for (let i = 0; i < data.length; i++) {
    const row = data[i] || [];
    const c1 = (row[1] || "").toString().trim();
    const c2 = (row[2] || "").toString().trim();
    const c5 = (row[5] || "").toString().trim();

    if (c1 && !isHeader(c1)) {
      curKosyu = c1;
      curShubetsu = "";
    }
    if (c2 && !c1 && !isHeader(c2)) curShubetsu = c2;
    if (c5 && !isHeader(c5) && !isDiameter(c5)) {
      result.push({ kosyu: curKosyu, shubetsu: curShubetsu, saimoku: c5 });
    }
  }
  return result;
}

function groupByKosyu(rows) {
  const map = new Map(); // kosyu -> { shubetsu -> [saimoku] }
  for (const r of rows) {
    if (!r.kosyu) continue;
    if (!map.has(r.kosyu)) map.set(r.kosyu, new Map());
    const shMap = map.get(r.kosyu);
    const key = r.shubetsu || "(全体)";
    if (!shMap.has(key)) shMap.set(key, []);
    shMap.get(key).push(r.saimoku);
  }
  return map;
}

try {
  const wb = XLSX.readFile(base);
  const data = XLSX.utils.sheet_to_json(wb.Sheets["内訳1"], { header: 1, defval: "" });
  const rows = parse(data);
  const grouped = groupByKosyu(rows);

  const exclude = ["現場管理費", "一般管理費等", "消費税相当額"];
  for (const [kosyu, shMap] of grouped) {
    if (exclude.some((e) => kosyu.includes(e))) continue;
    console.log("\n【" + kosyu + "】");
    for (const [shubetsu, items] of shMap) {
      const uniq = [...new Set(items)];
      console.log("  " + shubetsu + ": " + uniq.join(", "));
    }
  }
} catch (e) {
  console.error(e.message);
}
