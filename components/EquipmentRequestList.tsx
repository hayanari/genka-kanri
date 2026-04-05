"use client";

import { useMemo, useState } from "react";
import { T } from "@/lib/constants";
import { fmt } from "@/lib/constants";
import type { EquipmentRequest } from "@/lib/utils";
import { Card, Btn, Sel, Modal } from "@/components/ui/primitives";
import EquipmentRequestForm, { EquipmentStatusBadge } from "@/components/EquipmentRequestForm";

type StatusFilter = "all" | EquipmentRequest["status"];

interface Props {
  equipmentRequests: EquipmentRequest[];
  onUpdate: (reqs: EquipmentRequest[]) => void;
}

export default function EquipmentRequestList({ equipmentRequests, onUpdate }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EquipmentRequest | null>(null);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return equipmentRequests;
    return equipmentRequests.filter((r) => r.status === statusFilter);
  }, [equipmentRequests, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => (b.appliedAt || "").localeCompare(a.appliedAt || ""));
  }, [filtered]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (r: EquipmentRequest) => {
    setEditing(r);
    setFormOpen(true);
  };

  const handleSave = (req: EquipmentRequest) => {
    const exists = equipmentRequests.some((x) => x.id === req.id);
    const next = exists
      ? equipmentRequests.map((x) => (x.id === req.id ? req : x))
      : [...equipmentRequests, req];
    onUpdate(next);
    setFormOpen(false);
    setEditing(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    onUpdate(equipmentRequests.filter((x) => x.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, color: T.tx }}>備品申請</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <Sel
            label="ステータス"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            style={{ minWidth: 160 }}
          >
            <option value="all">全て</option>
            <option value="draft">下書き</option>
            <option value="pending">申請中</option>
            <option value="approved">承認済み</option>
            <option value="rejected">否認</option>
            <option value="confirmed">確認完了</option>
          </Sel>
          <Btn v="primary" type="button" onClick={openNew}>
            ＋ 備品申請
          </Btn>
        </div>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ background: T.s2, borderBottom: `1px solid ${T.bd}` }}>
                {["申請日", "標題", "部署", "申請者", "支払合計", "ステータス", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: h === "支払合計" ? "right" : "left",
                      padding: "12px 14px",
                      fontWeight: 600,
                      color: T.ts,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: "center", color: T.ts }}>
                    該当する申請がありません
                  </td>
                </tr>
              ) : (
                sorted.map((r) => (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: `1px solid ${T.bd}`,
                      background: T.s,
                    }}
                  >
                    <td style={{ padding: "10px 14px", color: T.tx, whiteSpace: "nowrap" }}>
                      {r.appliedAt || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", color: T.tx, maxWidth: 220 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</div>
                    </td>
                    <td style={{ padding: "10px 14px", color: T.ts }}>{r.department || "—"}</td>
                    <td style={{ padding: "10px 14px", color: T.ts }}>{r.applicant || "—"}</td>
                    <td
                      style={{
                        padding: "10px 14px",
                        textAlign: "right",
                        fontWeight: 600,
                        color: T.tx,
                        whiteSpace: "nowrap",
                      }}
                    >
                      ¥{fmt(r.total)}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <EquipmentStatusBadge status={r.status} />
                    </td>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Btn type="button" sm onClick={() => openEdit(r)}>
                          詳細・編集
                        </Btn>
                        <Btn
                          type="button"
                          sm
                          onClick={() => setDeleteTarget(r)}
                          style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}
                        >
                          削除
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {formOpen && (
        <EquipmentRequestForm
          initial={editing}
          onSave={handleSave}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}

      {deleteTarget && (
        <Modal
          open
          onClose={() => setDeleteTarget(null)}
          title="削除の確認"
          w={400}
        >
          <p style={{ margin: "0 0 16px", fontSize: 14, color: T.tx, lineHeight: 1.5 }}>
            「{deleteTarget.title}」を削除しますか？この操作は取り消せません。
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn type="button" onClick={() => setDeleteTarget(null)}>
              キャンセル
            </Btn>
            <Btn
              type="button"
              v="primary"
              onClick={confirmDelete}
              style={{ background: T.dg }}
            >
              削除する
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
