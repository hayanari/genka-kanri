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
const EXCLUDE_KOSYU = ["現場管理費", "一般管理費等", "消費税相当額"];
const isDiameter = (s) => /^φ\d+$/.test(s);
const isHeader = (s) =>
  /^(工事費内訳|国費|工事区分|単位|数量|単価|金額|摘要)/.test(s) || s === "式";

function extractSpansFromDaika(wb) {
  const sh = wb.Sheets["代価1"];
  if (!sh) return [];
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
        spans.push({ dia: "phi" + m[1], len: m[2] + "m" });
      }
    }
  }
  return spans;
}

function parseDesignBook(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sh = wb.Sheets["内訳1"];
  if (!sh) return [];

  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" });
  const rows = [];
  let curKosyu = "",
    curShubetsu = "";

  for (let i = 0; i < data.length; i++) {
    const row = data[i] || [];
    const c1 = (row[1] || "").toString().trim();
    const c2 = (row[2] || "").toString().trim();
    const c5 = (row[5] || "").toString().trim();

    if (c1 && !isHeader(c1)) {
      curKosyu = c1;
      curShubetsu = "";
    }
    if (c2 && !c1 && !isHeader(c2)) curShubetsu = c2;
    if (c5 && !isHeader(c5) && !isDiameter(c5)) {
      rows.push({ kosyu: curKosyu, shubetsu: curShubetsu || "(全体)", saimoku: c5 });
    }
  }

  const kosyuMap = new Map();
  for (const r of rows) {
    if (!r.kosyu || EXCLUDE_KOSYU.some((e) => r.kosyu.includes(e))) continue;
    if (!kosyuMap.has(r.kosyu)) kosyuMap.set(r.kosyu, new Map());
    const shMap = kosyuMap.get(r.kosyu);
    if (!shMap.has(r.shubetsu)) shMap.set(r.shubetsu, []);
    shMap.get(r.shubetsu).push(r.saimoku);
  }

  const processes = [];
  let sortOrder = 0;

  const spans = extractSpansFromDaika(wb);
  const hasKosei = [...kosyuMap.keys()].some((k) => k.includes("管きょ更生工"));
  const seikeiKosyu = [...kosyuMap.entries()].find(
    ([k, sh]) =>
      k.includes("管きょ更生工") &&
      k.includes("800") &&
      [...sh.keys()].some((s) => s.includes("製管"))
  );
  const seikeiSubs = ["管更生工", "既設管整備工", "取付管工"];

  if (hasKosei) {
    let sections;
    if (spans.length > 0) {
      const sorted = [...spans].sort((a, b) => {
        const na = parseInt(a.dia.replace(/\D/g, ""), 10) || 0;
        const nb = parseInt(b.dia.replace(/\D/g, ""), 10) || 0;
        if (na !== nb) return na - nb;
        const la = parseFloat(a.len) || 0;
        const lb = parseFloat(b.len) || 0;
        return la - lb;
      });
      sections = sorted.map((s, si) => ({
        id: genId(),
        name: "\u03C6" + s.dia.replace(/\D/g, "") + " " + s.len,
        sortOrder: si,
        subtasks: KOSEI_SUBTASKS.map((n, idx) => ({
          id: genId(),
          name: n,
          done: false,
          sortOrder: idx,
        })),
      }));
    }
    if (!sections) {
      const koseiGroups = new Map();
      for (const [kosyu, shMap] of kosyuMap) {
        if (!kosyu.includes("管きょ更生工")) continue;
        const m = kosyu.match(/既設管径(\d+)mm/);
        const dia = m ? "phi" + m[1] : "";
        if (!dia) continue;
        for (const [shubetsu, saimokus] of shMap) {
          const rain = shubetsu.includes("雨水") ? "雨水" : shubetsu.includes("合流") ? "合流" : "";
          const seikei = shubetsu.includes("製管") ? "製管" : "";
          const key = seikei ? dia.replace("phi", "phi") + "（" + rain + "・製管）" : rain ? dia.replace("phi", "phi") + "（" + rain + "）" : dia;
          if (!koseiGroups.has(key)) koseiGroups.set(key, []);
          const subs = seikei ? [...new Set(saimokus)] : KOSEI_SUBTASKS;
          koseiGroups.get(key).push({ shubetsu, subs });
        }
      }
      const sectionEntries = Array.from(koseiGroups.entries());
      sectionEntries.sort(([a], [b]) => {
        const ma = a.match(/phi(\d+)/);
        const mb = b.match(/phi(\d+)/);
        const na = ma ? parseInt(ma[1], 10) : 0;
        const nb = mb ? parseInt(mb[1], 10) : 0;
        if (na !== nb) return na - nb;
        return a.includes("雨水") ? -1 : a.includes("合流") ? 1 : 0;
      });
      sections = sectionEntries.map(([key, grps], si) => {
        const first = grps[0];
        const subs = first.subs;
        const displayName = key.replace(/^phi(\d+)/, "\u03C6$1");
        return {
          id: genId(),
          name: displayName,
          sortOrder: si,
          subtasks: subs.map((n, idx) => ({
            id: genId(),
            name: n,
            done: false,
            sortOrder: idx,
          })),
        };
      });
    }
    if (seikeiKosyu) {
      const [, shMap] = seikeiKosyu;
      for (const [shubetsu] of shMap) {
        if (shubetsu.includes("製管")) {
          sections.push({
            id: genId(),
            name: "\u03C6" + "800（合流・製管）",
            sortOrder: sections.length,
            subtasks: seikeiSubs.map((n, idx) => ({
              id: genId(),
              name: n,
              done: false,
              sortOrder: idx,
            })),
          });
          break;
        }
      }
    }
    if (sections && sections.length > 0) {
      processes.push({
        id: genId(),
        processMasterId: "pm04",
        status: "pending",
        sortOrder: sortOrder++,
        sections,
      });
    }
  }

  const addProcess = (masterId, kosyuKey) => {
    const shMap = kosyuMap.get(kosyuKey);
    if (!shMap || shMap.size === 0) return;
    const sections = [];
    let si = 0;
    for (const [shubetsu, saimokus] of shMap) {
      const uniq = [...new Set(saimokus)].filter(Boolean);
      if (uniq.length === 0) continue;
      sections.push({
        id: genId(),
        name: shubetsu,
        sortOrder: si++,
        subtasks: uniq.map((n, idx) => ({
          id: genId(),
          name: n,
          done: false,
          sortOrder: idx,
        })),
      });
    }
    if (sections.length > 0) {
      processes.push({
        id: genId(),
        processMasterId: masterId,
        status: "pending",
        sortOrder: sortOrder++,
        sections,
      });
    }
  };

  const otherKosyu = [
    ["換気工", "pm05"],
    ["管きょ工(開削)", "pm25"],
    ["ﾏﾝﾎｰﾙ工", "pm26"],
    ["取付管およびます工", "pm27"],
    ["仮設工", "pm07"],
    ["附帯工", "pm28"],
    ["管きょ更生水替工", "pm29"],
    ["共通仮設費", "pm30"],
  ];
  for (const [kosyu, mid] of otherKosyu) {
    if (kosyuMap.has(kosyu)) addProcess(mid, kosyu);
  }

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
