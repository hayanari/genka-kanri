"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isAdminEmail } from "@/lib/supabase/admin";
import { T } from "@/lib/constants";
import AuthGuard from "@/components/AuthGuard";

type UserItem = { id: string; email: string; createdAt: string; lastSignInAt: string | null };

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setError("ログインしてください");
        setLoading(false);
        return;
      }
      if (!isAdminEmail(session.user.email)) {
        setError("このページにアクセスする権限がありません");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "取得に失敗しました");
          return;
        }
        setUsers(data.users ?? []);
      } catch (e) {
        setError("通信エラーが発生しました");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const handleDelete = async (userId: string) => {
    if (!confirm("このアカウントを削除しますか？この操作は取り消せません。")) return;
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    if (!isAdminEmail(session.user.email)) return;

    setDeleting(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "削除に失敗しました");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (s: string | null) => {
    if (!s) return "—";
    try {
      const d = new Date(s);
      return d.toLocaleString("ja-JP");
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
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: 720,
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
            }}
          >
            <Link
              href="/"
              style={{ color: T.ts, textDecoration: "none", fontSize: 14 }}
            >
              ← 案件管理に戻る
            </Link>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.tx }}>
              🔐 アカウント管理
            </h1>
          </div>

          <div style={{ padding: 20 }}>
            {loading && (
              <div style={{ color: T.ts, fontSize: 14 }}>読み込み中...</div>
            )}
            {error && (
              <div
                style={{
                  padding: 16,
                  background: T.dg + "18",
                  border: `1px solid ${T.dg}44`,
                  borderRadius: 8,
                  color: T.dg,
                  fontSize: 14,
                }}
              >
                {error}
              </div>
            )}
            {!loading && !error && (
              <div>
                <p style={{ fontSize: 13, color: T.ts, marginBottom: 16 }}>
                  登録済みアカウント一覧です。削除したアカウントは再度ログインできません。
                </p>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${T.bd}` }}>
                      <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 600, color: T.ts }}>
                        メールアドレス
                      </th>
                      <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 600, color: T.ts }}>
                        登録日時
                      </th>
                      <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 600, color: T.ts }}>
                        最終ログイン
                      </th>
                      <th style={{ width: 80 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr
                        key={u.id}
                        style={{ borderBottom: `1px solid ${T.bd}` }}
                      >
                        <td style={{ padding: "12px 8px", color: T.tx }}>
                          {u.email}
                        </td>
                        <td style={{ padding: "12px 8px", color: T.ts, fontSize: 12 }}>
                          {formatDate(u.createdAt)}
                        </td>
                        <td style={{ padding: "12px 8px", color: T.ts, fontSize: 12 }}>
                          {formatDate(u.lastSignInAt)}
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <button
                            onClick={() => handleDelete(u.id)}
                            disabled={!!deleting}
                            style={{
                              padding: "6px 12px",
                              fontSize: 12,
                              background: T.dg + "18",
                              color: T.dg,
                              border: `1px solid ${T.dg}44`,
                              borderRadius: 6,
                              cursor: deleting ? "not-allowed" : "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {deleting === u.id ? "削除中..." : "削除"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: T.ts, fontSize: 14 }}>
                    登録されているアカウントがありません
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
