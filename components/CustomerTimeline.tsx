"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { ContactLog, CustomerContact } from "@/types/crm";
import ContactLogList from "@/components/ContactLogList";
import { Inp } from "@/components/ui/primitives";
import { T } from "@/lib/constants";

type KindFilter = "all" | "meeting" | "memo" | "draft";

type Props = {
  logs: ContactLog[];
  contacts: CustomerContact[];
  /** 担当者で絞り込み（親が制御。担当者チップのクリックと連動） */
  personId: string;
  onPersonChange: (id: string) => void;
  onChanged: () => void;
  onEditMeeting?: (log: ContactLog) => void;
};

const PAGE = 10;

function logHasPerson(log: ContactLog, personId: string): boolean {
  if (log.contactPersonId === personId) return true;
  return (log.attendees ?? []).some((a) => a.contactPersonId === personId);
}

/**
 * 会社詳細の商談タイムライン。
 * 件数が増えても見やすいように、検索・種別/担当者フィルタ・月ごとの区切り・段階表示を持つ。
 */
export default function CustomerTimeline({
  logs,
  contacts,
  personId,
  onPersonChange,
  onChanged,
  onEditMeeting,
}: Props) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  // 絞り込み条件ごとに表示件数を持ち、条件が変わると自然に PAGE へ戻る
  const filterKey = `${q}|${kind}|${personId}|${logs.length}`;
  const [shownFor, setShownFor] = useState<{ key: string; n: number }>({ key: filterKey, n: PAGE });
  const shown = shownFor.key === filterKey ? shownFor.n : PAGE;
  const showMore = () => setShownFor({ key: filterKey, n: shown + PAGE });

  const counts = useMemo(
    () => ({
      all: logs.length,
      meeting: logs.filter((l) => l.kind === "meeting").length,
      memo: logs.filter((l) => l.kind !== "meeting").length,
      draft: logs.filter((l) => l.status === "draft").length,
    }),
    [logs]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return logs.filter((l) => {
      if (kind === "meeting" && l.kind !== "meeting") return false;
      if (kind === "memo" && l.kind === "meeting") return false;
      if (kind === "draft" && l.status !== "draft") return false;
      if (personId && !logHasPerson(l, personId)) return false;
      if (s) {
        const hay = `${l.title} ${l.body} ${l.transcript} ${l.contactPersonName ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [logs, q, kind, personId]);

  const person = personId ? contacts.find((c) => c.id === personId) : undefined;
  const visible = filtered.slice(0, shown);
  const remaining = filtered.length - visible.length;

  const filterChip = (key: KindFilter, label: string, count: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setKind(key)}
      style={{
        ...chip,
        border: kind === key ? `1.5px solid ${T.ac}` : `1px solid ${T.bd}`,
        background: kind === key ? "#eff6ff" : "#fff",
        color: key === "draft" && count > 0 ? "#b45309" : T.tx,
      }}
    >
      {label}
      <span style={{ marginLeft: 4, color: T.ts, fontWeight: 500 }}>{count}</span>
    </button>
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <strong style={{ fontSize: 14, marginRight: 4 }}>商談履歴</strong>
        {filterChip("all", "すべて", counts.all)}
        {filterChip("meeting", "会議", counts.meeting)}
        {filterChip("memo", "メモ", counts.memo)}
        {counts.draft > 0 && filterChip("draft", "下書き", counts.draft)}
        {person && (
          <button
            type="button"
            onClick={() => onPersonChange("")}
            style={{ ...chip, background: "#fef3c7", border: "1px solid #fcd34d" }}
            title="担当者の絞り込みを解除"
          >
            {person.name} ×
          </button>
        )}
        <span style={{ flex: 1 }} />
        <Inp
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="履歴を検索"
          style={{ width: 180, padding: "6px 10px", fontSize: 12 }}
        />
      </div>

      {logs.length === 0 ? (
        <div style={{ color: T.ts, fontSize: 13, padding: "12px 4px" }}>
          まだ商談メモがありません。「＋ メモ」または「＋ 会議メモ」から記録してください。
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: T.ts, fontSize: 13, padding: "12px 4px" }}>条件に合う履歴がありません</div>
      ) : (
        <>
          <ContactLogList
            logs={visible}
            onChanged={onChanged}
            onEditMeeting={onEditMeeting}
            groupByMonth
            hideCustomer
          />
          {remaining > 0 && (
            <button
              type="button"
              onClick={showMore}
              style={{
                width: "100%",
                marginTop: 8,
                padding: "8px 0",
                borderRadius: 8,
                border: `1px dashed ${T.bd}`,
                background: "#fff",
                color: T.ts,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              さらに表示（残り {remaining} 件）
            </button>
          )}
        </>
      )}
    </div>
  );
}

const chip: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: "4px 10px",
  borderRadius: 999,
  cursor: "pointer",
  fontFamily: "inherit",
};
