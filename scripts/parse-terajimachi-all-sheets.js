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
  for (const name of ["表紙(工事)", "内訳(工事)"]) {
    const sh = wb.Sheets[name];
    if (!sh) continue;
    const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });
    console.log("\n=== " + name + " ===");
    data.slice(0, 20).forEach((r, i) => {
      const line = (r || []).join(" | ").slice(0, 120);
      if (line.trim()) console.log(i, line);
    });
  }
} catch (e) {
  console.error(e.message);
}
