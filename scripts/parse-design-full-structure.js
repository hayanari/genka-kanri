/**
 * 設計書 内訳1 の全階層構造を解析して出力
 */
const XLSX = require("xlsx");
const path = require("path");

const base = process.argv[2] || path.join(
  process.env.USERPROFILE || "",
  "OneDrive - 株式会社トキト",
  "２階共有", "入札情報", "役所", "さ", "堺市", "上下水道局",
  "令和7年度", "工事", "榎元町ほか下水管耐震化工事（７－２１）",
  "編集前", "設計書.xlsx"
);

try {
  const wb = XLSX.readFile(base);
  const sh = wb.Sheets["内訳1"];
  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });

  // 工種(col1) > 種別(col2) > 細目(col3-col5) の階層を構築
  const lines = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i] || [];
    const c1 = (row[1] || "").toString().trim();
    const c2 = (row[2] || "").toString().trim();
    const c3 = (row[3] || "").toString().trim();
    const c4 = (row[4] || "").toString().trim();
    const c5 = (row[5] || "").toString().trim();
    if (c1 || c2 || c3 || c4 || c5) {
      lines.push({ i, c1, c2, c3, c4, c5 });
    }
  }

  // 工種単位でグルーピングして構造表示
  let current = { kosyu: "", shubetsu: "", items: [] };
  const groups = [];

  for (const line of lines) {
    if (line.c1) {
      if (current.kosyu) groups.push({ ...current });
      current = { kosyu: line.c1, shubetsu: "", items: [] };
    }
    if (line.c2 && !line.c1) current.shubetsu = line.c2;
    const item = [line.c3, line.c4, line.c5].filter(Boolean).join(" ");
    if (item && !line.c1) current.items.push(item);
  }
  if (current.kosyu) groups.push(current);

  console.log(JSON.stringify(groups, null, 2));
} catch (e) {
  console.error(e.message);
}
