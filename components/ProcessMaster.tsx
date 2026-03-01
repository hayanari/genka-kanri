"use client";

import { useState } from "react";
import { T, Icons } from "@/lib/constants";
import { genId } from "@/lib/constants";
import type { ProcessMaster as ProcessMasterType } from "@/lib/utils";
import { Card, Btn } from "./ui/primitives";

const Inp = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
  type?: string;
}) => (
  <div>
    <label
      style={{
        display: "block",
        fontSize: "12px",
        fontWeight: 600,
        color: T.ts,
        marginBottom: "6px",
      }}
    >
      {label}
    </label>
    {type === "textarea" ? (
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={3}
        style={{
          width: "100%",
          padding: "10px 12px",
          background: T.s,
          border: `1px solid ${T.bd}`,
          borderRadius: "8px",
          color: T.tx,
          fontSize: "13px",
          fontFamily: "inherit",
          outline: "none",
          boxSizing: "border-box",
          resize: "vertical",
        }}
      />
    ) : (
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "10px 12px",
          background: T.s,
          border: `1px solid ${T.bd}`,
          borderRadius: "8px",
          color: T.tx,
          fontSize: "13px",
          fontFamily: "inherit",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    )}
  </div>
);

const parseDefaultSubs = (s: string): string[] =>
  s
    .split(/[、,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export default function ProcessMaster({
  processMasters,
  onUpdate,
}: {
  processMasters: ProcessMasterType[];
  onUpdate: (list: ProcessMasterType[]) => void;
}) {
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<ProcessMasterType | null>(null);
  const [newForm, setNewForm] = useState({ name: "", icon: "📌", defaultSubs: "" });
  const [editForm, setEditForm] = useState({ name: "", icon: "", defaultSubs: "" });

  const handleAdd = () => {
    const name = newForm.name.trim();
    if (!name) return;
    const defaultSubs = parseDefaultSubs(newForm.defaultSubs);
    const maxOrder = Math.max(0, ...processMasters.map((p) => p.sortOrder ?? 0));
    onUpdate([
      ...processMasters,
      {
        id: `pm${Date.now().toString(36)}`,
        name,
        icon: newForm.icon || "📌",
        defaultSubs,
        sortOrder: maxOrder + 1,
      },
    ]);
    setNewForm({ name: "", icon: "📌", defaultSubs: "" });
    setAddModal(false);
  };

  const handleUpdate = () => {
    if (!editModal) return;
    const name = editForm.name.trim();
    if (!name) return;
    const defaultSubs = parseDefaultSubs(editForm.defaultSubs);
    onUpdate(
      processMasters.map((p) =>
        p.id === editModal.id
          ? { ...p, name, icon: editForm.icon || "📌", defaultSubs }
          : p
      )
    );
    setEditModal(null);
  };

  const handleDelete = (pm: ProcessMasterType) => {
    if (!confirm(`「${pm.name}」を工程マスタから削除しますか？`)) return;
    onUpdate(processMasters.filter((x) => x.id !== pm.id));
    if (editModal?.id === pm.id) setEditModal(null);
  };

  const openEdit = (pm: ProcessMasterType) => {
    setEditModal(pm);
    setEditForm({
      name: pm.name,
      icon: pm.icon,
      defaultSubs: (pm.defaultSubs || []).join("\n"),
    });
  };

  const sorted = [...processMasters].sort(
    (a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "22px",
              color: T.tx,
              fontWeight: 700,
            }}
          >
            工程マスタ
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: T.ts }}>
            設計書の工種に対応。{processMasters.length}件登録
          </p>
        </div>
        <Btn v="primary" onClick={() => setAddModal(true)}>
          {Icons.plus} 工程追加
        </Btn>
      </div>

      <Card>
        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.bd}` }}>
                <th
                  style={{
                    padding: "10px 12px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: T.ts,
                    textAlign: "left",
                  }}
                >
                  アイコン
                </th>
                <th
                  style={{
                    padding: "10px 12px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: T.ts,
                    textAlign: "left",
                  }}
                >
                  工程名
                </th>
                <th
                  style={{
                    padding: "10px 12px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: T.ts,
                    textAlign: "left",
                  }}
                >
                  デフォルト作業項目
                </th>
                <th
                  style={{
                    padding: "10px 12px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: T.ts,
                    width: "100px",
                  }}
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((pm) => (
                <tr
                  key={pm.id}
                  style={{ borderBottom: `1px solid ${T.bd}22` }}
                >
                  <td style={{ padding: "10px 12px", fontSize: "18px" }}>
                    {pm.icon}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: T.tx,
                    }}
                  >
                    {pm.name}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontSize: "12px",
                      color: T.ts,
                    }}
                  >
                    {(pm.defaultSubs || []).join(" ／ ")}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => openEdit(pm)}
                        style={{
                          background: "none",
                          border: "none",
                          color: T.ts,
                          cursor: "pointer",
                          opacity: 0.8,
                        }}
                        title="編集"
                      >
                        {Icons.edit}
                      </button>
                      <button
                        onClick={() => handleDelete(pm)}
                        style={{
                          background: "none",
                          border: "none",
                          color: T.dg,
                          cursor: "pointer",
                          opacity: 0.8,
                        }}
                        title="削除"
                      >
                        {Icons.trash}
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {addModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setAddModal(false)}
        >
          <div
            style={{
              background: T.bg,
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "420px",
              border: `1px solid ${T.bd}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 style={{ margin: "0 0 16px", fontSize: "16px", color: T.tx }}>
              工程追加
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <Inp
                label="アイコン"
                value={newForm.icon}
                onChange={(e) =>
                  setNewForm((f) => ({ ...f, icon: e.target.value }))
                }
                placeholder="📌"
              />
              <Inp
                label="工程名"
                value={newForm.name}
                onChange={(e) =>
                  setNewForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="例: 管きょ洗浄工"
              />
              <Inp
                label="デフォルト作業項目（1行またはカンマ区切り）"
                value={newForm.defaultSubs}
                onChange={(e) =>
                  setNewForm((f) => ({ ...f, defaultSubs: e.target.value }))
                }
                placeholder="高圧洗浄、汚泥回収、完了確認"
                type="textarea"
              />
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
                <Btn onClick={() => setAddModal(false)}>キャンセル</Btn>
                <Btn v="primary" onClick={handleAdd}>追加</Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setEditModal(null)}
        >
          <div
            style={{
              background: T.bg,
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "420px",
              border: `1px solid ${T.bd}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 style={{ margin: "0 0 16px", fontSize: "16px", color: T.tx }}>
              工程編集
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <Inp
                label="アイコン"
                value={editForm.icon}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, icon: e.target.value }))
                }
              />
              <Inp
                label="工程名"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
              />
              <Inp
                label="デフォルト作業項目（1行またはカンマ区切り）"
                value={editForm.defaultSubs}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, defaultSubs: e.target.value }))
                }
                type="textarea"
              />
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
                <Btn onClick={() => setEditModal(null)}>キャンセル</Btn>
                <Btn v="primary" onClick={handleUpdate}>更新</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
