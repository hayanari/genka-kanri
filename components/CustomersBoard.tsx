"use client";

import { useCallback, useEffect, useState } from "react";
import type { ContactLog, Customer, CustomerContact } from "@/types/crm";
import {
  deleteCustomer,
  deleteCustomerContact,
  loadContactLogs,
  loadCustomerContacts,
  loadCustomers,
  upsertCustomer,
  upsertCustomerContact,
} from "@/lib/crmStorage";
import ContactLogQuickForm from "@/components/ContactLogQuickForm";
import ContactLogList from "@/components/ContactLogList";
import MeetingMemoForm from "@/components/MeetingMemoForm";
import { Btn, Card, Inp, Modal } from "@/components/ui/primitives";
import { Icons, T } from "@/lib/constants";
import { useUserRole } from "@/lib/roles";

export default function CustomersBoard() {
  const { role } = useUserRole();
  const readOnly = role === "viewer";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [logs, setLogs] = useState<ContactLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [companyEditOpen, setCompanyEditOpen] = useState(false);
  const [companyDraft, setCompanyDraft] = useState<Partial<Customer>>({});
  const [personEditOpen, setPersonEditOpen] = useState(false);
  const [personDraft, setPersonDraft] = useState<Partial<CustomerContact>>({});
  const [memoOpen, setMemoOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<ContactLog | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await loadCustomers();
      setCustomers(list);
      if (selectedId && !list.some((c) => c.id === selectedId)) setSelectedId(null);
    } catch (e) {
      console.error(e);
      setLoadError(
        "顧客の読み込みに失敗しました。Supabase で supabase/crm.sql と supabase/crm_contacts.sql を実行してください。"
      );
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  const reloadDetail = useCallback(async (customerId: string) => {
    try {
      const [people, memos] = await Promise.all([
        loadCustomerContacts(customerId),
        loadContactLogs({ customerId }),
      ]);
      setContacts(people);
      setLogs(memos);
    } catch {
      setContacts([]);
      setLogs([]);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setContacts([]);
      setLogs([]);
      return;
    }
    void reloadDetail(selectedId);
  }, [selectedId, reloadDetail]);

  const filtered = customers.filter((c) => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return (
      c.name.toLowerCase().includes(s) ||
      c.address.toLowerCase().includes(s) ||
      c.note.toLowerCase().includes(s)
    );
  });

  const openNewCompany = () => {
    setCompanyDraft({ name: "", address: "", phone: "", email: "", note: "" });
    setCompanyEditOpen(true);
  };

  const openEditCompany = (c: Customer) => {
    setCompanyDraft({ ...c });
    setCompanyEditOpen(true);
  };

  const saveCompany = async () => {
    if (!companyDraft.name?.trim()) {
      alert("会社名は必須です");
      return;
    }
    try {
      const saved = await upsertCustomer({
        id: companyDraft.id,
        name: companyDraft.name.trim(),
        contactPerson: "",
        phone: companyDraft.phone ?? "",
        email: companyDraft.email ?? "",
        address: companyDraft.address ?? "",
        note: companyDraft.note ?? "",
      });
      setCompanyEditOpen(false);
      await reload();
      setSelectedId(saved.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  const removeCompany = async (c: Customer) => {
    if (!window.confirm(`「${c.name}」を削除しますか？（担当者・メモも消えます）`)) return;
    try {
      await deleteCustomer(c.id);
      setSelectedId(null);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const openNewPerson = () => {
    if (!selectedId) return;
    setPersonDraft({
      customerId: selectedId,
      name: "",
      title: "",
      phone: "",
      email: "",
      note: "",
    });
    setPersonEditOpen(true);
  };

  const openEditPerson = (p: CustomerContact) => {
    setPersonDraft({ ...p });
    setPersonEditOpen(true);
  };

  const savePerson = async () => {
    if (!selectedId) return;
    if (!personDraft.name?.trim()) {
      alert("担当者名は必須です");
      return;
    }
    try {
      await upsertCustomerContact({
        id: personDraft.id,
        customerId: selectedId,
        name: personDraft.name.trim(),
        title: personDraft.title ?? "",
        phone: personDraft.phone ?? "",
        email: personDraft.email ?? "",
        note: personDraft.note ?? "",
      });
      setPersonEditOpen(false);
      await reloadDetail(selectedId);
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  const removePerson = async (p: CustomerContact) => {
    if (!selectedId) return;
    if (!window.confirm(`担当者「${p.name}」を削除しますか？`)) return;
    try {
      await deleteCustomerContact(p.id);
      await reloadDetail(selectedId);
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  if (loading) return <div style={{ color: T.ts }}>顧客を読み込み中…</div>;
  if (loadError)
    return (
      <Card>
        <div style={{ color: "#b91c1c" }}>{loadError}</div>
      </Card>
    );

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20 }}>顧客・商談</h2>
        <Inp
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="会社名で絞り込み"
          style={{ minWidth: 200 }}
        />
        <span style={{ flex: 1 }} />
        {!readOnly && (
          <Btn v="primary" sm onClick={openNewCompany}>
            {Icons.plus} 会社を追加
          </Btn>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selected ? "minmax(220px, 280px) 1fr" : "1fr",
          gap: 12,
          alignItems: "start",
        }}
      >
        <Card style={{ padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.ts, marginBottom: 8 }}>会社一覧</div>
          {filtered.length === 0 ? (
            <div style={{ color: T.ts, fontSize: 13, padding: 8 }}>会社がありません</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  style={{
                    textAlign: "left",
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 12px",
                    cursor: "pointer",
                    background: selectedId === c.id ? "#eff6ff" : "transparent",
                    color: T.tx,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                  {c.address && (
                    <div style={{ fontSize: 11, color: T.ts, marginTop: 2 }}>{c.address}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </Card>

        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Card>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: T.ts, fontWeight: 600 }}>会社</div>
                  <h3 style={{ margin: "2px 0 8px", fontSize: 18 }}>{selected.name}</h3>
                  <div style={{ fontSize: 13, color: T.ts, lineHeight: 1.7 }}>
                    <div>代表TEL: {selected.phone || "—"}</div>
                    <div>代表メール: {selected.email || "—"}</div>
                    <div>住所: {selected.address || "—"}</div>
                    {selected.note && <div style={{ marginTop: 6 }}>メモ: {selected.note}</div>}
                  </div>
                </div>
                {!readOnly && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Btn sm onClick={() => setMemoOpen(true)}>
                      ＋ メモ
                    </Btn>
                    <Btn
                      sm
                      onClick={() => {
                        setEditingMeeting(null);
                        setMeetingOpen(true);
                      }}
                      title="複数社・複数担当者の打合せを1件で記録"
                    >
                      ＋ 会議メモ
                    </Btn>
                    <Btn sm v="ghost" onClick={() => openEditCompany(selected)}>
                      会社編集
                    </Btn>
                    <Btn
                      sm
                      v="ghost"
                      onClick={() => void removeCompany(selected)}
                      style={{ color: "#b91c1c" }}
                    >
                      削除
                    </Btn>
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <strong style={{ fontSize: 14 }}>担当者</strong>
                {!readOnly && (
                  <Btn sm onClick={openNewPerson}>
                    ＋ 担当者を追加
                  </Btn>
                )}
              </div>
              {contacts.length === 0 ? (
                <div style={{ color: T.ts, fontSize: 13 }}>
                  まだ担当者がいません。「＋ 担当者を追加」から登録してください。
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {contacts.map((person) => (
                    <div
                      key={person.id}
                      style={{
                        border: `1px solid ${T.bd}`,
                        borderRadius: 8,
                        padding: "10px 12px",
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {person.name}
                          {person.title ? (
                            <span style={{ fontWeight: 500, color: T.ts, marginLeft: 8, fontSize: 12 }}>
                              {person.title}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 12, color: T.ts, marginTop: 4, lineHeight: 1.6 }}>
                          <div>TEL: {person.phone || "—"}</div>
                          <div>Email: {person.email || "—"}</div>
                          {person.note && <div>メモ: {person.note}</div>}
                        </div>
                      </div>
                      {!readOnly && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <Btn sm v="ghost" onClick={() => openEditPerson(person)}>
                            編集
                          </Btn>
                          <Btn
                            sm
                            v="ghost"
                            onClick={() => void removePerson(person)}
                            style={{ color: "#b91c1c" }}
                          >
                            削除
                          </Btn>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>商談履歴</div>
              <ContactLogList
                logs={logs}
                onChanged={() => {
                  if (selectedId) void reloadDetail(selectedId);
                }}
                onEditMeeting={
                  readOnly
                    ? undefined
                    : (log) => {
                        setEditingMeeting(log);
                        setMeetingOpen(true);
                      }
                }
              />
            </div>
          </div>
        )}
      </div>

      {companyEditOpen && (
        <Modal
          title={companyDraft.id ? "会社を編集" : "会社を追加"}
          onClose={() => setCompanyEditOpen(false)}
          w={480}
        >
          <p style={{ fontSize: 12, color: T.ts, marginTop: 0 }}>
            まず会社を登録し、担当者は会社の詳細から追加します。
          </p>
          {(
            [
              ["name", "会社名 *"],
              ["phone", "代表電話"],
              ["email", "代表メール"],
              ["address", "住所"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} style={{ display: "block", marginBottom: 8, fontSize: 12 }}>
              <span style={{ color: T.ts, fontWeight: 600 }}>{label}</span>
              <Inp
                value={String(companyDraft[key] ?? "")}
                onChange={(e) => setCompanyDraft((p) => ({ ...p, [key]: e.target.value }))}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
          ))}
          <label style={{ display: "block", marginBottom: 8, fontSize: 12 }}>
            <span style={{ color: T.ts, fontWeight: 600 }}>備考</span>
            <textarea
              value={companyDraft.note ?? ""}
              onChange={(e) => setCompanyDraft((p) => ({ ...p, note: e.target.value }))}
              rows={3}
              style={{
                width: "100%",
                marginTop: 4,
                boxSizing: "border-box",
                padding: 10,
                borderRadius: 8,
                border: `1px solid ${T.bd}`,
                fontFamily: "inherit",
              }}
            />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn v="ghost" sm onClick={() => setCompanyEditOpen(false)}>
              キャンセル
            </Btn>
            <Btn v="primary" sm onClick={() => void saveCompany()}>
              保存
            </Btn>
          </div>
        </Modal>
      )}

      {personEditOpen && (
        <Modal
          title={personDraft.id ? "担当者を編集" : "担当者を追加"}
          onClose={() => setPersonEditOpen(false)}
          w={480}
        >
          {(
            [
              ["name", "氏名 *"],
              ["title", "役職・部署"],
              ["phone", "電話"],
              ["email", "メール"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} style={{ display: "block", marginBottom: 8, fontSize: 12 }}>
              <span style={{ color: T.ts, fontWeight: 600 }}>{label}</span>
              <Inp
                value={String(personDraft[key] ?? "")}
                onChange={(e) => setPersonDraft((p) => ({ ...p, [key]: e.target.value }))}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
          ))}
          <label style={{ display: "block", marginBottom: 8, fontSize: 12 }}>
            <span style={{ color: T.ts, fontWeight: 600 }}>メモ</span>
            <textarea
              value={personDraft.note ?? ""}
              onChange={(e) => setPersonDraft((p) => ({ ...p, note: e.target.value }))}
              rows={3}
              style={{
                width: "100%",
                marginTop: 4,
                boxSizing: "border-box",
                padding: 10,
                borderRadius: 8,
                border: `1px solid ${T.bd}`,
                fontFamily: "inherit",
              }}
            />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn v="ghost" sm onClick={() => setPersonEditOpen(false)}>
              キャンセル
            </Btn>
            <Btn v="primary" sm onClick={() => void savePerson()}>
              保存
            </Btn>
          </div>
        </Modal>
      )}

      {selected && (
        <ContactLogQuickForm
          open={memoOpen}
          onClose={() => setMemoOpen(false)}
          customers={customers}
          contacts={contacts}
          fixedCustomerId={selected.id}
          onSaved={() => {
            if (selectedId) void reloadDetail(selectedId);
          }}
        />
      )}

      {selected && (
        <MeetingMemoForm
          open={meetingOpen}
          onClose={() => {
            setMeetingOpen(false);
            setEditingMeeting(null);
          }}
          customers={customers}
          initialCustomerId={selected.id}
          existing={editingMeeting}
          onSaved={() => {
            if (selectedId) void reloadDetail(selectedId);
          }}
        />
      )}
    </div>
  );
}
