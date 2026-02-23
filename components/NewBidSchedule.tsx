"use client";

import { useState } from "react";
import { genId } from "@/lib/constants";
import { BID_SCHEDULE_STATUS } from "@/lib/constants";
import { T } from "@/lib/constants";
import type { BidSchedule } from "@/lib/utils";
import { Card, Btn, Inp, Sel } from "./ui/primitives";
import { Icons } from "@/lib/constants";

export default function NewBidSchedule({
  onSave,
  onCancel,
}: {
  onSave: (b: BidSchedule) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    name: "",
    client: "",
    category: "工事" as "工事" | "業務",
    bidDate: new Date().toISOString().slice(0, 10),
    status: "scheduled" as BidSchedule["status"],
    notes: "",
    orderAmount: "" as string | number,
    isUnitPriceContract: false,
  });

  const save = () => {
    if (!f.name?.trim()) {
      alert("案件名を入力してください");
      return;
    }
    if (!f.client?.trim()) {
      alert("発注者を入力してください");
      return;
    }
    const orderAmtNum =
      f.status === "won" || f.status === "expected"
        ? Number(f.orderAmount)
        : NaN;
    if (
      (f.status === "won" || f.status === "expected") &&
      !isNaN(orderAmtNum) &&
      orderAmtNum < 0
    ) {
      alert("金額は0以上で入力してください");
      return;
    }
    const finalOrderAmount: number | undefined =
      f.status === "won" || f.status === "expected"
        ? (!isNaN(orderAmtNum) ? orderAmtNum : undefined)
        : undefined;
    onSave({
      id: genId(),
      name: f.name,
      client: f.client,
      category: f.category,
      bidDate: f.bidDate,
      status: f.status,
      notes: f.notes || undefined,
      orderAmount: finalOrderAmount,
      isUnitPriceContract: f.isUnitPriceContract || undefined,
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
          入札スケジュール登録
        </h2>
      </div>
      <Card>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            maxWidth: "480px",
          }}
        >
          <Inp
            label="案件名 *"
            placeholder="例: ○○道路 路面清掃業務"
            value={f.name}
            onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))}
          />
          <Inp
            label="発注者 *"
            placeholder="例: 堺市"
            value={f.client}
            onChange={(e) => setF((p) => ({ ...p, client: e.target.value }))}
          />
          <Sel
            label="区分"
            value={f.category}
            onChange={(e) =>
              setF((p) => ({ ...p, category: e.target.value as "工事" | "業務" }))
            }
          >
            <option value="工事">工事</option>
            <option value="業務">業務</option>
          </Sel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <Inp
              label="入札日"
              type="date"
              value={f.bidDate}
              onChange={(e) => setF((p) => ({ ...p, bidDate: e.target.value }))}
            />
            <Sel
              label="ステータス"
              value={f.status}
              onChange={(e) =>
                setF((p) => ({
                  ...p,
                  status: e.target.value as BidSchedule["status"],
                }))
              }
            >
              {Object.entries(BID_SCHEDULE_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Sel>
          </div>
          {(f.status === "won" || f.status === "expected") && (
            <>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                  color: T.tx,
                }}
              >
                <input
                  type="checkbox"
                  checked={f.isUnitPriceContract}
                  onChange={(e) =>
                    setF((p) => ({ ...p, isUnitPriceContract: e.target.checked }))
                  }
                />
                単価契約（0円でも登録可）
              </label>
              <Inp
                label={f.status === "won" ? "落札金額 (¥) *" : "受注金額概算 (¥) *"}
                type="number"
                placeholder={f.isUnitPriceContract ? "単価契約の場合は0" : "例: 10000000"}
              value={String(f.orderAmount ?? "")}
              onChange={(e) =>
                setF((p) => ({ ...p, orderAmount: e.target.value }))
              }
            />
            </>
          )}
          {(f.status === "won" || f.status === "expected") && (
            <p style={{ margin: 0, fontSize: "12px", color: T.ts }}>
              {f.isUnitPriceContract
                ? "単価契約の場合は0円で登録できます。"
                : "案件一覧に追加する際の契約金額になります。"}
            </p>
          )}
          <Inp
            label="備考"
            placeholder="メモ"
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
            <Btn type="button" onClick={onCancel}>キャンセル</Btn>
            <Btn type="button" v="primary" onClick={save}>
              登録
            </Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}
