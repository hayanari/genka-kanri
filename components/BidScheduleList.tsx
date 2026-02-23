"use client";

import { useState } from "react";
import {
  BID_SCHEDULE_STATUS,
  Icons,
  fmt,
  fmtDate,
} from "@/lib/constants";
import type { BidSchedule } from "@/lib/utils";
import { Badge, Card, Btn } from "./ui/primitives";
import { T } from "@/lib/constants";

export default function BidScheduleList({
  bidSchedules,
  onAdd,
  onUpdate,
  onDelete,
  onAddToProjects,
}: {
  bidSchedules: BidSchedule[];
  onAdd: () => void;
  onUpdate: (b: BidSchedule) => void;
  onDelete: (id: string) => void;
  onAddToProjects: (b: BidSchedule) => void;
}) {
  const [sq, setSq] = useState("");
  const [sf, setSf] = useState("");
  const [sortBy, setSortBy] = useState<"date_asc" | "date_desc">("date_asc");
  const [editing, setEditing] = useState<BidSchedule | null>(null);

  const filtered = bidSchedules.filter((b) => {
    const ms = !sq || b.name.includes(sq) || b.client.includes(sq);
    const mf = !sf || b.status === sf;
    return ms && mf;
  });

  const sorted = [...filtered].sort((a, b) => {
    const diff =
      new Date(a.bidDate).getTime() - new Date(b.bidDate).getTime();
    return sortBy === "date_asc" ? diff : -diff;
  });

  const canAddToProjects = (b: BidSchedule) =>
    (b.status === "won" || b.status === "expected") && !b.projectId;

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "20px", color: T.tx }}>
          入札スケジュール一覧
        </h2>
        <Btn v="primary" onClick={onAdd} sm>
          {Icons.plus} 新規追加
        </Btn>
      </div>
      <Card>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: "180px",
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: T.ts,
              }}
            >
              {Icons.search}
            </span>
            <input
              type="text"
              placeholder="案件名・発注者で検索"
              value={sq}
              onChange={(e) => setSq(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 36px",
                background: T.s2,
                border: `1px solid ${T.bd}`,
                borderRadius: "8px",
                color: T.tx,
                fontSize: "13px",
                fontFamily: "inherit",
              }}
            />
          </div>
          <select
            value={sf}
            onChange={(e) => setSf(e.target.value)}
            style={{
              padding: "10px 14px",
              background: T.s2,
              border: `1px solid ${T.bd}`,
              borderRadius: "8px",
              color: T.tx,
              fontSize: "13px",
              fontFamily: "inherit",
              minWidth: "140px",
            }}
          >
            <option value="">全ステータス</option>
            {Object.entries(BID_SCHEDULE_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as "date_asc" | "date_desc")
            }
            style={{
              padding: "10px 14px",
              background: T.s2,
              border: `1px solid ${T.bd}`,
              borderRadius: "8px",
              color: T.tx,
              fontSize: "13px",
              fontFamily: "inherit",
            }}
          >
            <option value="date_asc">入札日：近い順</option>
            <option value="date_desc">入札日：遠い順</option>
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {sorted.length === 0 ? (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                color: T.ts,
                fontSize: "14px",
              }}
            >
              {bidSchedules.length === 0
                ? "入札スケジュールがありません。新規追加から登録してください。"
                : "該当する入札スケジュールがありません。"}
            </div>
          ) : (
            sorted.map((b) => (
              <div
                key={b.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "12px",
                  padding: "14px 16px",
                  background: T.s2,
                  borderRadius: "10px",
                  border: `1px solid ${T.bd}`,
                }}
              >
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <div style={{ fontWeight: 600, color: T.tx, marginBottom: "4px" }}>
                    {b.name}
                  </div>
                  <div style={{ fontSize: "12px", color: T.ts }}>
                    {b.client} ・ {b.category}
                    {(b.status === "won" || b.status === "expected") &&
                      b.orderAmount !== undefined &&
                      ` ・ ¥${fmt(b.orderAmount)}`}
                  </div>
                </div>
                <div style={{ fontSize: "13px", color: T.ts }}>
                  📅 {fmtDate(b.bidDate)}
                </div>
                <Badge status={b.status} map={BID_SCHEDULE_STATUS} />
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {canAddToProjects(b) && (
                    <Btn
                      type="button"
                      v="success"
                      sm
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToProjects(b);
                      }}
                    >
                      📋 案件一覧に追加
                    </Btn>
                  )}
                  {b.projectId && (
                    <span
                      style={{
                        fontSize: "11px",
                        color: T.ok,
                        fontWeight: 500,
                      }}
                    >
                      ✓ 案件追加済み
                    </span>
                  )}
                  <Btn v="ghost" sm onClick={() => setEditing(b)}>
                    {Icons.edit} 編集
                  </Btn>
                  <Btn
                    v="ghost"
                    sm
                    onClick={() => {
                      if (window.confirm(`「${b.name}」を削除してもよろしいですか？`)) {
                        onDelete(b.id);
                      }
                    }}
                  >
                    {Icons.trash} 削除
                  </Btn>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {editing && (
        <EditBidScheduleModal
          bid={editing}
          onSave={(updated) => {
            onUpdate(updated);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
          onAddToProjects={onAddToProjects}
        />
      )}
    </div>
  );
}

