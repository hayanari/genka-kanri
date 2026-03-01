const XLSX = require("xlsx");
const path = require("path");

const fp = path.join(
  process.env.USERPROFILE || "",
  "OneDrive - 株式会社トキト",
  "２階共有", "入札情報", "役所", "さ", "堺市", "上下水道局",
  "令和7年度", "工事", "車之町東ほか下水管耐震化工事（７－２１）",
  "編集前", "設計書.xlsx"
);

try {
  const wb = XLSX.readFile(fp);
  console.log("Sheets:", wb.SheetNames.join(", "));
  const uchiwake = wb.Sheets["内訳1"] || wb.Sheets["内訳"];
  if (uchiwake) {
    const data = XLSX.utils.sheet_to_json(uchiwake, { header: 1, defval: "" });
    console.log("\n内訳 rows:", data.length);
    console.log("Sample (row 0-20):");
    data.slice(0, 21).forEach((r, i) => console.log(i, (r[1] || "").toString().slice(0, 35), "|", (r[2] || "").toString().slice(0, 35), "|", (r[5] || "").toString().slice(0, 25)));
  } else {
    console.log("内訳 not found");
  }
  const daika = wb.Sheets["代価1"] || wb.Sheets["代価"];
  if (daika) {
    const data = XLSX.utils.sheet_to_json(daika, { header: 1, defval: "" });
    const spanRows = data.filter((r) => (r[0] || "").toString().includes("更生延長"));
    console.log("\n代価 spans:", spanRows.length);
    spanRows.slice(0, 5).forEach((r) => console.log(" ", (r[0] || "").toString().slice(0, 60)));
  } else {
    console.log("代価 not found");
  }
} catch (e) {
  console.error(e.message);
}
