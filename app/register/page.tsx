"use client";

import Link from "next/link";
import { useState } from "react";
import { T } from "@/lib/constants";
import { normalizeCompanyCode } from "@/lib/tenant";

export default function RegisterPage() {
  const [companyCode, setCompanyCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: `1px solid ${T.bd}`,
    borderRadius: 8,
    fontFamily: "inherit",
    fontSize: 14,
    boxSizing: "border-box",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const res = await fetch("/api/company-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCode: normalizeCompanyCode(companyCode),
          companyName,
          ownerName,
          address,
          phone,
          contactEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "送信に失敗しました");
        return;
      }
      setMessage(
        `承認依頼を受け付けました。審査結果は ${contactEmail} に連絡します。` +
          (data.confirmMailOk
            ? `\n受付確認メールを ${contactEmail} へ送信しました。`
            : `\n※受付確認メールの送信に失敗しました（申込自体は保存済み）。`) +
          (data.ownerMailOk
            ? `\nシステムオーナー（${data.ownerEmail ?? "hayanari316@gmail.com"}）へも通知しました。`
            : `\n※オーナー通知メールの送信に失敗しました。`) +
          (data.mailError ? `\n詳細: ${data.mailError}` : "")
      );
      setCompanyCode("");
      setCompanyName("");
      setOwnerName("");
      setAddress("");
      setPhone("");
      setContactEmail("");
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        display: "flex",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 640, background: T.s, border: `1px solid ${T.bd}`, borderRadius: 14, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <h1 style={{ margin: 0, color: T.tx, fontSize: 22 }}>企業登録申込</h1>
          <Link href="/login" style={{ color: T.ac, textDecoration: "none", fontSize: 13 }}>
            ログインへ戻る
          </Link>
        </div>
        <p style={{ marginTop: 0, color: T.ts, fontSize: 13, lineHeight: 1.6 }}>
          必要事項を入力して承認依頼を送信してください。申込内容は
          <a href="mailto:hayanari316@gmail.com" style={{ color: T.ac, marginLeft: 4 }}>
            hayanari316@gmail.com
          </a>
          に通知され、承認後に会社オーナー（ログインID: admin）が自動作成されます。
        </p>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <label>
            <div style={{ fontSize: 12, color: T.ts, marginBottom: 4 }}>希望する企業ID（半角英数字）</div>
            <input
              required
              value={companyCode}
              onChange={(e) => setCompanyCode(normalizeCompanyCode(e.target.value))}
              placeholder="例: abc-kensetsu"
              style={inputStyle}
            />
          </label>
          <label>
            <div style={{ fontSize: 12, color: T.ts, marginBottom: 4 }}>企業名</div>
            <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={inputStyle} />
          </label>
          <label>
            <div style={{ fontSize: 12, color: T.ts, marginBottom: 4 }}>会社オーナー氏名</div>
            <input required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} style={inputStyle} />
          </label>
          <label>
            <div style={{ fontSize: 12, color: T.ts, marginBottom: 4 }}>住所</div>
            <input required value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} />
          </label>
          <label>
            <div style={{ fontSize: 12, color: T.ts, marginBottom: 4 }}>電話番号</div>
            <input required value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
          </label>
          <label>
            <div style={{ fontSize: 12, color: T.ts, marginBottom: 4 }}>承認結果の受信用メールアドレス</div>
            <input
              required
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              style={inputStyle}
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "11px 12px",
              borderRadius: 8,
              border: "none",
              fontFamily: "inherit",
              fontWeight: 700,
              color: "#fff",
              background: saving ? "#94a3b8" : T.ac,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "送信中..." : "承認依頼を送信"}
          </button>
        </form>
        {error && <div style={{ marginTop: 10, fontSize: 13, color: "#b91c1c" }}>{error}</div>}
        {message && <div style={{ marginTop: 10, fontSize: 13, color: "#166534", whiteSpace: "pre-line" }}>{message}</div>}
      </div>
    </div>
  );
}
