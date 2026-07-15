"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { T, SIDEBAR_ORG_LABEL } from "@/lib/constants";
import { clearTenantCache } from "@/lib/tenant";
import { Btn } from "@/components/ui/primitives";

export default function LoginPage() {
  const router = useRouter();
  const [companyCode, setCompanyCode] = useState("tokito");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!hasSupabaseConfig()) {
      setConfigError(
        "Supabase の環境変数が設定されていません。Supabase ダッシュボード（Project Settings → API）の Project URL と anon public キーを、ローカルならプロジェクト直下の .env.local に、Vercel なら Environment Variables に、NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY として設定し、開発サーバーを再起動してください。"
      );
      setChecking(false);
      return;
    }
    const check = async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled && session?.user) {
          router.replace("/");
        }
      } catch {
        if (!cancelled) {
          setConfigError("接続エラーが発生しました。しばらく経ってから再度お試しください。");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: T.bg,
          color: T.ts,
        }}
      >
        読み込み中...
      </div>
    );
  }

  if (configError) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: T.bg,
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 480,
            background: T.s,
            border: `1px solid ${T.bd}`,
            borderRadius: 12,
            padding: 24,
            color: T.tx,
          }}
        >
          <h2 style={{ marginTop: 0 }}>⚠️ 設定が必要です</h2>
          <p style={{ color: T.ts, lineHeight: 1.6 }}>{configError}</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyCode, loginId, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "ログインに失敗しました");
        return;
      }

      const supabase = createClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (sessionError) {
        setError(sessionError.message || "セッションの開始に失敗しました");
        return;
      }
      clearTenantCache();
      router.push("/");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
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
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: T.bg,
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: T.s,
          border: `1px solid ${T.bd}`,
          borderRadius: 16,
          padding: "32px 28px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: T.ts, marginBottom: 8 }}>{SIDEBAR_ORG_LABEL}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.tx }}>📐 案件管理</div>
          <div style={{ fontSize: 13, color: T.ts, marginTop: 8 }}>
            会社ID・ログインID・パスワードでログイン
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: T.ts, marginBottom: 6 }}>会社ID</div>
            <input
              type="text"
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value)}
              required
              autoComplete="organization"
              placeholder="tokito"
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block", marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: T.ts, marginBottom: 6 }}>ログインID</div>
            <input
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              autoComplete="username"
              placeholder="例: tanaka または 現行メール"
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block", marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: T.ts, marginBottom: 6 }}>パスワード</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              minLength={6}
              style={inputStyle}
            />
          </label>

          {error && (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 12px",
                borderRadius: 8,
                background: "#fef2f2",
                color: "#b91c1c",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <Btn type="submit" disabled={loading} style={{ width: "100%", padding: "12px 14px" }}>
            {loading ? "処理中..." : "ログイン"}
          </Btn>
        </form>

        <p style={{ marginTop: 18, fontSize: 11, color: T.ts, lineHeight: 1.6 }}>
          新規アカウントは管理者が発行します。自社（会社ID: tokito）の既存ユーザーは、ログインIDに
          従来のメールアドレス（例: tokito@tokito-co.jp）を入れてログインできます。
        </p>
      </div>
    </div>
  );
}
