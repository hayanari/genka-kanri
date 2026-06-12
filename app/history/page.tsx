"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { T } from "@/lib/constants";
import AuthGuard from "@/components/AuthGuard";
import { fetchAuditLogs } from "@/lib/auditLog";
import type { AuditLogRow } from "@/lib/auditLog";

export default function HistoryPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLogRow[] | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetchAuditLogs(300).then((rows) => {
      setLogs(rows);
      setLoading(false);
    });
  }, []);

  const filtered = (logs ?? []).filter((l) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      l.user_email.toLowerCase().includes(f) ||
      l.action.toLowerCase().includes(f) ||
      l.detail.toLowerCase().includes(f)
    );
  });

  const formatDateTime = (s: string) => {
    try {
      return new Date(s).toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return s;
    }
  };

  return (
    <AuthGuard>
      <div
        style={{
          minHeight: "100vh",
          background: T.bg,
          fontFamily: "'Noto Sans JP', sans-serif",
          padding: "24px 16px",
        }}
      >
        <div
          style={{
            maxWidth: 860,
            margin: "0 auto",
            background: T.s,
            border: `1px solid ${T.bd}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: `1px solid ${T.bd}`,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Link href="/" style={{ color: T.ts, textDecoration: "none", fontSize: 14 }}>
              ← 案件管理に戻る
            </Link>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.tx }}>
              📜 変更履歴
            </h1>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="ユーザー・内容で絞り込み..."
              style={{
                marginLeft: "auto",
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${T.bd}`,
                fontSize: 13,
                fontFamily: "inherit",
                minWidth: 220,
              }}
            />
          </div>

          <div style={{ padding: 20 }}>
            {loading && <div style={{ color: T.ts, fontSize: 14 }}>読み込み中...</div>}
            {!loading && logs === null && (
              <div
                style={{
                  padding: 16,
                  background: "#fffbeb",
                  border: "1px solid #fcd34d",
                  borderRadius: 8,
                  color: "#92400e",
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              >
                変更履歴テーブルがまだ作成されていません。
                Supabase の SQL Editor で <code>supabase/features_upgrade.sql</code>{" "}
                を実行すると、ここに「誰がいつ何を変更したか」が記録されるようになります。
              </div>
            )}
            {!loading && logs !== null && filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: T.ts, fontSize: 14 }}>
                記録された変更はまだありません
              </div>
            )}
            {!loading && filtered.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filtered.map((l) => (
                  <div
                    key={l.id}
                    style={{
                      padding: "12px 14px",
                      background: T.s2,
                      borderRadius: 8,
                      border: `1px solid ${T.bd}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        flexWrap: "wrap",
                        alignItems: "baseline",
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: 12, color: T.ts }}>
                        {formatDateTime(l.created_at)}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.ac }}>
                        {l.user_email || "（不明なユーザー）"}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: T.al,
                          color: T.ac,
                          fontWeight: 600,
                        }}
                      >
                        {l.action}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: T.tx,
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                      }}
                    >
                      {l.detail}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
