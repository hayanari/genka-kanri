"use client";

import { useCallback, useEffect, useState } from "react";
import type { Customer } from "@/types/crm";
import type { ContactLog } from "@/types/crm";
import {
  deleteCustomer,
  loadContactLogs,
  loadCustomers,
  upsertCustomer,
} from "@/lib/crmStorage";
import ContactLogQuickForm from "@/components/ContactLogQuickForm";
import ContactLogList from "@/components/ContactLogList";
import { Btn, Card, Inp, Modal } from "@/components/ui/primitives";
import { Icons, T } from "@/lib/constants";
import { useUserRole } from "@/lib/roles";

type Props = {
  /** 案件詳細から顧客名で紐づけたいとき */
  initialCustomerName?: string;
};

export default function CustomersBoard({}: Props) {
  const { role } = useUserRole();
  const readOnly = role === "viewer";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<ContactLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Customer>>({});
  const [memoOpen, setMemoOpen] = useState(false);

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
        "顧客の読み込みに失敗しました。Supabase で supabase/crm.sql を実行してください。"
      );
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) {
      setLogs([]);
      return;
    }
    void loadContactLogs({ customerId: selectedId }).then(setLogs).catch(() => setLogs([]));
  }, [selectedId]);

  const filtered = customers.filter((c) => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return (
      c.name.toLowerCase().includes(s) ||
      c.contactPerson.toLowerCase().includes(s) ||
      c.phone.includes(s)
    );
  });

  const openNew = () => {
    setEditing({
      name: "",
      contactPerson: "",
      phone: "",
      email: "",
      address: "",
      note: "",
    });
    setEditOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing({ ...c });
    setEditOpen(true);
  };

  const saveCustomer = async () => {
    if (!editing.name?.trim()) {
      alert("会社名は必須です");
      return;
    }
    try {
      const saved = await upsertCustomer({
        id: editing.id,
        name: editing.name.trim(),
        contactPerson: editing.contactPerson ?? "",
        phone: editing.phone ?? "",
        email: editing.email ?? "",
        address: editing.address ?? "",
        note: editing.note ?? "",
      });
      setEditOpen(false);
      await reload();
      setSelectedId(saved.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  const remove = async (c: Customer) => {
    if (!window.confirm(`「${c.name}」を削除しますか？（関連メモも消えます）`)) return;
    try {
      await deleteCustomer(c.id);
      setSelectedId(null);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  if (loading) return <div style={{ color: T.ts }}>顧客を読み込み中…</div>;
  if (loadError) return <Card><div style={{ color: "#b91c1c" }}>{loadError}</div></Card>;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>顧客・商談</h2>
        <Inp
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="顧客名・担当で絞り込み"
          style={{ minWidth: 200 }}
        />
        <span style={{ flex: 1 }} />
        {!readOnly && (
          <Btn v="primary" sm onClick={openNew}>
            {Icons.plus} 顧客追加
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
          {filtered.length === 0 ? (
            <div style={{ color: T.ts, fontSize: 13, padding: 8 }}>顧客がありません</div>
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
                  <div style={{ fontSize: 11, color: T.ts }}>
                    {c.contactPerson || "—"} {c.phone ? `/ ${c.phone}` : ""}
                  </div>
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
                  <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>{selected.name}</h3>
                  <div style={{ fontSize: 13, color: T.ts, lineHeight: 1.7 }}>
                    <div>担当: {selected.contactPerson || "—"}</div>
                    <div>TEL: {selected.phone || "—"}</div>
                    <div>Email: {selected.email || "—"}</div>
                    <div>住所: {selected.address || "—"}</div>
                    {selected.note && <div style={{ marginTop: 6 }}>メモ: {selected.note}</div>}
                  </div>
                </div>
                {!readOnly && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn sm onClick={() => setMemoOpen(true)}>
                      ＋ メモ
                    </Btn>
                    <Btn sm v="ghost" onClick={() => openEdit(selected)}>
                      編集
                    </Btn>
                    <Btn sm v="ghost" onClick={() => void remove(selected)} style={{ color: "#b91c1c" }}>
                      削除
                    </Btn>
                  </div>
                )}
              </div>
            </Card>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>商談履歴</div>
              <ContactLogList
                logs={logs}
                onChanged={() =>
                  void loadContactLogs({ customerId: selected.id }).then(setLogs)
                }
              />
            </div>
          </div>
        )}
      </div>

      {editOpen && (
        <Modal
          title={editing.id ? "顧客を編集" : "顧客を追加"}
          onClose={() => setEditOpen(false)}
          w={480}
        >
          {(
            [
              ["name", "会社名 *"],
              ["contactPerson", "担当者"],
              ["phone", "電話"],
              ["email", "メール"],
              ["address", "住所"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} style={{ display: "block", marginBottom: 8, fontSize: 12 }}>
              <span style={{ color: T.ts, fontWeight: 600 }}>{label}</span>
              <Inp
                value={String(editing[key] ?? "")}
                onChange={(e) => setEditing((p) => ({ ...p, [key]: e.target.value }))}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
          ))}
          <label style={{ display: "block", marginBottom: 8, fontSize: 12 }}>
            <span style={{ color: T.ts, fontWeight: 600 }}>備考</span>
            <textarea
              value={editing.note ?? ""}
              onChange={(e) => setEditing((p) => ({ ...p, note: e.target.value }))}
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
            <Btn v="ghost" sm onClick={() => setEditOpen(false)}>
              キャンセル
            </Btn>
            <Btn v="primary" sm onClick={() => void saveCustomer()}>
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
          fixedCustomerId={selected.id}
          onSaved={() => void loadContactLogs({ customerId: selected.id }).then(setLogs)}
        />
      )}
    </div>
  );
}
