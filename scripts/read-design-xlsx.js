const XLSX = require("xlsx");
const path = require("path");

const filePath = process.argv[2] || String.raw`C:\Users\hayan\OneDrive - 株式会社トキト\２階共有\入札情報\役所\さ\堺市\上下水道局\令和7年度\工事\榎元町ほか下水管耐震化工事（７－２１）\編集前\設計書.xlsx`;

try {
  const workbook = XLSX.readFile(filePath);
  console.log("Sheets:", workbook.SheetNames);
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    console.log("\n---", name, "---");
    console.log(JSON.stringify(data.slice(0, 30), null, 2));
  }
} catch (e) {
  console.error("Error:", e.message);
}
