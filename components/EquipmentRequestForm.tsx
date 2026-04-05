"use client";

import React, { useState } from "react";
import { genId } from "@/lib/constants";
import { Btn, Inp, Sel, Modal } from "@/components/ui/primitives";
import type { EquipmentRequest, EquipmentItem, ApprovalStep } from "@/lib/utils";

// ============================================================
// 定数
// ============================================================
const DEPARTMENTS = ["営業部", "総務部", "システム部", "企画部"];
const ITEM_TYPES = ["", "文具", "トナー", "印刷用紙", "その他"];
const UNITS = ["本", "個", "冊", "枚", "台", "箱", "その他"];
const CATEGORIES = ["備品", "消耗品"] as const;

/** サイボウズと同じ5ステップの承認経路 */
const DEFAULT_APPROVAL_STEPS: { role: string }[] = [
  { role: "リーダー" },
  { role: "課長" },
  { role: "部長（決裁）" },
  { role: "経理担当" },
  { role: "申請者本人" },
];

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: "下書き", color: "#9ca3af" },
  pending: { label: "申請中", color: "#f59e0b" },
  approved: { label: "承認済み", color: "#3b82f6" },
  rejected: { label: "否認", color: "#ef4444" },
  confirmed: { label: "確認完了", color: "#22c55e" },
};

// ============================================================
// ユーティリティ
// ============================================================
function calcTotals(items: EquipmentItem[]) {
  const subtotal = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
  const tax = Math.floor(subtotal * 0.1);
  return { subtotal, tax, total: subtotal + tax };
}

function emptyItem(): EquipmentItem {
  return {
    id: genId(),
    category: "備品",
    itemType: "",
    maker: "",
    productName: "",
    productCode: "",
    unitPrice: 0,
    quantity: 0,
    unit: "個",
  };
}

function initApprovalHistory(): ApprovalStep[] {
  return DEFAULT_APPROVAL_STEPS.map((s) => ({
    id: genId(),
    role: s.role,
    approverName: "",
    result: "" as const,
    comment: "",
    actedAt: "",
  }));
}

// ============================================================
// ステータスバッジ
// ============================================================
export function EquipmentStatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, color: "#9ca3af" };
  return (
    <span
      style={{
        background: s.color,
        color: "#fff",
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 12,
        fontWeight: 600,
        display: "inline-block",
      }}
    >
      {s.label}
    </span>
  );
}

// ============================================================
// Props
// ============================================================
interface Props {
  /** Phase 1 では未使用（空文字） */
  projectId?: string;
  /** 編集時は既存データを渡す。新規作成時は null */
  initial: EquipmentRequest | null;
  onSave: (req: EquipmentRequest) => void;
  onClose: () => void;
}

