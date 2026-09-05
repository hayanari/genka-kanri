"use client";

import { useEffect, useState } from "react";
import type { ContactLog } from "@/types/crm";
import { KIND_LABEL, VISIBILITY_LABEL, attendeeCompanyNames } from "@/types/crm";
import { deleteContactLog, getContactLog, patchContactLog } from "@/lib/crmStorage";
import { getCrmAudioUrl } from "@/lib/crmAudio";
import { Btn, Card, Modal } from "@/components/ui/primitives";
import { T } from "@/lib/constants";
import { useUserRole } from "@/lib/roles";

type Props = {
  logs: ContactLog[];
  onChanged: () => void;
  /** 会議メモの編集（指定時に「編集」ボタンを表示） */
  onEditMeeting?: (log: ContactLog) => void;
  /** 月ごとに区切って表示 */
  groupByMonth?: boolean;
  /** 会社詳細の中など、会社名を出す必要がない場合 */
  hideCustomer?: boolean;
};

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${y}年${Number(m)}月`;
}

export default function ContactLogList({
  logs,
  onChanged,
  onEditMeeting,
  groupByMonth = false,
  hideCustomer = false,
}: Props) {
  const { role } = useUserRole();
  const readOnly = role === "viewer";
  const [detail, setDetail] = useState<ContactLog | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setShowTranscript(false);
    setAudioUrl(null);
    if (!detail?.audioPath) return;
    let cancelled = false;
    void getCrmAudioUrl(detail.audioPath).then((u) => {
      if (!cancelled) setAudioUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [detail?.id, detail?.audioPath]);

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

  const confirm = async (id: string) => {
    if (!window.confirm("内容を確認済みとして「確定」にしますか？")) return;
    setConfirming(true);
    try {
      const updated = await patchContactLog(id, { status: "confirmed" });
      setDetail(updated);
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setConfirming(false);
    }
  };

  if (logs.length === 0) {
    return (
      <Card>
        <div style={{ color: T.ts, fontSize: 13 }}>商談メモはまだありません</div>
      </Card>
    );
  }

  const renderRow = (log: ContactLog) => {
    const isMeeting = log.kind === "meeting";
    const companies = isMeeting ? attendeeCompanyNames(log) : [];
    const isDraft = log.status === "draft";
    const who = isMeeting
      ? companies.join("・")
      : [!hideCustomer ? log.customerName : "", log.contactPersonName].filter(Boolean).join(" / ");
    const preview = (log.body || log.transcript).replace(/\s+/g, " ").trim();
    return (
      <button
        key={log.id}
        type="button"
        onClick={() => void openDetail(log.id)}
        style={{
          textAlign: "left",
          border: "none",
          borderLeft: `3px solid ${isDraft ? "#f59e0b" : isMeeting ? "#22c55e" : "#cbd5e1"}`,
          borderRadius: 6,
          padding: "8px 10px",
          background: isDraft ? "#fffbeb" : "#fff",
          cursor: "pointer",
          width: "100%",
          display: "grid",
          gridTemplateColumns: "44px 1fr",
          columnGap: 10,
          alignItems: "start",
        }}
      >
        <span style={{ fontSize: 12, color: T.ts, fontVariantNumeric: "tabular-nums", paddingTop: 2 }}>
          {log.contactDate.slice(5).replace("-", "/")}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <strong
              style={{
                fontSize: 13,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "100%",
              }}
            >
              {log.title || "(無題)"}
            </strong>
            <span style={chip}>{isMeeting ? KIND_LABEL.meeting : log.contactType}</span>
            {log.visibility !== "company" && (
              <span
                style={{ ...chip, background: visBg(log.visibility) }}
                title={
                  log.viewers?.length
                    ? `追加で閲覧可: ${log.viewers.map((v) => v.name || "").filter(Boolean).join("、")}`
                    : undefined
                }
              >
                {VISIBILITY_LABEL[log.visibility]}
                {log.viewers?.length ? ` +${log.viewers.length}` : ""}
              </span>
            )}
            {isDraft && <span style={{ ...chip, background: "#fde68a" }}>下書き</span>}
            {log.audioPath && (
              <span title="録音あり" style={{ fontSize: 12 }}>
                🎧
              </span>
            )}
          </span>
          {(who || preview) && (
            <span
              style={{
                display: "block",
                fontSize: 12,
                color: T.ts,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {who && <span style={{ color: "#475569", fontWeight: 600 }}>{who}</span>}
              {who && preview ? " — " : ""}
              {preview.slice(0, 140)}
            </span>
          )}
        </span>
      </button>
    );
  };

  const groups: { key: string; items: ContactLog[] }[] = [];
  if (groupByMonth) {
    for (const log of logs) {
      const key = monthKey(log.contactDate);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(log);
      else groups.push({ key, items: [log] });
    }
  }

  return (
    <>
      {groupByMonth ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {groups.map((g) => (
            <div key={g.key}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  color: T.ts,
                  marginBottom: 4,
                }}
              >
                <span>{monthLabel(g.key)}</span>
                <span style={{ fontWeight: 500 }}>{g.items.length}件</span>
                <span style={{ flex: 1, height: 1, background: T.bd }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{g.items.map(renderRow)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{logs.map(renderRow)}</div>
      )}

      {detail && (
        <Modal
          title={detail.title || (detail.kind === "meeting" ? "会議メモ" : "商談メモ")}
          onClose={() => setDetail(null)}
          w={640}
        >
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            <div style={{ color: T.ts, marginBottom: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span>
                {detail.contactDate} / {detail.contactType} / {VISIBILITY_LABEL[detail.visibility]}
                {detail.kind !== "meeting" && detail.customerName ? ` / ${detail.customerName}` : ""}
                {detail.kind !== "meeting" && detail.contactPersonName ? `（${detail.contactPersonName}）` : ""}
              </span>
              {detail.status === "draft" && (
                <span style={{ ...chip, background: "#fde68a" }}>下書き（未確認）</span>
              )}
            </div>

            {detail.visibility !== "company" && (detail.viewers?.length ?? 0) > 0 && (
              <div style={{ fontSize: 12, color: T.ts, marginBottom: 8 }}>
                追加で閲覧可:{" "}
                {(detail.viewers ?? []).map((v) => v.name || "（不明）").join("、")}
              </div>
            )}

            {detail.kind === "meeting" && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.ts }}>出席者</div>
                <AttendeeList log={detail} />
              </div>
            )}

            {detail.status === "draft" && (
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fcd34d",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 12,
                  marginBottom: 10,
                }}
              >
                この議事録は下書きです。内容を確認して「確定」してください。
              </div>
            )}

            <div style={{ whiteSpace: "pre-wrap" }}>{detail.body || "（本文なし）"}</div>

            {audioUrl && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.ts, marginBottom: 4 }}>
                  録音 {detail.audioName ? `（${detail.audioName}）` : ""}
                </div>
                <audio controls src={audioUrl} style={{ width: "100%" }} />
              </div>
            )}

            {detail.transcript && (
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowTranscript((v) => !v)}
                  style={{ border: "none", background: "transparent", color: "#2563eb", cursor: "pointer", padding: 0, fontSize: 12 }}
                >
                  {showTranscript ? "文字起こしを隠す" : "文字起こし原文を表示"}
                </button>
                {showTranscript && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: 10,
                      background: "#f8fafc",
                      border: `1px solid ${T.bd}`,
                      borderRadius: 8,
                      whiteSpace: "pre-wrap",
                      fontSize: 12,
                      maxHeight: 260,
                      overflow: "auto",
                    }}
                  >
                    {detail.transcript}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {!readOnly && (
              <Btn v="danger" sm onClick={() => void remove(detail.id)}>
                削除
              </Btn>
            )}
            {!readOnly && detail.kind === "meeting" && onEditMeeting && (
              <Btn
                sm
                onClick={() => {
                  const target = detail;
                  setDetail(null);
                  onEditMeeting(target);
                }}
              >
                編集
              </Btn>
            )}
            {!readOnly && detail.status === "draft" && (
              <Btn v="primary" sm onClick={() => void confirm(detail.id)} disabled={confirming}>
                {confirming ? "更新中…" : "確認済みにして確定"}
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

function AttendeeList({ log }: { log: ContactLog }) {
  const attendees = log.attendees ?? [];
  if (attendees.length === 0) {
    return <div style={{ fontSize: 13 }}>{log.customerName ?? "—"}</div>;
  }
  const byCompany = new Map<string, string[]>();
  for (const a of attendees) {
    const key = a.customerName ?? a.customerId;
    const list = byCompany.get(key) ?? [];
    if (a.contactPersonName) list.push(a.contactPersonName);
    byCompany.set(key, list);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {[...byCompany.entries()].map(([company, names]) => (
        <div key={company} style={{ fontSize: 13 }}>
          <strong>{company}</strong>
          {names.length > 0 && <span style={{ color: T.ts }}>：{names.join("、")}</span>}
        </div>
      ))}
    </div>
  );
}

function visBg(v: string) {
  // 全社以外は「指定した人だけ」
  return v === "company" ? "#dbeafe" : "#e2e8f0";
}

const chip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
  background: "#f1f5f9",
};
