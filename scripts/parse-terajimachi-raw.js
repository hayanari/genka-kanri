const XLSX = require("xlsx");
const path = require("path");

const fp = path.join(
  process.env.USERPROFILE || "",
  "OneDrive - 株式会社トキト",
  "２階共有", "入札情報", "役所", "さ", "堺市", "上下水道局",
  "令和7年度", "工事", "寺地町東ほか下水管改築工事（７－２１）（詳細設計付）（その２）",
  "編集前", "設計書.xlsx"
);

try {
  const wb = XLSX.readFile(fp);
  const sh = wb.Sheets["内訳(工事)"];
  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });
  console.log("Total rows:", data.length);
  console.log("\nRows with non-empty col0 or col1 (first 60):");
  let count = 0;
  for (let i = 0; i < data.length && count < 60; i++) {
    const r = data[i] || [];
    const c0 = (r[0] || "").toString().trim();
    const c1 = (r[1] || "").toString().trim();
    const c2 = (r[2] || "").toString().trim();
    const c5 = (r[5] || "").toString().trim();
    if (c0 || c1 || c2 || c5) {
      console.log(i, "|", c0.slice(0, 25), "|", c1.slice(0, 30), "|", c2.slice(0, 25), "|", c5.slice(0, 20));
      count++;
    }
  }
} catch (e) {
  console.error(e.message);
}
