"use client";

// ================================================================
// components/ProcessMeetingTabs.tsx
// 工程会議ページのビュー切替:
//   帯ビュー（従来の工程会議ボード） / 横断工程表（日別）
// ================================================================
import React, { useState } from "react";
import Link from "next/link";
import ProcessMeetingBoard from "@/components/ProcessMeetingBoard";
import CrossScheduleBoard from "@/components/CrossScheduleBoard";

type TabKey = "band" | "cross";
const TAB_STORAGE_KEY = "process-meeting-tab";

export default function ProcessMeetingTabs() {
  // AuthGuard が認証完了までこのコンポーネントを描画しないため、
  // 初期値はクライアント側の localStorage から直接読める
  const [tab, setTab] = useState<TabKey>(() => {
    try {
      if (typeof window !== "undefined") {
        const s = localStorage.getItem(TAB_STORAGE_KEY);
        if (s === "cross" || s === "band") return s;
      }
    } catch {
      /* ignore */
    }
    return "band";
  });

  const selectTab = (t: TabKey) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  };

  const tabBtn = (t: TabKey, label: string, sub: string) => {
    const active = tab === t;
    return (
      <button
        type="button"
        onClick={() => selectTab(t)}
        style={{
          padding: "7px 16px",
          borderRadius: "8px 8px 0 0",
          border: "1px solid #d0d8e4",
          borderBottom: active ? "2px solid #fff" : "1px solid #d0d8e4",
          marginBottom: -1,
          background: active ? "#fff" : "#eef2f7",
          color: active ? "#1565c0" : "#4a6280",
          fontWeight: active ? 700 : 500,
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 13,
          lineHeight: 1.3,
          textAlign: "left",
        }}
      >
        <div>{label}</div>
        <div style={{ fontSize: 10, fontWeight: 400, color: active ? "#4a6280" : "#90a4ae" }}>{sub}</div>
      </button>
    );
  };

  return (
    <div style={{ fontFamily: "'Noto Sans JP', sans-serif", background: "#f5f7fa", minHeight: "100vh", color: "#1a2535" }}>
      <div
        className="process-meeting-no-print cross-no-print"
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 6,
          padding: "10px 16px 0",
          borderBottom: "1px solid #d0d8e4",
          background: "#eef2f7",
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: 12,
            color: "#4a6280",
            textDecoration: "none",
            padding: "4px 8px",
            borderRadius: 4,
            border: "1px solid #d0d8e4",
            background: "#fff",
            marginBottom: 8,
            marginRight: 6,
            whiteSpace: "nowrap",
          }}
        >
          ← 案件管理に戻る
        </Link>
        {tabBtn("band", "工程会議ボード", "工程 × 予定/実施の帯（10日区切り）")}
        {tabBtn("cross", "横断工程表", "案件 × 施工班 × 日別（エクセル形式）")}
      </div>
      {tab === "band" ? (
        <ProcessMeetingBoard />
      ) : (
        <div>
          <div
            className="cross-no-print"
            style={{
              background: "#fff",
              borderBottom: "2px solid #1565c0",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                background: "#1565c0",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 14,
                color: "#fff",
              }}
            >
              横
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>横断工程表</div>
              <div style={{ fontSize: 10, color: "#4a6280" }}>
                案件 × 施工班 × 日別 · セルにマーク（完・予・仕・雨…）とスパン番号を入力
              </div>
            </div>
          </div>
          <CrossScheduleBoard />
        </div>
      )}
    </div>
  );
}
