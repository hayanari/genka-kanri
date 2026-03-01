const XLSX = require("xlsx");
const path = require("path");

const fp = path.join(
  process.env.USERPROFILE || "",
  "OneDrive - 株式会社トキト",
  "２階共有", "入札情報", "役所", "さ", "堺市", "上下水道局",
  "令和7年度", "工事", "榎元町ほか下水管耐震化工事（７－２１）",
  "編集前", "設計書.xlsx"
);

try {
  const wb = XLSX.readFile(fp);
  console.log("Sheets:", wb.SheetNames.join(", "));
  for (const name of wb.SheetNames) {
    const sh = wb.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });
    console.log("\n=== " + name + " (rows: " + data.length + ") ===");
    data.slice(0, 20).forEach((r, i) => console.log(i, JSON.stringify(r)));
  }
} catch (e) {
  console.error(e.message);
}
