import * as XLSX from "xlsx";
import { genId } from "./constants";
import type { ProjectProcess, ProjectSection } from "./utils";
import { DEFAULT_PROCESS_MASTERS } from "./utils";

const KOSEI_SUBTASKS = ["更生材料", "反転・形成", "仕上（管口切断・仕上）", "仮設備（設置・撤去）"];

/** 設計書（内訳1）をパースして ProjectProcess[] を生成 */
export function parseDesignBookToProcesses(buffer: ArrayBuffer): ProjectProcess[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sh = wb.Sheets["内訳1"];
  if (!sh) return [];

  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" }) as string[][];
  const processes: ProjectProcess[] = [];
  let sortOrder = 0;

  let currentKosyu = "";
  const koseiSections = new Map<string, ProjectSection>();
  const sectionOrder: string[] = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i] || [];
    const col1 = (row[1] || "").toString().trim();
    const col2 = (row[2] || "").toString().trim();
    const col5 = (row[5] || "").toString().trim();

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
          const subs = seikei
            ? ["管更生工", "既設管整備工", "取付管工"]
            : KOSEI_SUBTASKS;
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

  const pm04 = DEFAULT_PROCESS_MASTERS.find((m) => m.id === "pm04");
  if (pm04 && koseiSections.size > 0) {
    const sections = sectionOrder
      .map((k) => koseiSections.get(k))
      .filter((s): s is ProjectSection => !!s);
    processes.push({
      id: genId(),
      processMasterId: "pm04",
      status: "pending",
      sortOrder: sortOrder++,
      sections,
    });
  }

  const addProcess = (masterId: string, sectionNames: string[]) => {
    const master = DEFAULT_PROCESS_MASTERS.find((m) => m.id === masterId);
    if (!master) return;
    const defaultSubs = master.defaultSubs;
    const sections: ProjectSection[] = sectionNames.map((name, si) => ({
      id: genId(),
      name,
      sortOrder: si,
      subtasks: defaultSubs.map((n, idx) => ({
        id: genId(),
        name: n,
        done: false,
        sortOrder: idx,
      })),
    }));
    processes.push({
      id: genId(),
      processMasterId: masterId,
      status: "pending",
      sortOrder: sortOrder++,
      sections,
    });
  };

  addProcess("pm05", ["換気設備"]);
  addProcess("pm07", ["交通誘導"]);

  return processes;
}
