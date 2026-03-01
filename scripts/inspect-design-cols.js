const XLSX = require("xlsx");
const fp = require("path").join(
  process.env.USERPROFILE || "",
  "OneDrive - 株式会社トキト",
  "２階共有", "入札情報", "役所", "さ", "堺市", "上下水道局",
  "令和7年度", "工事", "榎元町ほか下水管耐震化工事（７－２１）",
  "編集前", "設計書.xlsx"
);

try {
  const wb = XLSX.readFile(fp);
  const sh = wb.Sheets["内訳1"];
  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });
  console.log("Row0 (header):", JSON.stringify(data[0]));
  console.log("Row1-3:");
  data.slice(1, 4).forEach((r, i) => console.log(i + 1, r));
  console.log("\nRow5-25 (管きょ更生工周辺):");
  data.slice(5, 26).forEach((r, i) => console.log(5 + i, r));
} catch (e) {
  console.error(e.message);
}