function EditBidScheduleModal({
  bid,
  onSave,
  onCancel,
  onAddToProjects,
}: {
  bid: BidSchedule;
  onSave: (b: BidSchedule) => void;
  onCancel: () => void;
  onAddToProjects?: (b: BidSchedule) => void;
}) {
  const [f, setF] = useState({
    ...bid,
    orderAmount: bid.orderAmount ?? 0,
    isUnitPriceContract: !!bid.isUnitPriceContract,
  });
  const canAdd = (f.status === "won" || f.status === "expected") && !f.projectId;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.s,
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "420px",
          width: "100%",
          border: `1px solid ${T.bd}`,
        }}
      >
        <h3 style={{ margin: "0 0 16px 0", color: T.tx }}>入札スケジュール編集</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <input
            placeholder="案件名"
            value={f.name}
            onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))}
            style={{
              padding: "10px 12px",
              background: T.s2,
              border: `1px solid ${T.bd}`,
              borderRadius: "8px",
              color: T.tx,
              fontSize: "13px",
            }}
          />
          <input
            placeholder="発注者"
            value={f.client}
            onChange={(e) => setF((p) => ({ ...p, client: e.target.value }))}
            style={{
              padding: "10px 12px",
              background: T.s2,
              border: `1px solid ${T.bd}`,
              borderRadius: "8px",
              color: T.tx,
              fontSize: "13px",
            }}
          />
          <div style={{ display: "flex", gap: "12px" }}>
            <select
              value={f.category}
              onChange={(e) =>
                setF((p) => ({ ...p, category: e.target.value as "工事" | "業務" }))
              }
              style={{
                flex: 1,
                padding: "10px 12px",
                background: T.s2,
                border: `1px solid ${T.bd}`,
                borderRadius: "8px",
                color: T.tx,
                fontSize: "13px",
              }}
            >
              <option value="工事">工事</option>
              <option value="業務">業務</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <input
              type="date"
              value={f.bidDate}
              onChange={(e) => setF((p) => ({ ...p, bidDate: e.target.value }))}
              style={{
                flex: 1,
                padding: "10px 12px",
                background: T.s2,
                border: `1px solid ${T.bd}`,
                borderRadius: "8px",
                color: T.tx,
                fontSize: "13px",
              }}
            />
            <select
              value={f.status}
              onChange={(e) =>
                setF((p) => ({
                  ...p,
                  status: e.target.value as BidSchedule["status"],
                }))
              }
              style={{
                flex: 1,
                padding: "10px 12px",
                background: T.s2,
                border: `1px solid ${T.bd}`,
                borderRadius: "8px",
                color: T.tx,
                fontSize: "13px",
              }}
            >
              {Object.entries(BID_SCHEDULE_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
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
          {(f.status === "won" || f.status === "expected") && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "12px", color: T.ts, fontWeight: 500 }}>
                {f.status === "won" ? "落札金額 (¥) *" : "受注金額概算 (¥) *"}
              </label>
              <input
                type="number"
                placeholder={f.isUnitPriceContract ? "単価契約の場合は0" : "例: 10000000"}
                value={f.orderAmount ?? ""}
                onChange={(e) =>
                  setF((p) => ({
                    ...p,
                    orderAmount: Number(e.target.value) ?? 0,
                  }))
                }
                style={{
                  padding: "10px 12px",
                  background: T.s2,
                  border: `1px solid ${T.bd}`,
                  borderRadius: "8px",
                  color: T.tx,
                  fontSize: "13px",
                }}
              />
            </div>
          )}
          <textarea
            placeholder="備考"
            value={f.notes || ""}
            onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))}
            rows={2}
            style={{
              padding: "10px 12px",
              background: T.s2,
              border: `1px solid ${T.bd}`,
              borderRadius: "8px",
              color: T.tx,
              fontSize: "13px",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
            {canAdd && onAddToProjects && (
              <Btn
                type="button"
                v="success"
                onClick={() => {
                  const orderVal =
                    typeof f.orderAmount === "number"
                      ? f.orderAmount
                      : Number(f.orderAmount);
                  const out: BidSchedule = {
                    ...f,
                    orderAmount: Number.isNaN(orderVal) ? 0 : orderVal,
                    isUnitPriceContract: f.isUnitPriceContract || undefined,
                  };
                  onAddToProjects(out);
                  onCancel();
                }}
              >
                📋 受注 → 案件一覧に追加
              </Btn>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <Btn type="button" v="ghost" onClick={onCancel} sm>
                キャンセル
              </Btn>
              <Btn
                type="button"
                v="primary"
                onClick={() => {
                  const orderVal =
                    typeof f.orderAmount === "number"
                      ? f.orderAmount
                      : Number(f.orderAmount);
                  const out: BidSchedule = {
                    ...f,
                    orderAmount:
                      f.status === "won" || f.status === "expected"
                        ? (Number.isNaN(orderVal) ? 0 : orderVal)
                        : undefined,
                    isUnitPriceContract: f.isUnitPriceContract || undefined,
                  };
                  onSave(out);
                }}
                sm
              >
                保存
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
