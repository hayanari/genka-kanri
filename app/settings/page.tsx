"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, updatePassword } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/client";
import { T } from "@/lib/constants";
import { Btn } from "@/components/ui/primitives";
import AuthGuard from "@/components/AuthGuard";

export default function SettingsPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

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

  return (
    <AuthGuard>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: T.bg,
          padding: "20px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "400px",
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
              🔐 パスワード変更
            </h1>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: "13px",
                color: T.ts,
              }}
            >
              現在のパスワードを入力し、新しいパスワードに変更してください。
            </p>
          </div>

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
