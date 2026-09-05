"use client";

import { useEffect, useState } from "react";
import type { ContactLog } from "@/types/crm";
import { VISIBILITY_LABEL } from "@/types/crm";
import { deleteContactLog, getContactLog, logContactAccess } from "@/lib/crmStorage";
import { Btn, Card, Modal } from "@/components/ui/primitives";
import { T } from "@/lib/constants";
import { useUserRole } from "@/lib/roles";

type Props = {
  logs: ContactLog[];
  onChanged: () => void;
};

export default function ContactLogList({ logs, onChanged }: Props) {
  const { role } = useUserRole();
  const readOnly = role === "viewer";
  const [detail, setDetail] = useState<ContactLog | null>(null);

  useEffect(() => {
    if (!detail || detail.visibility !== "executive") return;
    void logContactAccess(detail.id);
  }, [detail]);

  const openDetail = async (id: string) => {
    try {
      const full = await getContactLog(id);
      setDetail(full);
    } catch (e) {
      alert(e instanceof Error ? e.message : "読み込みに失敗しました");
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("このメモを削除しますか？")) return;
    try {
      await deleteContactLog(id);
      setDetail(null);
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  if (logs.length === 0) {
    return (
      <Card>
        <div style={{ color: T.ts, fontSize: 13 }}>商談メモはまだありません</div>
      </Card>
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {logs.map((log) => (
          <button
            key={log.id}
            type="button"
            onClick={() => void openDetail(log.id)}
            style={{
              textAlign: "left",
              border: `1px solid ${T.bd}`,
              borderRadius: 8,
              padding: "10px 12px",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: T.ts }}>{log.contactDate}</span>
              <span style={chip}>{log.contactType}</span>
              <span style={{ ...chip, background: visBg(log.visibility) }}>
                {VISIBILITY_LABEL[log.visibility]}
              </span>
              <strong style={{ fontSize: 13 }}>{log.title || "(無題)"}</strong>
            </div>
            <div
              style={{
                fontSize: 12,
                color: T.ts,
                marginTop: 4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {log.customerName ? `${log.customerName} — ` : ""}
              {log.body.slice(0, 120)}
            </div>
          </button>
        ))}
      </div>

      {detail && (
        <Modal title={detail.title || "商談メモ"} onClose={() => setDetail(null)} w={560}>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            <div style={{ color: T.ts, marginBottom: 8 }}>
              {detail.contactDate} / {detail.contactType} / {VISIBILITY_LABEL[detail.visibility]}
              {detail.customerName ? ` / ${detail.customerName}` : ""}
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{detail.body || "（本文なし）"}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            {!readOnly && (
              <Btn v="danger" sm onClick={() => void remove(detail.id)}>
                削除
              </Btn>
            )}
            <Btn v="ghost" sm onClick={() => setDetail(null)}>
              閉じる
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}

function visBg(v: string) {
  if (v === "executive") return "#fef3c7";
  if (v === "private") return "#e2e8f0";
  return "#dbeafe";
}

const chip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
  background: "#f1f5f9",
};
