"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

type CompanyItem = {
  company_code: string;
  name: string;
  isActive?: boolean;
  userCount?: number;
};

type CallerInfo = {
  isPlatformOwner: boolean;
  companyCode: string | null;
  companyRole?: string | null;
  canAccessAdmin: boolean;
};

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [companyFilter, setCompanyFilter] = useState("tokito");
  const [caller, setCaller] = useState<CallerInfo | null>(null);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resettingPw, setResettingPw] = useState<string | null>(null);
  const [roleSaving, setRoleSaving] = useState<string | null>(null);
  const [newLoginId, setNewLoginId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("editor");
  const [createCompanyCode, setCreateCompanyCode] = useState("tokito");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [newCompanyCode, setNewCompanyCode] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newOwnerPassword, setNewOwnerPassword] = useState("");
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [companyMsg, setCompanyMsg] = useState("");
  const [togglingCompany, setTogglingCompany] = useState<string | null>(null);

  const loadUsers = useCallback(async (token: string, company: string) => {
    const q =
      company && company !== "all" ? `?company=${encodeURIComponent(company)}` : "?company=all";
    const res = await fetch(`/api/admin/users${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "取得に失敗しました");
    setUsers(data.users ?? []);
    // システムオーナーは会社APIで件数・有効状態も取る
    if (data.caller?.isPlatformOwner) {
      try {
        const cRes = await fetch("/api/admin/companies", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const cData = await cRes.json();
        if (cRes.ok && Array.isArray(cData.companies)) {
          setCompanies(
            cData.companies.map(
              (c: {
                companyCode: string;
                name: string;
                isActive: boolean;
                userCount: number;
              }) => ({
                company_code: c.companyCode,
                name: c.name,
                isActive: c.isActive,
                userCount: c.userCount,
              })
            )
          );
        } else {
          setCompanies(data.companies ?? []);
        }
      } catch {
        setCompanies(data.companies ?? []);
      }
    } else {
      setCompanies(data.companies ?? []);
    }
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
        setForbidden(true);
        setError("このページにアクセスする権限がありません（会社管理者またはシステムオーナーが必要です）");
        setLoading(false);
        window.setTimeout(() => {
          router.replace("/");
        }, 1800);
        return;
      }

      setCaller({
        isPlatformOwner: me.isPlatformOwner,
        companyCode: me.companyCode,
        companyRole: me.companyRole,
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
    const result = await saveUserRole(u.id, role, u.companyCode);
    if (result.ok) {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
      clearRoleCache();
      if (accessToken) {
        try {
          await loadUsers(accessToken, companyFilter);
        } catch {
          /* 一覧再取得失敗でもローカル更新は維持 */
        }
      }
    } else {
      alert(result.error || "権限の保存に失敗しました。");
      if (accessToken) {
        try {
          await loadUsers(accessToken, companyFilter);
        } catch {
          /* ignore */
        }
      }
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

  const handleResetPassword = async (u: UserItem) => {
    if (!accessToken) return;
    if (u.isPlatformOwner && !caller?.isPlatformOwner) {
      alert("システムオーナーのパスワードは変更できません");
      return;
    }
    const label = u.loginId || u.email || u.id;
    const password = window.prompt(
      `${label} の新しいパスワードを入力してください（6文字以上）`
    );
    if (password === null) return;
    if (password.length < 6) {
      alert("パスワードは6文字以上で入力してください");
      return;
    }
    if (!confirm(`${label} のパスワードを再設定しますか？`)) return;

    setResettingPw(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/password`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "パスワードの再設定に失敗しました");
        return;
      }
      alert("パスワードを再設定しました。本人に新しいパスワードを伝えてください。");
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setResettingPw(null);
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

  const roleOptions = (
    caller?.isPlatformOwner || caller?.companyRole === "owner"
      ? (["viewer", "editor", "admin", "owner"] as UserRole[])
      : (["viewer", "editor", "admin"] as UserRole[])
  );

  const [signupsLoading, setSignupsLoading] = useState(false);
  const [signups, setSignups] = useState<
    {
      id: string;
      company_code: string;
      company_name: string;
      address: string;
      phone: string;
      contact_email: string;
      owner_name: string;
      owner_login_id?: string;
      status: string;
      review_note: string | null;
      created_at: string;
    }[]
  >([]);

  const loadSignups = useCallback(async () => {
    if (!accessToken) return;
    setSignupsLoading(true);
    try {
      const res = await fetch(`/api/admin/company-signups?status=pending`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "取得に失敗しました");
      setSignups(data.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setSignupsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (caller?.isPlatformOwner) void loadSignups();
  }, [caller?.isPlatformOwner, loadSignups]);

  const handleSignupAction = async (requestId: string, action: "approve" | "reject") => {
    if (!accessToken) return;
    const reviewNote = window.prompt(action === "reject" ? "却下理由（任意）" : "承認コメント（任意）") ?? "";
    try {
      const res = await fetch(`/api/admin/company-signups`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requestId, action, reviewNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "処理に失敗しました");
      await loadSignups();
      if (data.mailOk === false) {
        const pwLine = data.ownerPassword
          ? `\n初期パスワード（手渡し用）: ${data.ownerPassword}`
          : "";
        alert(
          `処理は完了しましたが、申込者へのメール送信に失敗しました。\n` +
            (data.mailError ? `詳細: ${data.mailError}\n` : "") +
            (data.contactEmail ? `宛先: ${data.contactEmail}` : "") +
            pwLine
        );
      } else {
        alert(action === "approve" ? "承認し、申込者へメール送信しました" : "却下し、申込者へメール送信しました");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "処理に失敗しました");
    }
  };

  const [deletingCompany, setDeletingCompany] = useState<string | null>(null);

  const handleCreateCompany = async () => {
    if (!accessToken) return;
    setCompanyMsg("");
    setCreatingCompany(true);
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyCode: newCompanyCode,
          name: newCompanyName,
          createOwner: true,
          ownerLoginId: "admin",
          ownerPassword: newOwnerPassword || undefined,
          ownerDisplayName: "管理者",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCompanyMsg(data.error ?? "作成に失敗しました");
        return;
      }
      const ow = data.owner;
      setCompanyMsg(
        ow
          ? `作成しました。会社ID=${data.company.companyCode} / ログインID=${ow.loginId} / 初期パスワード=${ow.password}`
          : data.warning
            ? `会社は作成しました（注意: ${data.warning}）`
            : `作成しました（${data.company.companyCode}）`
      );
      setNewCompanyCode("");
      setNewCompanyName("");
      setNewOwnerPassword("");
      setCompanyFilter(data.company.companyCode);
      setCreateCompanyCode(data.company.companyCode);
      await loadUsers(accessToken, data.company.companyCode);
    } catch {
      setCompanyMsg("通信エラーが発生しました");
    } finally {
      setCreatingCompany(false);
    }
  };

  const handleToggleCompanyActive = async (c: CompanyItem, nextActive: boolean) => {
    if (!accessToken) return;
    const label = nextActive ? "有効化" : "無効化（ログイン停止）";
    if (!confirm(`「${c.name}」（${c.company_code}）を${label}しますか？`)) return;
    setTogglingCompany(c.company_code);
    try {
      const res = await fetch(`/api/admin/companies/${encodeURIComponent(c.company_code)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "更新に失敗しました");
      setCompanies((prev) =>
        prev.map((x) =>
          x.company_code === c.company_code ? { ...x, isActive: nextActive } : x
        )
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setTogglingCompany(null);
    }
  };

  const handleDeleteCompany = async (c: CompanyItem) => {
    if (!accessToken || !caller?.isPlatformOwner) return;
    if (c.company_code === "tokito") {
      alert("基幹会社（tokito）は削除できません");
      return;
    }
    const typed = window.prompt(
      `会社「${c.name}」（${c.company_code}）を完全に削除します。\n` +
        `ユーザー・案件・スケジュール等も消えます。取り消せません。\n\n` +
        `削除するには会社ID「${c.company_code}」を入力してください。`
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== c.company_code.toLowerCase()) {
      alert("会社IDが一致しません。削除を中止しました。");
      return;
    }
    if (!confirm(`本当に「${c.name}」を削除しますか？`)) return;

    setDeletingCompany(c.company_code);
    try {
      const res = await fetch(`/api/admin/companies/${encodeURIComponent(c.company_code)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "削除に失敗しました");
      setCompanies((prev) => prev.filter((x) => x.company_code !== c.company_code));
      if (companyFilter === c.company_code) setCompanyFilter("all");
      if (createCompanyCode === c.company_code) {
        setCreateCompanyCode("tokito");
      }
      await loadUsers(accessToken, companyFilter === c.company_code ? "all" : companyFilter);
      alert(`削除しました（ユーザー ${data.deletedUsers ?? 0} 件）`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setDeletingCompany(null);
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
                {forbidden && (
                  <div style={{ marginTop: 8, fontSize: 12, color: T.ts }}>
                    案件管理へ戻ります…
                  </div>
                )}
              </div>
            )}
            {!loading && !error && (
              <div>
                {caller?.isPlatformOwner && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontWeight: 800, color: T.tx, marginBottom: 8 }}>企業登録申請（承認待ち）</div>
                    <div style={{ fontSize: 12, color: T.ts, marginBottom: 12 }}>
                      企業IDと連絡先を受け取り、オーナー（ログインID: admin）を自動作成して承認します。
                    </div>

                    <div style={{ display: "grid", gap: 12 }}>
                      {signupsLoading && <div style={{ fontSize: 13, color: T.ts }}>読み込み中...</div>}
                      {signups.length === 0 && !signupsLoading && (
                        <div style={{ padding: 14, border: `1px solid ${T.bd}`, borderRadius: 10, color: T.ts, fontSize: 13 }}>
                          承認待ちの申請はありません
                        </div>
                      )}
                      {signups.map((r) => (
                        <div
                          key={r.id}
                          style={{
                            padding: 14,
                            border: `1px solid ${T.bd}`,
                            borderRadius: 12,
                            background: T.bg,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontWeight: 800, color: T.tx }}>
                                {r.company_name}（{r.company_code}）
                              </div>
                              <div style={{ fontSize: 12, color: T.ts, marginTop: 4 }}>
                                オーナー: {r.owner_name} / 連絡先: {r.contact_email}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                onClick={() => void handleSignupAction(r.id, "approve")}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: "none",
                                  background: "#16a34a",
                                  color: "#fff",
                                  cursor: "pointer",
                                  fontWeight: 700,
                                  fontFamily: "inherit",
                                }}
                              >
                                承認
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleSignupAction(r.id, "reject")}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: "1px solid #dc2626",
                                  background: "#fef2f2",
                                  color: "#dc2626",
                                  cursor: "pointer",
                                  fontWeight: 700,
                                  fontFamily: "inherit",
                                }}
                              >
                                却下
                              </button>
                            </div>
                          </div>

                          <div style={{ marginTop: 10, fontSize: 12, color: T.ts, whiteSpace: "pre-line" }}>
                            住所: {r.address}
                            {"\n"}
                            電話: {r.phone}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {caller?.isPlatformOwner && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontWeight: 800, color: T.tx, marginBottom: 8 }}>
                      会社の追加・有効/無効
                    </div>
                    <div style={{ fontSize: 12, color: T.ts, marginBottom: 12 }}>
                      無効にした会社はログインできません（データは残ります）。削除は取り消しできません。
                    </div>

                    <div
                      style={{
                        marginBottom: 16,
                        padding: 14,
                        border: `1px solid ${T.bd}`,
                        borderRadius: 10,
                        background: T.bg,
                        display: "grid",
                        gap: 8,
                        maxWidth: 420,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13, color: T.tx }}>会社を追加</div>
                      <input
                        placeholder="会社ID（例: acme）"
                        value={newCompanyCode}
                        onChange={(e) => setNewCompanyCode(e.target.value)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: `1px solid ${T.bd}`,
                          fontFamily: "inherit",
                        }}
                      />
                      <input
                        placeholder="会社名"
                        value={newCompanyName}
                        onChange={(e) => setNewCompanyName(e.target.value)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: `1px solid ${T.bd}`,
                          fontFamily: "inherit",
                        }}
                      />
                      <input
                        type="password"
                        placeholder="初期オーナー(admin)のパスワード（空なら自動生成）"
                        value={newOwnerPassword}
                        onChange={(e) => setNewOwnerPassword(e.target.value)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: `1px solid ${T.bd}`,
                          fontFamily: "inherit",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void handleCreateCompany()}
                        disabled={creatingCompany || !newCompanyCode.trim() || !newCompanyName.trim()}
                        style={{
                          padding: "9px 12px",
                          borderRadius: 8,
                          border: "none",
                          background: T.ac,
                          color: "#fff",
                          fontWeight: 700,
                          cursor: creatingCompany ? "not-allowed" : "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {creatingCompany ? "作成中..." : "会社を追加（オーナー admin も作成）"}
                      </button>
                      {companyMsg && (
                        <div style={{ fontSize: 12, color: T.ts, whiteSpace: "pre-wrap" }}>
                          {companyMsg}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      {companies.map((c) => {
                        const active = c.isActive !== false;
                        return (
                          <div
                            key={c.company_code}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 12,
                              padding: "12px 14px",
                              border: `1px solid ${T.bd}`,
                              borderRadius: 10,
                              background: active ? T.bg : "#fef2f2",
                              flexWrap: "wrap",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, color: T.tx }}>
                                {c.name}{" "}
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: active ? "#15803d" : "#b91c1c",
                                    marginLeft: 6,
                                  }}
                                >
                                  {active ? "有効" : "無効"}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, color: T.ts }}>
                                {c.company_code}
                                {typeof c.userCount === "number" ? ` · ユーザー ${c.userCount}人` : ""}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                onClick={() => setCompanyFilter(c.company_code)}
                                style={{
                                  padding: "7px 12px",
                                  borderRadius: 8,
                                  border: `1px solid ${T.bd}`,
                                  background: "#fff",
                                  color: T.tx,
                                  cursor: "pointer",
                                  fontWeight: 600,
                                  fontFamily: "inherit",
                                  fontSize: 12,
                                }}
                              >
                                所属ユーザーを表示
                              </button>
                              {c.company_code !== "tokito" && (
                                <button
                                  type="button"
                                  onClick={() => void handleToggleCompanyActive(c, !active)}
                                  disabled={togglingCompany === c.company_code}
                                  style={{
                                    padding: "7px 12px",
                                    borderRadius: 8,
                                    border: `1px solid ${active ? "#b91c1c44" : "#15803d44"}`,
                                    background: active ? "#fef2f2" : "#f0fdf4",
                                    color: active ? "#b91c1c" : "#15803d",
                                    cursor: "pointer",
                                    fontWeight: 700,
                                    fontFamily: "inherit",
                                    fontSize: 12,
                                  }}
                                >
                                  {togglingCompany === c.company_code
                                    ? "更新中..."
                                    : active
                                      ? "無効化"
                                      : "有効化"}
                                </button>
                              )}
                              {c.company_code === "tokito" ? (
                                <span style={{ fontSize: 12, color: T.ts, alignSelf: "center" }}>
                                  基幹（削除・無効化不可）
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteCompany(c)}
                                  disabled={!!deletingCompany}
                                  style={{
                                    padding: "7px 12px",
                                    borderRadius: 8,
                                    border: `1px solid ${T.dg}44`,
                                    background: T.dg + "18",
                                    color: T.dg,
                                    cursor: deletingCompany ? "not-allowed" : "pointer",
                                    fontWeight: 700,
                                    fontFamily: "inherit",
                                    fontSize: 12,
                                  }}
                                >
                                  {deletingCompany === c.company_code ? "削除中..." : "削除"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {companies.length === 0 && (
                        <div style={{ fontSize: 13, color: T.ts }}>会社がありません</div>
                      )}
                    </div>
                  </div>
                )}

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
                      <th style={{ width: 160 }} />
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
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {u.isPlatformOwner && (
                              <span style={{ fontSize: 11, fontWeight: 600, color: "#7c3aed" }}>
                                システムオーナー
                              </span>
                            )}
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
                          </div>
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {(caller?.isPlatformOwner || !u.isPlatformOwner) && (
                              <button
                                type="button"
                                onClick={() => handleResetPassword(u)}
                                disabled={!!resettingPw}
                                style={{
                                  padding: "6px 10px",
                                  fontSize: 12,
                                  background: T.al,
                                  color: T.ac,
                                  border: `1px solid ${T.bd}`,
                                  borderRadius: 6,
                                  cursor: resettingPw ? "not-allowed" : "pointer",
                                  fontFamily: "inherit",
                                }}
                              >
                                {resettingPw === u.id ? "設定中..." : "PW再設定"}
                              </button>
                            )}
                            {!u.isPlatformOwner && (
                              <button
                                type="button"
                                onClick={() => handleDelete(u.id)}
                                disabled={!!deleting}
                                style={{
                                  padding: "6px 10px",
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
                          </div>
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
