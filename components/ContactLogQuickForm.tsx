"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { ContactType, ContactVisibility, Customer, CustomerContact } from "@/types/crm";
import { CONTACT_TYPES, VISIBILITY_HINT, VISIBILITY_LABEL } from "@/types/crm";
import { saveContactLog } from "@/lib/crmStorage";
import { Btn, Inp, Modal } from "@/components/ui/primitives";
import SpeechInputButton from "@/components/SpeechInputButton";
import { T } from "@/lib/constants";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  customers: Customer[];
  contacts?: CustomerContact[];
  /** 顧客固定（顧客詳細から） */
  fixedCustomerId?: string;
  /** 案件固定（案件詳細から） */
  fixedProjectId?: string;
  defaultTitle?: string;
};

export default function ContactLogQuickForm({
  open,
  onClose,
  onSaved,
  customers,
  contacts = [],
  fixedCustomerId,
  fixedProjectId,
  defaultTitle = "",
}: Props) {
  const [customerId, setCustomerId] = useState(fixedCustomerId ?? "");
  const [contactPersonId, setContactPersonId] = useState("");
  const [contactDate, setContactDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [contactType, setContactType] = useState<ContactType>("電話");
  const [title, setTitle] = useState(defaultTitle);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<ContactVisibility>("company");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomerId(fixedCustomerId ?? "");
    setContactPersonId("");
    setContactDate(new Date().toISOString().slice(0, 10));
    setContactType("電話");
    setTitle(defaultTitle);
    setBody("");
    setVisibility("company");
  }, [open, fixedCustomerId, defaultTitle]);

  const submit = async () => {
    if (!customerId) {
      alert("顧客を選択してください");
      return;
    }
    if (!body.trim() && !title.trim()) {
      alert("タイトルか本文を入力してください");
      return;
    }
    setSaving(true);
    try {
      await saveContactLog({
        customerId,
        projectId: fixedProjectId ?? "",
        contactPersonId: contactPersonId || undefined,
        contactDate,
        contactType,
        title,
        body,
        visibility,
      });
      onSaved();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="＋ 商談メモ" w={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0 8px" }}>
        {!fixedCustomerId && (
          <label style={lab}>
            顧客（会社）
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              style={sel}
            >
              <option value="">選択…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {contacts.length > 0 && (
          <label style={lab}>
            担当者（任意）
            <select
              value={contactPersonId}
              onChange={(e) => setContactPersonId(e.target.value)}
              style={sel}
            >
              <option value="">指定なし</option>
              {contacts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.title ? `（${p.title}）` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ ...lab, flex: 1 }}>
            日付
            <Inp
              type="date"
              value={contactDate}
              onChange={(e) => setContactDate(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
          <label style={{ ...lab, flex: 1 }}>
            種別
            <select
              value={contactType}
              onChange={(e) => setContactType(e.target.value as ContactType)}
              style={sel}
            >
              {CONTACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label style={lab}>
          タイトル
          <Inp value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
        </label>
        <label style={lab}>
          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            本文
            <SpeechInputButton
              onResult={(t) =>
                setBody((prev) => (prev ? `${prev}${prev.endsWith("\n") ? "" : "\n"}${t}` : t))
              }
            />
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: 4,
              padding: 10,
              borderRadius: 8,
              border: `1px solid ${T.bd}`,
              fontFamily: "inherit",
              fontSize: 14,
            }}
          />
        </label>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.ts, marginBottom: 6 }}>公開範囲</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["company", "executive", "private"] as ContactVisibility[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                title={VISIBILITY_HINT[v]}
                style={{
                  border: visibility === v ? `2px solid ${T.ac}` : `1px solid ${T.bd}`,
                  borderRadius: 999,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: visibility === v ? "#eff6ff" : "#fff",
                  color: T.tx,
                }}
              >
                {VISIBILITY_LABEL[v]}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: T.ts, marginTop: 4 }}>{VISIBILITY_HINT[visibility]}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <Btn v="ghost" sm onClick={onClose}>
            キャンセル
          </Btn>
          <Btn v="primary" sm onClick={() => void submit()} disabled={saving}>
            {saving ? "保存中…" : "保存"}
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
