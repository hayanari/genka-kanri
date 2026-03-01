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
  const dai1 = XLSX.utils.sheet_to_json(wb.Sheets["代価1"], { header: 1, defval: "" });

  const spans = [];
  const seen = new Set();
  for (let i = 0; i < dai1.length; i++) {
    const r = dai1[i] || [];
    const c0 = (r[0] || "").toString().trim();
    const m = c0.match(/(\d+)mm\s+([\d.]+)m/);
    if (m && c0.includes("更生延長")) {
      const key = m[1] + "mm_" + m[2] + "m";
      if (!seen.has(key)) {
        seen.add(key);
        spans.push({ dia: "phi" + m[1], len: m[2] + "m", full: c0 });
      }
    }
  }
  console.log("Total unique spans in 代価1:", spans.length);
  spans.forEach((s, i) => console.log((i + 1) + ". phi" + s.dia.replace("phi", "") + " " + s.len));
} catch (e) {
  console.error(e.message);
}
