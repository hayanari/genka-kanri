"use client";

import { useEffect, useState } from "react";
import type { ContactLog } from "@/types/crm";
import { KIND_LABEL, VISIBILITY_LABEL, attendeeCompanyNames } from "@/types/crm";
import { deleteContactLog, getContactLog, logContactAccess, patchContactLog } from "@/lib/crmStorage";
import { getCrmAudioUrl } from "@/lib/crmAudio";
import { Btn, Card, Modal } from "@/components/ui/primitives";
import { T } from "@/lib/constants";
import { useUserRole } from "@/lib/roles";

type Props = {
  logs: ContactLog[];
  onChanged: () => void;
  /** 会議メモの編集（指定時に「編集」ボタンを表示） */
  onEditMeeting?: (log: ContactLog) => void;
};

export default function ContactLogList({ logs, onChanged, onEditMeeting }: Props) {
  const { role } = useUserRole();
  const readOnly = role === "viewer";
  const [detail, setDetail] = useState<ContactLog | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!detail || detail.visibility !== "executive") return;
    void logContactAccess(detail.id);
  }, [detail]);

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

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {logs.map((log) => {
          const isMeeting = log.kind === "meeting";
          const companies = isMeeting ? attendeeCompanyNames(log) : [];
          return (
            <button
              key={log.id}
              type="button"
              onClick={() => void openDetail(log.id)}
              style={{
                textAlign: "left",
                border: `1px solid ${log.status === "draft" ? "#fcd34d" : T.bd}`,
                borderRadius: 8,
                padding: "10px 12px",
                background: log.status === "draft" ? "#fffbeb" : "#fff",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.ts }}>{log.contactDate}</span>
                {isMeeting && <span style={{ ...chip, background: "#dcfce7" }}>{KIND_LABEL.meeting}</span>}
                <span style={chip}>{log.contactType}</span>
                <span style={{ ...chip, background: visBg(log.visibility) }}>
                  {VISIBILITY_LABEL[log.visibility]}
                </span>
                {log.status === "draft" && <span style={{ ...chip, background: "#fde68a" }}>下書き</span>}
                {log.audioPath && <span title="録音あり">🎧</span>}
                <strong style={{ fontSize: 13 }}>{log.title || "(無題)"}</strong>
              </div>
              {isMeeting && companies.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                  {companies.map((n) => (
                    <span key={n} style={{ ...chip, fontWeight: 600, background: "#f1f5f9" }}>
                      {n}
                    </span>
                  ))}
                </div>
              )}
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
                {!isMeeting && log.customerName ? `${log.customerName}` : ""}
                {!isMeeting && log.contactPersonName ? ` / ${log.contactPersonName}` : ""}
                {!isMeeting && (log.customerName || log.contactPersonName) && log.body ? " — " : ""}
                {(log.body || log.transcript).slice(0, 120)}
              </div>
            </button>
          );
        })}
      </div>

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
