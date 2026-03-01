import * as XLSX from "xlsx";
import { genId } from "./constants";
import type { ProjectProcess, ProjectSection, ProjectSubtask } from "./utils";
import { DEFAULT_PROCESS_MASTERS } from "./utils";

const KOSEI_SUBTASKS = ["更生材料", "反転・形成", "仕上（管口切断・仕上）", "仮設備（設置・撤去）"];

const EXCLUDE_KOSYU = ["現場管理費", "一般管理費等", "消費税相当額"];
const isDiameter = (s: string) => /^φ\d+$/.test(s);
const isHeader = (s: string) =>
  /^(工事費内訳|国費|工事区分|単位|数量|単価|金額|摘要)/.test(s) || s === "式";

/** 設計書（内訳1）をパースして ProjectProcess[] を生成 */
export function parseDesignBookToProcesses(buffer: ArrayBuffer): ProjectProcess[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sh = wb.Sheets["内訳1"];
  if (!sh) return [];

  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" }) as string[][];
  const processes: ProjectProcess[] = [];
  let sortOrder = 0;

  // 1. 階層解析: 工種 > 種別 > 細目
  const rows: { kosyu: string; shubetsu: string; saimoku: string }[] = [];
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

  // 2. 工種ごとにグルーピング（種別 -> 細目一覧）
  const kosyuMap = new Map<string, Map<string, string[]>>();
  for (const r of rows) {
    if (!r.kosyu || EXCLUDE_KOSYU.some((e) => r.kosyu.includes(e))) continue;
    if (!kosyuMap.has(r.kosyu)) kosyuMap.set(r.kosyu, new Map());
    const shMap = kosyuMap.get(r.kosyu)!;
    if (!shMap.has(r.shubetsu)) shMap.set(r.shubetsu, []);
    shMap.get(r.shubetsu)!.push(r.saimoku);
  }

  // 3. 管きょ更生工を管径単位で集約して pm04
  const koseiGroups = new Map<string, { shubetsu: string; subs: string[] }[]>();
  for (const [kosyu, shMap] of kosyuMap) {
    if (!kosyu.includes("管きょ更生工")) continue;
    const m = kosyu.match(/既設管径(\d+)mm/);
    const dia = m ? `φ${m[1]}` : "";
    if (!dia) continue;
    for (const [shubetsu, saimokus] of shMap) {
      const rain = shubetsu.includes("雨水") ? "雨水" : shubetsu.includes("合流") ? "合流" : "";
      const seikei = shubetsu.includes("製管") ? "製管" : "";
      const key = seikei ? `${dia}（${rain}・製管）` : rain ? `${dia}（${rain}）` : dia;
      if (!koseiGroups.has(key)) koseiGroups.set(key, []);
      const subs = seikei
        ? [...new Set(saimokus)]
        : KOSEI_SUBTASKS;
      koseiGroups.get(key)!.push({ shubetsu, subs });
    }
  }

  if (koseiGroups.size > 0) {
    const sectionEntries = Array.from(koseiGroups.entries());
    sectionEntries.sort(([a], [b]) => {
      const ma = a.match(/φ(\d+)/);
      const mb = b.match(/φ(\d+)/);
      const na = ma ? parseInt(ma[1], 10) : 0;
      const nb = mb ? parseInt(mb[1], 10) : 0;
      if (na !== nb) return na - nb;
      return a.includes("雨水") ? -1 : a.includes("合流") ? 1 : 0;
    });
    const sections: ProjectSection[] = sectionEntries.map(([key, grps], si) => {
      const first = grps[0];
      const subs = first.subs;
      return {
        id: genId(),
        name: key,
        sortOrder: si,
        subtasks: subs.map((n, idx) => ({
          id: genId(),
          name: n,
          done: false,
          sortOrder: idx,
        })),
      };
    });
    if (sections.length > 0) {
      processes.push({
        id: genId(),
        processMasterId: "pm04",
        status: "pending",
        sortOrder: sortOrder++,
        sections,
      });
    }
  }

  // 4. その他の工種を変換（仮設工→pm07、共通仮設費→pm30 等）
  const addProcess = (
    masterId: string,
    kosyuKey: string,
    skip = false
  ) => {
    if (skip) return;
    const shMap = kosyuMap.get(kosyuKey);
    if (!shMap || shMap.size === 0) return;
    const master = DEFAULT_PROCESS_MASTERS.find((m) => m.id === masterId);
    if (!master) return;

    const sections: ProjectSection[] = [];
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

  // 換気工（重複排除のためキーでループ）
  const processedKosyu = new Set<string>();
  for (const [kosyu] of kosyuMap) {
    if (processedKosyu.has(kosyu)) continue;
    if (kosyu.includes("管きょ更生工")) continue;
    if (kosyu === "換気工") {
      addProcess("pm05", kosyu);
      processedKosyu.add(kosyu);
    } else if (kosyu === "管きょ工(開削)") {
      addProcess("pm25", kosyu);
      processedKosyu.add(kosyu);
    } else if (kosyu === "ﾏﾝﾎｰﾙ工") {
      addProcess("pm26", kosyu);
      processedKosyu.add(kosyu);
    } else if (kosyu === "取付管およびます工") {
      addProcess("pm27", kosyu);
      processedKosyu.add(kosyu);
    } else if (kosyu === "仮設工") {
      addProcess("pm07", kosyu);
      processedKosyu.add(kosyu);
    } else if (kosyu === "附帯工") {
      addProcess("pm28", kosyu);
      processedKosyu.add(kosyu);
    } else if (kosyu === "管きょ更生水替工") {
      addProcess("pm29", kosyu);
      processedKosyu.add(kosyu);
    } else if (kosyu === "共通仮設費") {
      addProcess("pm30", kosyu);
      processedKosyu.add(kosyu);
    }
  }

  return processes;
}
