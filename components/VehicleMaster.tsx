"use client";

import { useState } from "react";
import { T, Icons } from "@/lib/constants";
import { genId } from "@/lib/constants";
import type { Vehicle } from "@/lib/utils";
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
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
  </div>
);

export default function VehicleMaster({
  vehicles,
  onUpdate,
}: {
  vehicles: Vehicle[];
  onUpdate: (vehicles: Vehicle[]) => void;
}) {
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<Vehicle | null>(null);
  const [newReg, setNewReg] = useState("");
  const [editReg, setEditReg] = useState("");

  const handleAdd = () => {
    const reg = newReg.trim();
    if (!reg) return;
    onUpdate([
      ...vehicles,
      { id: genId(), registration: reg },
    ]);
    setNewReg("");
    setAddModal(false);
  };

  const handleUpdate = () => {
    if (!editModal) return;
    const reg = editReg.trim();
    if (!reg) return;
    onUpdate(
      vehicles.map((v) =>
        v.id === editModal.id ? { ...v, registration: reg } : v
      )
    );
    setEditModal(null);
    setEditReg("");
  };

  const handleDelete = (v: Vehicle) => {
    if (!confirm(`「${v.registration}」を車両マスタから削除しますか？\n\n※過去の案件に記録された使用実績は残ります。`)) return;
    onUpdate(vehicles.filter((x) => x.id !== v.id));
    if (editModal?.id === v.id) setEditModal(null);
  };

  const openEdit = (v: Vehicle) => {
    setEditModal(v);
    setEditReg(v.registration);
  };

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
            車両マスタ
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: T.ts }}>
            {vehicles.length}台登録（リース終了時は削除できます）
          </p>
        </div>
        <Btn v="primary" onClick={() => setAddModal(true)}>
          {Icons.plus} 車両追加
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
                  ナンバープレート
                </th>
                <th
                  style={{
                    padding: "10px 12px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: T.ts,
                    textAlign: "right",
                    width: "120px",
                  }}
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
          {vehicles.map((v) => (
            <tr key={v.id} style={{ borderBottom: `1px solid ${T.bd}44` }}>
              <td
                style={{
                  padding: "12px",
                  fontSize: "14px",
                  color: T.tx,
                  fontFamily: "monospace",
                }}
              >
                {v.registration}
              </td>
              <td
                style={{
                  padding: "8px",
                  display: "flex",
                  gap: "8px",
                  justifyContent: "flex-end",
                }}
              >
              <button
                onClick={() => openEdit(v)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: "none",
                  border: "none",
                  color: T.ts,
                  cursor: "pointer",
                  padding: "4px 8px",
                  fontSize: "12px",
                  opacity: 0.9,
                }}
                aria-label="編集"
                title="ナンバーを編集"
              >
                {Icons.edit} 編集
              </button>
              <button
                onClick={() => handleDelete(v)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: "none",
                  border: "none",
                  color: T.dg,
                  cursor: "pointer",
                  padding: "4px 8px",
                  fontSize: "12px",
                  opacity: 0.9,
                }}
                aria-label="削除"
                title="マスタから削除（過去の記録は残ります）"
              >
                {Icons.trash} 削除
              </button>
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
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,.7)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setAddModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: T.s,
              border: `1px solid ${T.bd}`,
              borderRadius: "16px",
              width: "min(420px, 92vw)",
              padding: "24px",
            }}
          >
            <h3 style={{ margin: "0 0 20px", fontSize: "17px", color: T.tx }}>
              車両追加
            </h3>
            <Inp
              label="ナンバープレート"
              placeholder="例: 堺 800 さ 1299"
              value={newReg}
              onChange={(e) => setNewReg(e.target.value)}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "20px",
              }}
            >
              <Btn onClick={() => setAddModal(false)}>キャンセル</Btn>
              <Btn v="primary" onClick={handleAdd}>
                追加
              </Btn>
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,.7)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setEditModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: T.s,
              border: `1px solid ${T.bd}`,
              borderRadius: "16px",
              width: "min(420px, 92vw)",
              padding: "24px",
            }}
          >
            <h3 style={{ margin: "0 0 20px", fontSize: "17px", color: T.tx }}>
              車両編集
            </h3>
            <Inp
              label="ナンバープレート"
              placeholder="例: 堺 800 さ 1299"
              value={editReg}
              onChange={(e) => setEditReg(e.target.value)}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "20px",
              }}
            >
              <Btn onClick={() => setEditModal(null)}>キャンセル</Btn>
              <Btn v="primary" onClick={handleUpdate}>
                更新
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
