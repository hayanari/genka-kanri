"use client";

import { T } from "@/lib/constants";
import type { Project } from "@/lib/utils";
import {
  DOC_FLOW_PHASES,
  DOC_FLOW_STAGES,
  currentDocFlowStage,
  docFlowPhase,
  overdueItems,
} from "@/lib/docFlow";
import { jstTodayYmd } from "@/lib/scheduleLabor";

/** 案件一覧・案件ヘッダー用の書類フロー進捗バッジ（書類フロー未作成の案件は何も出さない） */
export default function DocFlowBadge({ project: p }: { project: Project }) {
  const items = p.docFlow ?? [];
  if (!p.contractRole || items.length === 0) return null;
  const phase = docFlowPhase(items);
  const stage = currentDocFlowStage(items);
  const overdue = overdueItems(items, jstTodayYmd()).length;
  const color = overdue > 0 ? T.dg : DOC_FLOW_PHASES[phase].color;
  const label =
    phase === "complete"
      ? "✓ 書類完了"
      : `書類 段階${stage}/5・${DOC_FLOW_STAGES[p.contractRole][stage - 1]}`;
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 4,
        fontWeight: 600,
        color,
        background: `${color}18`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
      {overdue > 0 && `・期限切れ${overdue}`}
    </span>
  );
}
