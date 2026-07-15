"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { T } from "@/lib/constants";
import AuthGuard from "@/components/AuthGuard";
import { saveUserRole, ROLE_LABELS, clearRoleCache } from "@/lib/roles";
import type { UserRole } from "@/lib/roles";

type UserItem = {
  id: string;
  email: string;
  loginId: string;
  displayName: string;
  role: UserRole;
  companyCode: string;
  companyName: string;
  isPlatformOwner?: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
};

type CompanyItem = { company_code: string; name: string };

type CallerInfo = {
  isPlatformOwner: boolean;
  companyCode: string | null;
  canAccessAdmin: boolean;
};

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [companyFilter, setCompanyFilter] = useState("tokito");
  const [caller, setCaller] = useState<CallerInfo | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [roleSaving, setRoleSaving] = useState<string | null>(null);
  const [newLoginId, setNewLoginId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("editor");
  const [createCompanyCode, setCreateCompanyCode] = useState("tokito");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const loadUsers = useCallback(async (token: string, company: string) => {
    const q =
      company && company !== "all" ? `?company=${encodeURIComponent(company)}` : "?company=all";
    const res = await fetch(`/api/admin/users${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "取得に失敗しました");
    setUsers(data.users ?? []);
    setCompanies(data.companies ?? []);
    if (data.caller) setCaller(data.caller);
  }, []);

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setError("ログインしてください");
        setLoading(false);
        return;
      }

      const meRes = await fetch("/api/admin/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const me = await meRes.json();
      if (!meRes.ok || !me.canAccessAdmin) {
        setError("このページにアクセスする権限がありません（会社管理者またはシステムオーナーが必要です）");
        setLoading(false);
        return;
      }

      setCaller({
        isPlatformOwner: me.isPlatformOwner,
        companyCode: me.companyCode,
        canAccessAdmin: me.canAccessAdmin,
      });
      const initialCompany = me.isPlatformOwner
        ? companyFilter
        : me.companyCode || companyFilter;
      setCompanyFilter(initialCompany);
      setCreateCompanyCode(me.isPlatformOwner ? initialCompany : me.companyCode || "tokito");
      setAccessToken(session.access_token);

      try {
        await loadUsers(session.access_token, initialCompany);
      } catch (e) {
        setError(e instanceof Error ? e.message : "通信エラーが発生しました");
      } finally {
        setLoading(false);
      }
    };
    run();
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!accessToken || loading) return;
    let cancelled = false;
    (async () => {
      try {
        await loadUsers(accessToken, companyFilter);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "取得に失敗しました");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyFilter, accessToken, loadUsers, loading]);

  const handleRoleChange = async (u: UserItem, role: UserRole) => {
    setRoleSaving(u.id);
    const ok = await saveUserRole(u.id, role, u.companyCode);
    if (ok) {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
      clearRoleCache();
    } else {
      alert("権限の保存に失敗しました。");
    }
    setRoleSaving(null);
  };

  const handleCreateUser = async () => {
    setCreateMsg("");
    setCreating(true);
    try {
      if (!accessToken) {
        setCreateMsg("ログインしてください");
        return;
      }
      const res = await fetch("/api/admin/company-users", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyCode: createCompanyCode,
          loginId: newLoginId,
          password: newPassword,
          displayName: newDisplayName || newLoginId,
          role: newRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateMsg(data.error ?? "作成に失敗しました");
        return;
      }
      setCreateMsg(
        `作成しました。会社ID=${data.user.companyCode} / ログインID=${data.user.loginId}`
      );
      setNewLoginId("");
      setNewPassword("");
      setNewDisplayName("");
      setCompanyFilter(createCompanyCode);
      await loadUsers(accessToken, createCompanyCode);
    } catch {
      setCreateMsg("通信エラーが発生しました");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("このアカウントを削除しますか？この操作は取り消せません。")) return;
    if (!accessToken) return;

    setDeleting(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
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
      return new Date(s).toLocaleString("ja-JP");
    } catch {
      return s;
    }
  };

  const roleOptions = (caller?.isPlatformOwner
    ? (["viewer", "editor", "admin", "owner"] as UserRole[])
    : (["viewer", "editor", "admin"] as UserRole[]));

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
            maxWidth: 1000,
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
              🔐 アカウント管理
            </h1>
            {caller?.isPlatformOwner && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#fff",
                  background: "#7c3aed",
                  borderRadius: 999,
                  padding: "3px 10px",
                }}
              >
                システムオーナー
              </span>
            )}
            {!caller?.isPlatformOwner && caller?.companyCode && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: T.ac,
                  background: T.al,
                  borderRadius: 999,
                  padding: "3px 10px",
                }}
              >
                会社管理者（{caller.companyCode}）
              </span>
            )}
          </div>

          <div style={{ padding: 20 }}>
            {loading && <div style={{ color: T.ts, fontSize: 14 }}>読み込み中...</div>}
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
                <div
                  style={{
                    marginBottom: 24,
                    padding: 16,
                    border: `1px solid ${T.bd}`,
                    borderRadius: 8,
                    background: T.bg,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 8, color: T.tx }}>
                    ユーザーを発行
                  </div>
                  <p style={{ fontSize: 12, color: T.ts, marginTop: 0 }}>
                    会社ごとに管理者がユーザーを発行します。システムオーナーのみ全社を操作できます。
                  </p>
                  <div style={{ display: "grid", gap: 8, maxWidth: 380 }}>
                    <select
                      value={createCompanyCode}
                      disabled={!caller?.isPlatformOwner}
                      onChange={(e) => setCreateCompanyCode(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: `1px solid ${T.bd}`,
                        fontFamily: "inherit",
                      }}
                    >
                      {companies.map((c) => (
                        <option key={c.company_code} value={c.company_code}>
                          {c.name}（{c.company_code}）
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="ログインID（例: tanaka）"
                      value={newLoginId}
                      onChange={(e) => setNewLoginId(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: `1px solid ${T.bd}`,
                        fontFamily: "inherit",
                      }}
                    />
                    <input
                      placeholder="表示名（任意）"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: `1px solid ${T.bd}`,
                        fontFamily: "inherit",
                      }}
                    />
                    <input
                      type="password"
                      placeholder="初期パスワード（6文字以上）"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: `1px solid ${T.bd}`,
                        fontFamily: "inherit",
                      }}
                    />
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as UserRole)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: `1px solid ${T.bd}`,
                        fontFamily: "inherit",
                      }}
                    >
                      {roleOptions.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleCreateUser}
                      disabled={creating}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 6,
                        border: "none",
                        background: T.ac,
                        color: "#fff",
                        fontWeight: 600,
                        cursor: creating ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {creating ? "作成中..." : "ユーザーを作成"}
                    </button>
                    {createMsg && <div style={{ fontSize: 12, color: T.ts }}>{createMsg}</div>}
                  </div>
                </div>

                {caller?.isPlatformOwner && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 13, color: T.ts }}>会社で絞り込み</span>
                    <select
                      value={companyFilter}
                      onChange={(e) => setCompanyFilter(e.target.value)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: `1px solid ${T.bd}`,
                        fontFamily: "inherit",
                        fontSize: 13,
                      }}
                    >
                      <option value="all">すべて</option>
                      {companies.map((c) => (
                        <option key={c.company_code} value={c.company_code}>
                          {c.name}（{c.company_code}）
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <p style={{ fontSize: 13, color: T.ts, marginBottom: 16 }}>
                  会社管理者は自社ユーザーのみ操作できます。システムオーナーは全社を横断できます。
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
                        会社
                      </th>
                      <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 600, color: T.ts }}>
                        ログインID
                      </th>
                      <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 600, color: T.ts }}>
                        メール
                      </th>
                      <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 600, color: T.ts }}>
                        最終ログイン
                      </th>
                      <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 600, color: T.ts }}>
                        権限
                      </th>
                      <th style={{ width: 80 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={`${u.companyCode}-${u.id}`} style={{ borderBottom: `1px solid ${T.bd}` }}>
                        <td style={{ padding: "12px 8px", color: T.tx, fontSize: 12 }}>
                          <div style={{ fontWeight: 600 }}>{u.companyName || "—"}</div>
                          <div style={{ color: T.ts }}>{u.companyCode}</div>
                        </td>
                        <td style={{ padding: "12px 8px", color: T.tx }}>{u.loginId || "—"}</td>
                        <td style={{ padding: "12px 8px", color: T.tx, fontSize: 12 }}>
                          {u.email}
                          {u.isPlatformOwner && (
                            <div style={{ color: "#7c3aed", fontWeight: 600, marginTop: 2 }}>
                              システムオーナー
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 8px", color: T.ts, fontSize: 12 }}>
                          {formatDate(u.lastSignInAt)}
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          {u.isPlatformOwner ? (
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#7c3aed" }}>
                              （固定）
                            </span>
                          ) : (
                            <select
                              value={u.role || "editor"}
                              disabled={roleSaving === u.id}
                              onChange={(e) =>
                                handleRoleChange(u, e.target.value as UserRole)
                              }
                              style={{
                                padding: "6px 8px",
                                borderRadius: 6,
                                border: `1px solid ${T.bd}`,
                                fontSize: 12,
                                fontFamily: "inherit",
                                background: T.s,
                                color: T.tx,
                                cursor: "pointer",
                              }}
                            >
                              {roleOptions.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          {!u.isPlatformOwner && (
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
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: T.ts, fontSize: 14 }}>
                    この会社に登録されているアカウントがありません
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
