"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type {
  ContactLog,
  ContactLogStatus,
  ContactType,
  ContactVisibility,
  Customer,
  CustomerContact,
} from "@/types/crm";
import { MEETING_TYPES } from "@/types/crm";
import VisibilityPicker from "@/components/VisibilityPicker";
import {
  loadCustomerContacts,
  saveContactLog,
  upsertCustomerContact,
  type AttendeeInput,
} from "@/lib/crmStorage";
import { AUDIO_ACCEPT, deleteCrmAudio, uploadCrmAudio, type CrmAudioAttachment } from "@/lib/crmAudio";
import { Btn, Inp, Modal } from "@/components/ui/primitives";
import SpeechInputButton from "@/components/SpeechInputButton";
import { T } from "@/lib/constants";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (saved: ContactLog) => void;
  customers: Customer[];
  /** 最初から出席会社に入れる（顧客詳細から開いた場合） */
  initialCustomerId?: string;
  /** 案件固定（案件詳細から） */
  fixedProjectId?: string;
  defaultTitle?: string;
  /** 編集対象（会議メモ） */
  existing?: ContactLog | null;
};

const personKey = (customerId: string, personId: string) => `${customerId}|${personId}`;

/**
 * 会議メモ（JV など複数社・複数担当者）
 * 1件の会議を出席会社すべてのタイムラインに出す。複製しない。
 */