// ============================================================
// メインコンポーネント
// ============================================================
export default function EquipmentRequestForm({
  projectId = "",
  initial,
  onSave,
  onClose,
}: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [applicant, setApplicant] = useState(initial?.applicant ?? "");
  const [purchasePlannedDate, setPurchasePlannedDate] = useState(
    initial?.purchasePlannedDate ?? ""
  );
  const [items, setItems] = useState<EquipmentItem[]>(
    initial?.items ?? [emptyItem(), emptyItem(), emptyItem(), emptyItem()]
  );
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState<EquipmentRequest["status"]>(
    initial?.status ?? "draft"
  );
  const [approvalHistory, setApprovalHistory] = useState<ApprovalStep[]>(
    initial?.approvalHistory ?? initApprovalHistory()
  );
  const [activeTab, setActiveTab] = useState<"form" | "approval">("form");

  const { subtotal, tax, total } = calcTotals(items);

  function updateItem(index: number, patch: Partial<EquipmentItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function updateStep(index: number, patch: Partial<ApprovalStep>) {
    setApprovalHistory((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  }

  function handleSave() {
    if (!title.trim()) {
      alert("標題を入力してください");
      return;
    }
    if (!department) {
      alert("部署を選択してください");
      return;
    }
    if (!purchasePlannedDate) {
      alert("購入予定日を入力してください");
      return;
    }

    const req: EquipmentRequest = {
      id: initial?.id ?? genId(),
      projectId,
      title: title.trim(),
      department,
      applicant: applicant.trim(),
      appliedAt: initial?.appliedAt ?? new Date().toISOString().slice(0, 10),
      purchasePlannedDate,
      items,
      purpose: purpose.trim(),
      notes: notes.trim(),
      subtotal,
      tax,
      total,
      status,
      approvalHistory,
    };
    onSave(req);
  }

  const thStyle: React.CSSProperties = {
    padding: "6px 8px",
    background: "#f3f4f6",
    fontSize: 12,
    fontWeight: 600,
    textAlign: "left",
    borderBottom: "1px solid #e5e7eb",
    whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    padding: "4px 4px",
    borderBottom: "1px solid #f3f4f6",
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? `備品申請 編集: ${initial.title}` : "備品申請 新規作成"}
      w={860}
    >
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {(["form", "approval"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            style={{
              padding: "6px 16px",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              background: activeTab === t ? "#2563eb" : "#e5e7eb",
              color: activeTab === t ? "#fff" : "#374151",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            {t === "form" ? "📝 申請内容" : "✅ 進行状況"}
          </button>
        ))}
      </div>

      {activeTab === "form" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label
              style={{
                width: 100,
                fontWeight: 600,
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              標題 <span style={{ color: "red" }}>*</span>
            </label>
            <Inp
              value={title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setTitle(e.target.value)
              }
              placeholder="例: ノートパソコン"
              style={{ flex: 1 }}
            />
          </div>

          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
              <label
                style={{
                  width: 100,
                  fontWeight: 600,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                部署 <span style={{ color: "red" }}>*</span>
              </label>
              <Sel
                value={department}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setDepartment(e.target.value)
                }
                style={{ flex: 1 }}
              >
                <option value="">選んでください</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Sel>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
              <label
                style={{
                  width: 80,
                  fontWeight: 600,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                申請者
              </label>
              <Inp
                value={applicant}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setApplicant(e.target.value)
                }
                placeholder="氏名"
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label
              style={{
                width: 100,
                fontWeight: 600,
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              購入予定日 <span style={{ color: "red" }}>*</span>
            </label>
            <input
              type="date"
              value={purchasePlannedDate}
              onChange={(e) => setPurchasePlannedDate(e.target.value)}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 14,
              }}
            />
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              明細（最大4行）
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>区分</th>
                    <th style={thStyle}>品種</th>
                    <th style={thStyle}>メーカー</th>
                    <th style={thStyle}>商品名</th>
                    <th style={thStyle}>品番</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>購入単価</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>数量</th>
                    <th style={thStyle}>単位</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>小計</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={item.id}>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {CATEGORIES.map((cat) => (
                            <label
                              key={cat}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 2,
                                cursor: "pointer",
                                fontSize: 12,
                              }}
                            >
                              <input
                                type="radio"
                                name={`cat-${item.id}`}
                                value={cat}
                                checked={item.category === cat}
                                onChange={() => updateItem(i, { category: cat })}
                              />
                              {cat}
                            </label>
                          ))}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <Sel
                          value={item.itemType}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                            updateItem(i, { itemType: e.target.value })
                          }
                          style={{ minWidth: 80 }}
                        >
                          {ITEM_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t || "選んでください"}
                            </option>
                          ))}
                        </Sel>
                      </td>
                      <td style={tdStyle}>
                        <Inp
                          value={item.maker}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            updateItem(i, { maker: e.target.value })
                          }
                          style={{ minWidth: 70 }}
                          placeholder="メーカー"
                        />
                      </td>
                      <td style={tdStyle}>
                        <Inp
                          value={item.productName}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            updateItem(i, { productName: e.target.value })
                          }
                          style={{ minWidth: 100 }}
                          placeholder="商品名"
                        />
                      </td>
                      <td style={tdStyle}>
                        <Inp
                          value={item.productCode}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            updateItem(i, { productCode: e.target.value })
                          }
                          style={{ minWidth: 70 }}
                          placeholder="品番"
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          min={0}
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateItem(i, { unitPrice: Number(e.target.value) })
                          }
                          style={{
                            width: 90,
                            textAlign: "right",
                            border: "1px solid #d1d5db",
                            borderRadius: 4,
                            padding: "4px 6px",
                            fontSize: 13,
                          }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          min={0}
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(i, { quantity: Number(e.target.value) })
                          }
                          style={{
                            width: 60,
                            textAlign: "right",
                            border: "1px solid #d1d5db",
                            borderRadius: 4,
                            padding: "4px 6px",
                            fontSize: 13,
                          }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <Sel
                          value={item.unit}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                            updateItem(i, { unit: e.target.value })
                          }
                          style={{ minWidth: 60 }}
                        >
                          {UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </Sel>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                        ¥{(item.unitPrice * item.quantity).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 4,
                marginTop: 8,
              }}
            >
              <div style={{ fontSize: 13 }}>小計　¥{subtotal.toLocaleString()}</div>
              <div style={{ fontSize: 13 }}>消費税（10%）　¥{tax.toLocaleString()}</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                支払金額合計　¥{total.toLocaleString()}
              </div>
            </div>
          </div>

          <div>
            <label
              style={{
                fontWeight: 600,
                fontSize: 13,
                display: "block",
                marginBottom: 4,
              }}
            >
              利用目的
            </label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              placeholder="利用目的を入力してください"
              style={{
                width: "100%",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 14,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label
              style={{
                fontWeight: 600,
                fontSize: 13,
                display: "block",
                marginBottom: 4,
              }}
            >
              備考
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{
                width: "100%",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 14,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
              ステータス
            </label>
            <Sel
              value={status}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setStatus(e.target.value as EquipmentRequest["status"])
              }
            >
              <option value="draft">下書き</option>
              <option value="pending">申請中</option>
              <option value="approved">承認済み</option>
              <option value="rejected">否認</option>
              <option value="confirmed">確認完了</option>
            </Sel>
          </div>
        </div>
      )}

      {activeTab === "approval" && (
        <div>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
            サイボウズと同様の5ステップ承認経路です。各ステップの結果・承認者・日時を記録できます。
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>経路</th>
                <th style={thStyle}>役割</th>
                <th style={thStyle}>承認者名</th>
                <th style={thStyle}>結果</th>
                <th style={thStyle}>コメント</th>
                <th style={thStyle}>日時</th>
              </tr>
            </thead>
            <tbody>
              {approvalHistory.map((step, i) => (
                <tr key={step.id}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{step.role}</td>
                  <td style={tdStyle}>
                    <Inp
                      value={step.approverName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateStep(i, { approverName: e.target.value })
                      }
                      placeholder="氏名"
                      style={{ minWidth: 80 }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <Sel
                      value={step.result}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        updateStep(i, {
                          result: e.target.value as ApprovalStep["result"],
                          actedAt:
                            e.target.value && !step.actedAt
                              ? new Date().toISOString().slice(0, 10)
                              : step.actedAt,
                        })
                      }
                    >
                      <option value="">-</option>
                      <option value="approved">承認</option>
                      <option value="rejected">否認</option>
                      <option value="confirmed">確認</option>
                      <option value="pending">保留</option>
                    </Sel>
                  </td>
                  <td style={tdStyle}>
                    <Inp
                      value={step.comment}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateStep(i, { comment: e.target.value })
                      }
                      placeholder="コメント"
                      style={{ minWidth: 100 }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="date"
                      value={step.actedAt}
                      onChange={(e) => updateStep(i, { actedAt: e.target.value })}
                      style={{
                        border: "1px solid #d1d5db",
                        borderRadius: 4,
                        padding: "4px 6px",
                        fontSize: 12,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
        <Btn onClick={onClose} style={{ background: "#e5e7eb", color: "#374151" }}>
          キャンセル
        </Btn>
        <Btn v="primary" onClick={handleSave}>
          保存
        </Btn>
      </div>
    </Modal>
  );
}
