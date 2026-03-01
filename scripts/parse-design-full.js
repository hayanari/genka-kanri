const XLSX = require("xlsx");
const path = require("path");

const filePath = process.argv[2] || String.raw`C:\Users\hayan\OneDrive - 株式会社トキト\２階共有\入札情報\役所\さ\堺市\上下水道局\令和7年度\工事\榎元町ほか下水管耐震化工事（７－２１）\編集前\設計書.xlsx`;

try {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets["内訳1"];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  
  // Parse 工種 structure - column 1 has 工種 names like 管きょ更生工
  const lines = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const col1 = (row[1] || "").toString().trim();
    const col2 = (row[2] || "").toString().trim();
    const col3 = (row[3] || "").toString().trim();
    const col4 = (row[4] || "").toString().trim();
    const col5 = (row[5] || "").toString().trim();
    if (col1 || col2 || col3 || col4 || col5) {
      lines.push({ i, col1, col2, col3, col4, col5 });
    }
  }
  console.log(JSON.stringify(lines.slice(0, 150), null, 2));
} catch (e) {
  console.error("Error:", e.message);
}
