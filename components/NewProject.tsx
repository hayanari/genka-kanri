"use client";

import { useState } from "react";
import { genId, fmt } from "@/lib/constants";
import { STATUS_MAP } from "@/lib/constants";
import { T } from "@/lib/constants";
import type { Project } from "@/lib/utils";
import { Card, Btn, Inp, Sel, Txt } from "./ui/primitives";
import { Icons } from "@/lib/constants";

export default function NewProject({
  onSave,
  onCancel,
}: {
  onSave: (proj: Project) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    name: "",
    client: "",
    personInCharge: "",
    category: "工事",
    contractAmount: "",
    budget: "",
    status: "ordered",
    startDate: "",
    endDate: "",
    progress: 0,
    notes: "",
    billedAmount: 0,
    paidAmount: 0,
    payments: [] as { id: string; date: string; amount: number; note: string }[],
    changes: [] as {
      id: string;
      date: string;
      type: string;
      amount: number;
      description: string;
    }[],
    mode: "normal" as "normal" | "subcontract",
    marginRate: "",
    subcontractAmount: "",
    subcontractVendor: "",
  });

  const save = () => {
    if (!f.name?.trim()) {
      alert("案件名を入力してください");
      return;
    }
    if (!f.client?.trim()) {
      alert("顧客名を入力してください");
      return;
    }
    if (!f.contractAmount || Number(f.contractAmount) <= 0) {
      alert("受注額を入力してください（1以上の数値）");
      return;
    }
    const amt = Number(f.contractAmount);
    const mRate = Number(f.marginRate) || 0;
    onSave({
      ...f,
      id: genId(),
      contractAmount: amt,
      originalAmount: amt,
      budget:
        f.mode === "subcontract"
          ? 0
          : Number(f.budget) || Math.round(amt * 0.7),
      marginRate: mRate,
      subcontractAmount:
        f.mode === "subcontract"
          ? Number(f.subcontractAmount) || Math.round(amt * (1 - mRate / 100))
          : 0,
    });
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <Btn v="ghost" onClick={onCancel} sm>
          {Icons.back} 戻る
        </Btn>
        <h2 style={{ margin: 0, fontSize: "20px", color: T.tx }}>
          新規案件登録
        </h2>
      </div>
      <Card>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            maxWidth: "580px",
          }}
        >
          <Inp
            label="案件名 *"
            placeholder="例: ○○邸 新築工事"
            value={f.name}
            onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <Inp
              label="顧客名 *"
              placeholder="例: 山田太郎"
              value={f.client}
              onChange={(e) => setF((p) => ({ ...p, client: e.target.value }))}
            />
            <Sel
              label="区分"
              value={f.category}
              onChange={(e) => setF((p) => ({ ...p, category: e.target.value }))}
            >
              <option value="工事">工事</option>
              <option value="業務">業務</option>
            </Sel>
          </div>
          <Inp
            label="担当者"
            placeholder="例: 山田太郎"
            value={f.personInCharge}
            onChange={(e) => setF((p) => ({ ...p, personInCharge: e.target.value }))}
          />
          <div>
            <label
              style={{
                fontSize: "12px",
                color: T.ts,
                fontWeight: 500,
                marginBottom: "6px",
                display: "block",
              }}
            >
              施工形態 *
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setF((p) => ({ ...p, mode: "normal" }))}
                style={{
                  flex: 1,
                  padding: "14px",
                  borderRadius: "10px",
                  border: `2px solid ${f.mode === "normal" ? T.ac : T.bd}`,
                  background: f.mode === "normal" ? T.al : T.s2,
                  color: f.mode === "normal" ? T.ac : T.ts,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                🔧 自社施工
                <br />
                <span style={{ fontSize: "11px", fontWeight: 400, opacity: 0.7 }}>
                  材料・外注・人工を個別管理
                </span>
              </button>
              <button
                onClick={() => setF((p) => ({ ...p, mode: "subcontract" }))}
                style={{
                  flex: 1,
                  padding: "14px",
                  borderRadius: "10px",
                  border: `2px solid ${f.mode === "subcontract" ? T.wn : T.bd}`,
                  background: f.mode === "subcontract" ? T.wn + "15" : T.s2,
                  color: f.mode === "subcontract" ? T.wn : T.ts,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                📋 一括外注
                <br />
                <span style={{ fontSize: "11px", fontWeight: 400, opacity: 0.7 }}>
                  ％マージンで丸投げ
                </span>
              </button>
            </div>
          </div>

          <Inp
            label="受注額 (¥) *"
            type="number"
            placeholder="15000000"
            value={f.contractAmount}
            onChange={(e) =>
              setF((p) => ({ ...p, contractAmount: e.target.value }))
            }
          />

          {f.mode === "subcontract" ? (
            <>
              <div
                style={{
                  padding: "12px",
                  background: T.wn + "10",
                  borderRadius: "8px",
                  border: `1px solid ${T.wn}22`,
                  fontSize: "12px",
                  color: T.ts,
                }}
              >
                受注額の {f.marginRate || "?"}% を差し引き、¥
                {fmt(
                  Number(f.contractAmount) *
                    (1 - (Number(f.marginRate) || 0) / 100)
                )}{" "}
                を外注に出します。
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <Inp
                  label="マージン率 (%)"
                  type="number"
                  placeholder="例: 10"
                  value={f.marginRate}
                  onChange={(e) => {
                    const rate = Number(e.target.value);
                    setF((p) => ({
                      ...p,
                      marginRate: e.target.value,
                      subcontractAmount: String(
                        Math.round(
                          Number(p.contractAmount) * (1 - rate / 100)
                        )
                      ),
                    }));
                  }}
                />
                <Inp
                  label="外注額 (¥)"
                  type="number"
                  value={
                    f.subcontractAmount ||
                    (f.contractAmount
                      ? String(
                          Math.round(
                            Number(f.contractAmount) *
                              (1 - (Number(f.marginRate) || 0) / 100)
                          )
                        )
                      : "")
                  }
                  onChange={(e) =>
                    setF((p) => ({ ...p, subcontractAmount: e.target.value }))
                  }
                />
              </div>
              <Inp
                label="外注先"
                placeholder="例: ○○建設"
                value={f.subcontractVendor}
                onChange={(e) =>
                  setF((p) => ({ ...p, subcontractVendor: e.target.value }))
                }
              />
            </>
          ) : (
            <Inp
              label="実行予算 (¥)（空欄→受注額の70%）"
              type="number"
              placeholder="10500000"
              value={f.budget}
              onChange={(e) => setF((p) => ({ ...p, budget: e.target.value }))}
            />
          )}

          <Sel
            label="ステータス"
            value={f.status}
            onChange={(e) => setF((p) => ({ ...p, status: e.target.value }))}
          >
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Sel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <Inp
              label="開始日"
              type="date"
              value={f.startDate}
              onChange={(e) =>
                setF((p) => ({ ...p, startDate: e.target.value }))
              }
            />
            <Inp
              label="完了予定日"
              type="date"
              value={f.endDate}
              onChange={(e) =>
                setF((p) => ({ ...p, endDate: e.target.value }))
              }
            />
          </div>
          <Txt
            label="備考"
            placeholder="案件メモ"
            value={f.notes}
            onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "8px",
            }}
          >
            <Btn onClick={onCancel}>キャンセル</Btn>
            <Btn v="primary" onClick={save}>
              登録
            </Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}
