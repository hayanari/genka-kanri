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

  // 代価1: 各「第X号代価」ブロックの先頭行にスパン情報がありそう
  console.log("=== 代価1 先頭行（スパン判定用）===");
  const spans = [];
  let currentSpan = null;
  for (let i = 0; i < Math.min(dai1.length, 500); i++) {
    const r = dai1[i] || [];
    const c0 = (r[0] || "").toString().trim();
    const c1 = (r[1] || "").toString().trim();
    if (c0.includes("代価") && c1.includes("第")) {
      currentSpan = null;
    }
    if (c0.match(/更生延長.*\d+mm\s*[\d.]+m/)) {
      const m = c0.match(/(\d+)mm\s*([\d.]+)m/);
      if (m) {
        const dia = "phi" + m[1];
        const len = m[2] + "m";
        if (!currentSpan || currentSpan !== c0) {
          spans.push({ row: i, text: c0, dia, len });
          currentSpan = c0;
        }
      }
    }
  }
  console.log("Extracted spans:", spans.length);
  spans.slice(0, 30).forEach((s, i) => console.log(i + 1, s.dia, s.len, s.text.slice(0, 60)));

  // 内訳明細1: 土被り区間
  console.log("\n=== 内訳明細1 区間（土被り別）===");
  const meisai = XLSX.utils.sheet_to_json(wb.Sheets["内訳明細1"], { header: 1, defval: "" });
  const segments = [];
  for (let i = 0; i < meisai.length; i++) {
    const r = meisai[i] || [];
    const c0 = (r[0] || "").toString().trim();
    const c1 = (r[1] || "").toString().trim();
    const qty = r[3];
    if ((c0.includes("土被り") || c1.includes("土被り")) && qty) {
      segments.push({ dia: c0, condition: c1, qty });
    }
  }
  console.log("Segments:", segments.length);
  segments.slice(0, 25).forEach((s, i) => console.log(i + 1, s.dia, s.condition, s.qty));
} catch (e) {
  console.error(e.message);
}
