"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { signIn, signUp } from "@/lib/supabase/auth";
import { T } from "@/lib/constants";
import { Btn } from "@/components/ui/primitives";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [checking, setChecking] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!hasSupabaseConfig()) {
      setConfigError(
        "Supabase の環境変数が設定されていません。Vercel の Environment Variables で NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を追加してください。"
      );
      setChecking(false);
      return;
    }
    const check = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled && session?.user) {
          router.replace("/");
        }
      } catch (e) {
        if (!cancelled) {
          setConfigError("接続エラーが発生しました。しばらく経ってから再度お試しください。");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [router]);

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0e14",
          color: "#7c84a0",
          fontSize: "14px",
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
          padding: "20px",
        }}
      >
        <div
          style={{
            maxWidth: "480px",
            padding: "32px",
            background: T.s,
            border: `1px solid ${T.bd}`,
            borderRadius: "16px",
            color: T.tx,
            fontSize: "14px",
            lineHeight: 1.6,
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>⚠️ 設定が必要です</h2>
          <p style={{ margin: 0 }}>{configError}</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
        setError("登録完了。メール確認後、ログインしてください。");
        setIsSignUp(false);
      } else {
        await signIn(email, password);
        router.push("/");
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      const jaMsg =
        msg.includes("Invalid login") || msg.includes("invalid")
          ? "IDまたはパスワードが正しくありません。"
          : msg.includes("Email not confirmed")
            ? "メールアドレスの確認が完了していません。確認メールをご確認ください。"
            : msg
              ? msg
              : "ログインに失敗しました。ID・パスワードを確認してください。";
      setError(jaMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
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
        <div style={{ marginBottom: "24px", textAlign: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "20px",
              fontWeight: 700,
              color: T.tx,
            }}
          >
            📐 工事原価管理
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: "13px",
              color: T.ts,
            }}
          >
            ログインしてください
          </p>
        </div>

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
              ID（メールアドレス）
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="example@company.com"
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
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isSignUp ? "new-password" : "current-password"}
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
            {loading ? "処理中..." : isSignUp ? "新規登録" : "ログイン"}
          </Btn>
        </form>

        <button
          type="button"
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError("");
          }}
          style={{
            width: "100%",
            padding: "10px",
            background: "none",
            border: "none",
            color: T.ts,
            fontSize: "12px",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {isSignUp ? "ログイン画面に戻る" : "初回のみ：新規登録"}
        </button>
      </div>
    </div>
  );
}
