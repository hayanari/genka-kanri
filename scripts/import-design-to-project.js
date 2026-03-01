/**
 * 榎元町ほか下水管耐震化工事（７－２１）案件に設計書から工程を投入
 * 実行: node scripts/import-design-to-project.js
 * または: npm run import-design
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env.local") });

const fs = require("fs");
const path = require("path");

const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");

const PROJECT_NAME = "榎元町ほか下水管耐震化工事（７－２１）";

const DESIGN_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  "OneDrive - 株式会社トキト",
  "２階共有",
  "入札情報",
  "役所",
  "さ",
  "堺市",
  "上下水道局",
  "令和7年度",
  "工事",
  "榎元町ほか下水管耐震化工事（７－２１）",
  "編集前",
  "設計書.xlsx"
);

const genId = () => Math.random().toString(36).slice(2, 10);

const KOSEI_SUBTASKS = ["更生材料", "反転・形成", "仕上（管口切断・仕上）", "仮設備（設置・撤去）"];

function parseDesignBook(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sh = wb.Sheets["内訳1"];
  if (!sh) return [];

  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });
  let currentKosyu = "";
  const koseiSections = new Map();
  const sectionOrder = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i] || [];
    const col1 = (row[1] || "").toString().trim();
    const col2 = (row[2] || "").toString().trim();

    if (col1 && col1.includes("管きょ更生工")) {
      const m = col1.match(/既設管径(\d+)mm/);
      currentKosyu = m ? `φ${m[1]}` : "";
      continue;
    }
    if (!col1 && col2 && col2.includes("管きょ内面被覆工")) {
      const rain = col2.includes("雨水") ? "雨水" : col2.includes("合流") ? "合流" : "";
      const seikei = col2.includes("製管工法") ? "製管" : "";
      if (currentKosyu && rain) {
        const key = seikei ? `${currentKosyu}（${rain}・製管）` : `${currentKosyu}（${rain}）`;
        if (!koseiSections.has(key)) {
          sectionOrder.push(key);
          const subs = seikei ? ["管更生工", "既設管整備工", "取付管工"] : KOSEI_SUBTASKS;
          koseiSections.set(key, {
            id: genId(),
            name: key,
            sortOrder: sectionOrder.length - 1,
            subtasks: subs.map((n, idx) => ({
              id: genId(),
              name: n,
              done: false,
              sortOrder: idx,
            })),
          });
        }
      }
      continue;
    }
  }

  const processes = [];
  if (koseiSections.size > 0) {
    const sections = sectionOrder
      .map((k) => koseiSections.get(k))
      .filter(Boolean);
    processes.push({
      id: genId(),
      processMasterId: "pm04",
      status: "pending",
      sortOrder: 0,
      sections,
    });
  }

  processes.push({
    id: genId(),
    processMasterId: "pm05",
    status: "pending",
    sortOrder: 1,
    sections: [
      {
        id: genId(),
        name: "換気設備",
        sortOrder: 0,
        subtasks: [
          { id: genId(), name: "換気設備設置", done: false, sortOrder: 0 },
          { id: genId(), name: "運転", done: false, sortOrder: 1 },
          { id: genId(), name: "撤去", done: false, sortOrder: 2 },
        ],
      },
    ],
  });

  processes.push({
    id: genId(),
    processMasterId: "pm07",
    status: "pending",
    sortOrder: 2,
    sections: [
      {
        id: genId(),
        name: "交通誘導",
        sortOrder: 0,
        subtasks: [
          { id: genId(), name: "交通規制設置", done: false, sortOrder: 0 },
          { id: genId(), name: "誘導警備員配置", done: false, sortOrder: 1 },
          { id: genId(), name: "規制撤去", done: false, sortOrder: 2 },
        ],
      },
    ],
  });

  return processes.map((p, i) => ({ ...p, sortOrder: i }));
}

async function main() {
  if (!fs.existsSync(DESIGN_PATH)) {
    console.error("設計書が見つかりません:", DESIGN_PATH);
    process.exit(1);
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !key || url.includes("placeholder")) {
    console.error(".env.local の Supabase 設定を確認してください");
    process.exit(1);
  }

  const buffer = fs.readFileSync(DESIGN_PATH);
  const projectProcesses = parseDesignBook(buffer);
  console.log("設計書から抽出した工程:", projectProcesses.length, "件");
  projectProcesses.forEach((p, i) => {
    const secCount = p.sections?.length ?? 0;
    const names = (p.sections ?? []).map((s) => s.name).join(", ");
    console.log(`  ${i + 1}. ${p.processMasterId}: ${secCount}区間 [${names}]`);
  });

  const supabase = createClient(url, key);
  const { data: row, error: fetchErr } = await supabase
    .from("genka_kanri_data")
    .select("data")
    .eq("id", "default")
    .single();

  if (fetchErr || !row?.data) {
    console.error("データ取得エラー:", fetchErr?.message || "データがありません");
    process.exit(1);
  }

  const stored = row.data;
  const projects = stored.projects ?? [];
  const idx = projects.findIndex((p) => (p.name || "").includes(PROJECT_NAME));
  if (idx < 0) {
    console.error(`案件 "${PROJECT_NAME}" が見つかりません。先に案件を登録してください。`);
    process.exit(1);
  }

  projects[idx] = { ...projects[idx], projectProcesses };
  const { error: saveErr } = await supabase
    .from("genka_kanri_data")
    .upsert({ id: "default", data: { ...stored, projects }, updated_at: new Date().toISOString() }, { onConflict: "id" });

  if (saveErr) {
    console.error("保存エラー:", saveErr.message);
    process.exit(1);
  }

  console.log(`\n"${PROJECT_NAME}" に工程を投入しました。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
