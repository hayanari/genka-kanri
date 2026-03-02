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
  const sh = wb.Sheets["代価1"] || wb.Sheets["代価"] || wb.Sheets["代価(工事)"];
  if (!sh) {
    console.log("代価 sheet not found");
    process.exit(1);
  }
  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });
  const spans = [];
  const seen = new Set();
  for (let i = 0; i < data.length; i++) {
    const c0 = (data[i]?.[0] || "").toString().trim();
    const m = c0.match(/(\d+)mm\s+([\d.]+)m/);
    if (m && c0.includes("更生延長")) {
      const key = m[1] + "_" + m[2];
      if (!seen.has(key)) {
        seen.add(key);
        spans.push({ dia: "phi" + m[1], len: m[2] + "m", full: c0 });
      }
    }
  }
  console.log("代価(工事) スパン数:", spans.length);
  spans.forEach((s, i) => console.log((i + 1) + ".", "\u03C6" + s.dia.replace(/\D/g, "") + " " + s.len, s.full.slice(0, 50)));
} catch (e) {
  console.error(e.message);
}
