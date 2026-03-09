import * as XLSX from "xlsx";
import { genId } from "./constants";
import type { ProjectSection, ProjectSubtask } from "./utils";

const KOSEI_SUBTASKS = ["更生材料", "反転・形成", "仕上（管口切断・仕上）", "仮設備（設置・撤去）"];

/** 数量表の列インデックス（添付形式による） */
const COLS = {
  MGMT: 2,
  ROSEN: 4,
  DESIGN_OR_IMPL: 19,
  DIA: 22,
  LENGTH: 29,
  ACTUAL_LENGTH: 33,
};


/** 1シートから区間を抽出 */
function extractFromSheet(data: (string | number)[][]): ProjectSection[] {
  const sections: ProjectSection[] = [];
  for (let i = 3; i < data.length - 1; i++) {
    const row = data[i] || [];
    const nextRow = data[i + 1] || [];
    const mgmt = String(row[COLS.MGMT] ?? "").trim();
    const designImpl = String(row[COLS.DESIGN_OR_IMPL] ?? "").replace(/\r\n/g, "");
    const nextDesignImpl = String(nextRow[COLS.DESIGN_OR_IMPL] ?? "").replace(/\r\n/g, "");

    if (!mgmt.match(/^\d+$/)) continue;
    if (designImpl !== "設計" || nextDesignImpl !== "実施") continue;

    const rosen = String(row[COLS.ROSEN] ?? "").trim();
    const diaBefore = toNum(row[COLS.DIA]);
    const diaAfter = toNum(nextRow[COLS.DIA]);
    const lenBefore = toNum(row[COLS.ACTUAL_LENGTH]) ?? toNum(row[COLS.LENGTH]);
    const lenAfter = toNum(nextRow[COLS.ACTUAL_LENGTH]) ?? toNum(nextRow[COLS.LENGTH]);

    const dia = (diaAfter != null && diaAfter > 0) ? diaAfter : (diaBefore ?? 0);
    const len = (lenAfter != null && lenAfter > 0 ? lenAfter : lenBefore) || 0;
    const name = dia > 0 && len > 0 ? `φ${dia} ${len}m` : rosen || `#${mgmt}`;

    sections.push({
      id: genId(),
      name,
      sortOrder: 0,
      subtasks: KOSEI_SUBTASKS.map((n, idx) => ({
        id: genId(),
        name: n,
        done: false,
        sortOrder: idx,
      })),
      managementNumber: mgmt,
      rosenNumber: rosen || undefined,
      diaBefore: (diaBefore != null && diaBefore > 0) ? diaBefore : undefined,
      diaAfter: (diaAfter != null && diaAfter > 0) ? diaAfter : undefined,
      lengthBefore: (lenBefore != null && lenBefore > 0) ? lenBefore : undefined,
      lengthAfter: (lenAfter != null && lenAfter > 0) ? lenAfter : undefined,
    });
  }
  return sections;
}

/** 数量表から 更生工 区間を抽出（数量表シートのみ、管理番号・距離・管径あり） */
export function parseQuantityTableToSections(buffer: ArrayBuffer): ProjectSection[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const seen = new Set<string>();
  const allSections: ProjectSection[] = [];

  const addSection = (sec: ProjectSection) => {
    const key = `${sec.managementNumber ?? ""}_${sec.rosenNumber ?? ""}_${sec.diaAfter ?? sec.diaBefore ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    allSections.push(sec);
  };

  const quantitySheetNames = wb.SheetNames.filter((n) => n.includes("数量表"));
  for (const sheetName of quantitySheetNames) {
    const sh = wb.Sheets[sheetName];
    if (!sh) continue;
    const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" }) as (string | number)[][];
    for (const sec of extractFromSheet(data)) addSection(sec);
  }

  allSections.sort((a, b) => {
    const na = parseInt(a.managementNumber ?? "0", 10) || 0;
    const nb = parseInt(b.managementNumber ?? "0", 10) || 0;
    if (na !== nb) return na - nb;
    return (a.rosenNumber ?? "").localeCompare(b.rosenNumber ?? "");
  });
  allSections.forEach((sec, i) => {
    sec.sortOrder = i;
  });
  return allSections;
}

function toNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return !isNaN(n) ? n : undefined;
}
