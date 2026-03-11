"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, updatePassword } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/client";
import { T } from "@/lib/constants";
import { Btn } from "@/components/ui/primitives";
import AuthGuard from "@/components/AuthGuard";
import { loadData } from "@/lib/supabase/data";
import {
  createRemoteBackup,
  listRemoteBackups,
  restoreRemoteBackup,
  type RemoteBackupItem,
} from "@/lib/supabase/backup";

export default function SettingsPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const [backups, setBackups] = useState<RemoteBackupItem[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState("");
  const [backupSuccess, setBackupSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("新しいパスワードと確認用が一致しません。");
      return;
    }
    if (newPassword.length < 6) {
      setError("パスワードは6文字以上にしてください。");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email;
      if (!email) {
        setError("セッションが切れています。再度ログインしてください。");
        router.replace("/login");
        return;
      }

      await signIn(email, currentPassword);
      await updatePassword(newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Invalid login") || msg.includes("invalid")) {
        setError("現在のパスワードが正しくありません。");
      } else {
        setError(msg || "パスワードの変更に失敗しました。");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    listRemoteBackups().then(setBackups);
  }, []);

  const handleCreateBackup = async () => {
    setBackupError("");
    setBackupSuccess("");
    setBackupLoading(true);
    try {
      const data = await loadData();
      if (!data) {
        setBackupError("データの読み込みに失敗しました。");
        return;
      }
      const result = await createRemoteBackup(data);
      if (result.ok) {
        setBackupSuccess("バックアップを作成しました。");
        setBackups(await listRemoteBackups());
      } else {
        setBackupError(result.error);
      }
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : "バックアップの作成に失敗しました。");
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestore = async (item: RemoteBackupItem) => {
    if (!confirm(`「${new Date(item.created_at).toLocaleString("ja-JP")}」のバックアップを復元しますか？\n現在のデータは上書きされます。`)) return;
    setBackupError("");
    setBackupSuccess("");
    setBackupLoading(true);
    try {
      const result = await restoreRemoteBackup(item.data);
      if (result.ok) {
        setBackupSuccess("復元しました。トップページを再読み込みします。");
        setTimeout(() => router.replace("/"), 1500);
      } else {
        setBackupError(result.error);
      }
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : "復元に失敗しました。");
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <AuthGuard>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          background: T.bg,
          padding: "20px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "560px",
            padding: "32px",
            background: T.s,
            border: `1px solid ${T.bd}`,
            borderRadius: "16px",
          }}
        >
          <div style={{ marginBottom: "24px" }}>
            <h1
              style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: 700,
                color: T.tx,
              }}
            >
              ⚙️ 設定
            </h1>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: "13px",
                color: T.ts,
              }}
            >
              パスワード変更とデータバックアップの管理
            </p>
          </div>

          <div style={{ marginBottom: "20px", fontSize: "15px", fontWeight: 600, color: T.tx }}>🔐 パスワード変更</div>

          {success && (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px",
                background: T.ok + "18",
                border: `1px solid ${T.ok}44`,
                borderRadius: "8px",
                fontSize: "13px",
                color: T.ok,
              }}
            >
              パスワードを変更しました。
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: T.ts,
                  marginBottom: "6px",
                }}
              >
                現在のパスワード
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                minLength={6}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: T.bg,
                  border: `1px solid ${T.bd}`,
                  borderRadius: "8px",
                  color: T.tx,
                  fontSize: "14px",
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: T.ts,
                  marginBottom: "6px",
                }}
              >
                新しいパスワード
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                minLength={6}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: T.bg,
                  border: `1px solid ${T.bd}`,
                  borderRadius: "8px",
                  color: T.tx,
                  fontSize: "14px",
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: T.ts,
                  marginBottom: "6px",
                }}
              >
                新しいパスワード（確認）
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                minLength={6}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: T.bg,
                  border: `1px solid ${T.bd}`,
                  borderRadius: "8px",
                  color: T.tx,
                  fontSize: "14px",
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            {error && (
              <div
                style={{
                  marginBottom: "16px",
                  padding: "12px",
                  background: T.dg + "18",
                  border: `1px solid ${T.dg}44`,
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: T.dg,
                }}
              >
                {error}
              </div>
            )}
            <Btn
              type="submit"
              v="primary"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center", marginBottom: "12px" }}
            >
              {loading ? "変更中..." : "パスワードを変更"}
            </Btn>
          </form>

          <hr style={{ border: "none", borderTop: `1px solid ${T.bd}`, margin: "28px 0 20px" }} />

          <div style={{ marginBottom: "12px", fontSize: "15px", fontWeight: 600, color: T.tx }}>💾 データバックアップ（Supabase）</div>
          <p style={{ margin: "0 0 12px", fontSize: "13px", color: T.ts }}>
            現在のデータをリモートにバックアップします。復元すると現在のデータが上書きされます。
          </p>
          {backupSuccess && (
            <div
              style={{
                marginBottom: "12px",
                padding: "12px",
                background: T.ok + "18",
                border: `1px solid ${T.ok}44`,
                borderRadius: "8px",
                fontSize: "13px",
                color: T.ok,
              }}
            >
              {backupSuccess}
            </div>
          )}
          {backupError && (
            <div
              style={{
                marginBottom: "12px",
                padding: "12px",
                background: T.dg + "18",
                border: `1px solid ${T.dg}44`,
                borderRadius: "8px",
                fontSize: "13px",
                color: T.dg,
              }}
            >
              {backupError}
            </div>
          )}
          <Btn
            type="button"
            v="default"
            disabled={backupLoading}
            onClick={handleCreateBackup}
            style={{ width: "100%", justifyContent: "center", marginBottom: "16px" }}
          >
            {backupLoading ? "処理中..." : "今すぐバックアップを作成"}
          </Btn>

          <div style={{ fontSize: "13px", fontWeight: 600, color: T.ts, marginBottom: "8px" }}>バックアップ一覧（最大50件）</div>
          <div
            style={{
              maxHeight: "220px",
              overflowY: "auto",
              border: `1px solid ${T.bd}`,
              borderRadius: "8px",
              background: T.bg,
            }}
          >
            {backups.length === 0 ? (
              <div style={{ padding: "16px", fontSize: "13px", color: T.ts }}>バックアップがありません</div>
            ) : (
              backups.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderBottom: `1px solid ${T.bd}`,
                    gap: "12px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", color: T.tx }}>
                      {new Date(item.created_at).toLocaleString("ja-JP")}
                      {item.created_by && (
                        <span style={{ marginLeft: "8px", fontSize: "12px", color: T.ts }}>({item.created_by})</span>
                      )}
                    </div>
                    <div style={{ fontSize: "11px", color: T.ts }}>
                      案件 {item.summary.projects} / 原価 {item.summary.costs} / 数量 {item.summary.quantities}
                    </div>
                  </div>
                  <Btn
                    type="button"
                    v="ghost"
                    disabled={backupLoading}
                    onClick={() => handleRestore(item)}
                    style={{ flexShrink: 0 }}
                  >
                    復元
                  </Btn>
                </div>
              ))
            )}
          </div>

          <Link
            href="/"
            style={{
              display: "block",
              textAlign: "center",
              fontSize: "12px",
              color: T.ac,
              textDecoration: "none",
            }}
          >
            ← トップに戻る
          </Link>
        </div>
      </div>
    </AuthGuard>
  );
}
