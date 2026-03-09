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

/** 数量表から 更生工 区間を抽出（事前・事後対応） */
export function parseQuantityTableToSections(buffer: ArrayBuffer): ProjectSection[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sh =
    wb.Sheets["数量表"] ??
    wb.Sheets["数量表 2"] ??
    wb.Sheets["数量表 3"] ??
    wb.Sheets["数量表 (4)"] ??
    wb.Sheets[wb.SheetNames.find((n) => n.includes("数量表")) ?? ""];
  if (!sh) return [];

  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" }) as (string | number)[][];
  const sections: ProjectSection[] = [];
  let sortOrder = 0;

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

    const dia = diaAfter > 0 ? diaAfter : diaBefore;
    const len = (lenAfter > 0 ? lenAfter : lenBefore) || 0;
    const name = dia > 0 && len > 0 ? `φ${dia} ${len}m` : rosen || `#${mgmt}`;

    sections.push({
      id: genId(),
      name,
      sortOrder: sortOrder++,
      subtasks: KOSEI_SUBTASKS.map((n, idx) => ({
        id: genId(),
        name: n,
        done: false,
        sortOrder: idx,
      })),
      managementNumber: mgmt,
      rosenNumber: rosen || undefined,
      diaBefore: diaBefore > 0 ? diaBefore : undefined,
      diaAfter: diaAfter > 0 ? diaAfter : undefined,
      lengthBefore: lenBefore > 0 ? lenBefore : undefined,
      lengthAfter: lenAfter > 0 ? lenAfter : undefined,
    });
  }

  return sections;
}

function toNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return !isNaN(n) ? n : undefined;
}