export default function MeetingMemoForm({
  open,
  onClose,
  onSaved,
  customers,
  initialCustomerId,
  fixedProjectId,
  defaultTitle = "",
  existing,
}: Props) {
  const [contactDate, setContactDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [contactType, setContactType] = useState<ContactType>("対面");
  const [title, setTitle] = useState(defaultTitle);
  const [body, setBody] = useState("");
  const [transcript, setTranscript] = useState("");
  const [visibility, setVisibility] = useState<ContactVisibility>("company");
  const [viewerIds, setViewerIds] = useState<string[]>([]);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [people, setPeople] = useState<Set<string>>(new Set());
  const [contactsByCustomer, setContactsByCustomer] = useState<Record<string, CustomerContact[]>>({});
  const [newPersonName, setNewPersonName] = useState<Record<string, string>>({});
  const [addCompanyId, setAddCompanyId] = useState("");
  const [audio, setAudio] = useState<CrmAudioAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [saving, setSaving] = useState(false);
  const uploadedThisSession = useRef<string | null>(null);
  const savedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const ensureContacts = async (customerId: string) => {
    if (contactsByCustomer[customerId]) return;
    try {
      const list = await loadCustomerContacts(customerId);
      setContactsByCustomer((prev) => ({ ...prev, [customerId]: list }));
    } catch {
      setContactsByCustomer((prev) => ({ ...prev, [customerId]: [] }));
    }
  };

  // 開くたびに初期化
  useEffect(() => {
    if (!open) return;
    savedRef.current = false;
    uploadedThisSession.current = null;
    setAddCompanyId("");
    setNewPersonName({});
    setContactsByCustomer({});
    if (existing) {
      setContactDate(existing.contactDate);
      setContactType(MEETING_TYPES.includes(existing.contactType) ? existing.contactType : "対面");
      setTitle(existing.title);
      setBody(existing.body);
      setTranscript(existing.transcript);
      setVisibility(existing.visibility);
      setViewerIds((existing.viewers ?? []).map((v) => v.userId));
      setAudio(existing.audioPath ? { path: existing.audioPath, name: existing.audioName } : null);
      setShowTranscript(Boolean(existing.transcript));
      const ids: string[] = [];
      const ppl = new Set<string>();
      for (const a of existing.attendees ?? []) {
        if (!ids.includes(a.customerId)) ids.push(a.customerId);
        if (a.contactPersonId) ppl.add(personKey(a.customerId, a.contactPersonId));
      }
      if (ids.length === 0 && existing.customerId) ids.push(existing.customerId);
      setCompanyIds(ids);
      setPeople(ppl);
      ids.forEach((id) => void ensureContacts(id));
    } else {
      setContactDate(new Date().toISOString().slice(0, 10));
      setContactType("対面");
      setTitle(defaultTitle);
      setBody("");
      setTranscript("");
      setVisibility("company");
      setViewerIds([]);
      setAudio(null);
      setShowTranscript(false);
      const ids = initialCustomerId ? [initialCustomerId] : [];
      setCompanyIds(ids);
      setPeople(new Set());
      ids.forEach((id) => void ensureContacts(id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id, initialCustomerId, defaultTitle]);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "（不明）";
  const available = customers.filter((c) => !companyIds.includes(c.id));

  const addCompany = (id: string) => {
    if (!id || companyIds.includes(id)) return;
    setCompanyIds((prev) => [...prev, id]);
    setAddCompanyId("");
    void ensureContacts(id);
  };

  const removeCompany = (id: string) => {
    setCompanyIds((prev) => prev.filter((c) => c !== id));
    setPeople((prev) => {
      const next = new Set(prev);
      for (const k of prev) if (k.startsWith(`${id}|`)) next.delete(k);
      return next;
    });
  };

  const togglePerson = (customerId: string, personId: string) => {
    const k = personKey(customerId, personId);
    setPeople((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const quickAddPerson = async (customerId: string) => {
    const name = (newPersonName[customerId] ?? "").trim();
    if (!name) return;
    try {
      const saved = await upsertCustomerContact({ customerId, name });
      setContactsByCustomer((prev) => ({
        ...prev,
        [customerId]: [...(prev[customerId] ?? []), saved],
      }));
      setPeople((prev) => new Set(prev).add(personKey(customerId, saved.id)));
      setNewPersonName((prev) => ({ ...prev, [customerId]: "" }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "担当者の追加に失敗しました");
    }
  };

  const onPickAudio = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      if (audio && uploadedThisSession.current === audio.path) await deleteCrmAudio(audio.path);
      const up = await uploadCrmAudio(file);
      uploadedThisSession.current = up.path;
      setAudio(up);
    } catch (e) {
      alert(e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const buildAttendees = (): AttendeeInput[] => {
    const out: AttendeeInput[] = [];
    for (const cid of companyIds) {
      const selected = (contactsByCustomer[cid] ?? []).filter((p) => people.has(personKey(cid, p.id)));
      if (selected.length === 0) out.push({ customerId: cid });
      else selected.forEach((p) => out.push({ customerId: cid, contactPersonId: p.id }));
    }
    return out;
  };

  const submit = async (status: ContactLogStatus) => {
    if (companyIds.length === 0) {
      alert("出席した会社を1社以上追加してください");
      return;
    }
    if (!title.trim() && !body.trim() && !transcript.trim()) {
      alert("タイトル・本文・文字起こしのいずれかを入力してください");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveContactLog({
        id: existing?.id,
        customerId: companyIds[0],
        projectId: fixedProjectId ?? existing?.projectId ?? "",
        contactDate,
        contactType,
        title,
        body,
        visibility,
        viewerIds,
        kind: "meeting",
        status,
        transcript,
        audioPath: audio?.path ?? "",
        audioName: audio?.name ?? "",
        attendees: buildAttendees(),
      });
      savedRef.current = true;
      onSaved(saved);
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    // 保存せず閉じた場合、この画面でアップロードした音声は消す
    if (!savedRef.current && uploadedThisSession.current) {
      void deleteCrmAudio(uploadedThisSession.current);
    }
    onClose();
  };

  const busy = saving || uploading;

  return (
    <Modal open={open} onClose={handleClose} title={existing ? "会議メモを編集" : "＋ 会議メモ"} w={680}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 0 8px" }}>
        <p style={{ margin: 0, fontSize: 12, color: T.ts }}>
          共同企業体（JV）など複数社の打合せは、ここで1件だけ登録すれば出席した各社の商談履歴に同じ会議が表示されます。
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label style={{ ...lab, flex: 1, minWidth: 140 }}>
            日付
            <Inp type="date" value={contactDate} onChange={(e) => setContactDate(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label style={{ ...lab, flex: 1, minWidth: 140 }}>
            形式
            <select value={contactType} onChange={(e) => setContactType(e.target.value as ContactType)} style={sel}>
              {MEETING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label style={lab}>
          会議名
          <Inp
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: ○○下水道工事 JV定例（第3回）"
            style={{ width: "100%" }}
          />
        </label>

        {/* 出席者 */}
        <div>
          <div style={{ ...lab, marginBottom: 6 }}>出席者（会社 → 担当者）</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {companyIds.map((cid) => {
              const list = contactsByCustomer[cid];
              return (
                <div key={cid} style={{ border: `1px solid ${T.bd}`, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: 13, flex: 1 }}>{customerName(cid)}</strong>
                    <button type="button" onClick={() => removeCompany(cid)} style={linkBtn} title="この会社を外す">
                      外す
                    </button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {list === undefined ? (
                      <span style={{ fontSize: 12, color: T.ts }}>担当者を読み込み中…</span>
                    ) : list.length === 0 ? (
                      <span style={{ fontSize: 12, color: T.ts }}>担当者未登録（会社のみで記録）</span>
                    ) : (
                      list.map((p) => {
                        const on = people.has(personKey(cid, p.id));
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => togglePerson(cid, p.id)}
                            style={{
                              border: on ? `2px solid ${T.ac}` : `1px solid ${T.bd}`,
                              background: on ? "#eff6ff" : "#fff",
                              borderRadius: 999,
                              padding: "4px 10px",
                              fontSize: 12,
                              cursor: "pointer",
                              color: T.tx,
                            }}
                          >
                            {on ? "✓ " : ""}
                            {p.name}
                            {p.title ? <span style={{ color: T.ts }}>（{p.title}）</span> : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <Inp
                      value={newPersonName[cid] ?? ""}
                      onChange={(e) => setNewPersonName((prev) => ({ ...prev, [cid]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void quickAddPerson(cid);
                        }
                      }}
                      placeholder="新しい担当者名を追加（Enter）"
                      style={{ flex: 1, padding: "6px 10px", fontSize: 12 }}
                    />
                    <Btn sm v="ghost" onClick={() => void quickAddPerson(cid)}>
                      追加
                    </Btn>
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 6 }}>
              <select value={addCompanyId} onChange={(e) => setAddCompanyId(e.target.value)} style={{ ...sel, flex: 1 }}>
                <option value="">出席した会社を追加…</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Btn sm onClick={() => addCompany(addCompanyId)} disabled={!addCompanyId}>
                追加
              </Btn>
            </div>
          </div>
        </div>

        {/* 音声・文字起こし */}
        <div style={{ border: `1px dashed ${T.bd}`, borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ ...lab, marginBottom: 6 }}>録音・文字起こし（Plaud など）</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              ref={fileRef}
              type="file"
              accept={AUDIO_ACCEPT}
              style={{ display: "none" }}
              onChange={(e) => void onPickAudio(e.target.files?.[0] ?? null)}
            />
            <Btn sm v="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
              {uploading ? "アップロード中…" : audio ? "音声を差し替え" : "音声ファイルを添付"}
            </Btn>
            {audio && (
              <span style={{ fontSize: 12, color: T.ts, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 240 }}>
                🎧 {audio.name || audio.path.split("/").pop()}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => setShowTranscript((v) => !v)} style={linkBtn}>
              {showTranscript ? "文字起こしを隠す" : transcript ? "文字起こしを表示" : "書き起こしテキストを貼り付け"}
            </button>
          </div>
          {showTranscript && (
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={6}
              placeholder="Plaud の書き起こしテキストをここに貼り付け。誤認識は自由に直せます。原文として残り、下の議事録とは別に保存されます。"
              style={{ ...ta, marginTop: 8 }}
            />
          )}
          <div style={{ fontSize: 11, color: T.ts, marginTop: 8 }}>
            録音と書き起こしは原文として保存されます。議事録は下の本文に整理して書き、確認が済んだら「確定して保存」。
          </div>
        </div>

        {/* 議事録本文 */}
        <label style={lab}>
          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            議事録（本文）
            <SpeechInputButton
              onResult={(t) => setBody((prev) => (prev ? `${prev}${prev.endsWith("\n") ? "" : "\n"}${t}` : t))}
            />
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder={"■ 議題\n■ 決定事項\n■ 宿題（担当 / 期限）\n■ 次回"}
            style={{ ...ta, marginTop: 4 }}
          />
        </label>

        <VisibilityPicker
          visibility={visibility}
          onVisibilityChange={setVisibility}
          viewerIds={viewerIds}
          onViewerIdsChange={setViewerIds}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          <Btn v="ghost" sm onClick={handleClose} disabled={saving}>
            キャンセル
          </Btn>
          <Btn sm onClick={() => void submit("draft")} disabled={busy}>
            {saving ? "保存中…" : "下書きとして保存"}
          </Btn>
          <Btn v="primary" sm onClick={() => void submit("confirmed")} disabled={busy}>
            {saving ? "保存中…" : "確定して保存"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

const lab: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
  color: T.ts,
};
const sel: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${T.bd}`,
  fontSize: 14,
  fontFamily: "inherit",
  background: "#fff",
};
const ta: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: 10,
  borderRadius: 8,
  border: `1px solid ${T.bd}`,
  fontFamily: "inherit",
  fontSize: 14,
  lineHeight: 1.6,
};
const linkBtn: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#2563eb",
  fontSize: 12,
  cursor: "pointer",
  padding: 0,
};
